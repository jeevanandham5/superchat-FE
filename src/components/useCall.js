import { useCallback, useEffect, useRef, useState } from "react";

// STUN finds a direct route; strict networks (many mobile carriers) also need
// a TURN relay. The backend's /ice-servers hands out short-lived TURN
// credentials; REACT_APP_TURN_* adds a fixed relay of your own.
const STATIC_ICE_SERVERS = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ...(process.env.REACT_APP_TURN_URL
    ? [
        {
          urls: process.env.REACT_APP_TURN_URL.split(","),
          username: process.env.REACT_APP_TURN_USERNAME,
          credential: process.env.REACT_APP_TURN_CREDENTIAL,
        },
      ]
    : []),
];

const RING_TIMEOUT_MS = 30000;
const ICE_REFRESH_MS = 60 * 60 * 1000;
// a blocked network can leave ICE stuck in "new" forever, so give up after this
const CONNECT_TIMEOUT_MS = 20000;

async function fetchIceServers(baseUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/ice-servers`, {
      signal: controller.signal,
    });
    const { iceServers, relay } = await res.json();
    if (!Array.isArray(iceServers) || !iceServers.length) throw new Error("empty");
    return {
      servers: [...iceServers, ...STATIC_ICE_SERVERS.slice(1)],
      relay: !!relay || STATIC_ICE_SERVERS.length > 1,
    };
  } catch {
    // older backend or network hiccup: calls still work on friendly networks
    return { servers: STATIC_ICE_SERVERS, relay: STATIC_ICE_SERVERS.length > 1 };
  } finally {
    clearTimeout(timer);
  }
}

const VIDEO_CONSTRAINTS = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
};

export const canCall = () =>
  !!(navigator.mediaDevices?.getUserMedia && window.RTCPeerConnection);

export const canShareScreen = () =>
  !!navigator.mediaDevices?.getDisplayMedia &&
  !window.matchMedia("(pointer: coarse)").matches;

// a soft two-tone ring made with WebAudio, so there's no asset to load
function startRingtone() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return () => {};
  const ctx = new AudioCtx();
  const ring = () => {
    [0, 0.45].forEach((offset) => {
      const t = ctx.currentTime + offset;
      [523.25, 659.25].forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.08, t + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.4);
      });
    });
    navigator.vibrate?.([200, 100, 200]);
  };
  ring();
  const timer = setInterval(ring, 2200);
  return () => {
    clearInterval(timer);
    navigator.vibrate?.(0);
    ctx.close?.();
  };
}

function useCall({ socket, room, onNotice }) {
  const [callState, setCallState] = useState({ active: false, participants: [] });
  const [inCall, setInCall] = useState(false);
  const [joining, setJoining] = useState(false);
  const [incoming, setIncoming] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(true);
  const [sharing, setSharing] = useState(false);
  // without a TURN relay, calls on mobile data often can't connect
  const [relay, setRelay] = useState(true);
  const [peerStatus, setPeerStatus] = useState({});
  const failNoticeRef = useRef(false);
  const [facing, setFacing] = useState("user");

  const pcsRef = useRef(new Map());
  const queuedIceRef = useRef(new Map());
  const localRef = useRef(null);
  const cameraTrackRef = useRef(null);
  const screenTrackRef = useRef(null);
  const mediaStateRef = useRef({ muted: false, cameraOff: true, screen: false });
  const inCallRef = useRef(false);
  const callStateRef = useRef({ active: false, participants: [] });
  const [screenStream, setScreenStream] = useState(null);
  const iceRef = useRef({ servers: STATIC_ICE_SERVERS, loadedAt: 0, pending: null });
  const noticeRef = useRef(onNotice);
  noticeRef.current = onNotice;

  const emitMedia = (patch) => {
    mediaStateRef.current = { ...mediaStateRef.current, ...patch };
    socket.emit("call:media", mediaStateRef.current);
  };

  const sendSignal = useCallback(
    (to, data) => socket.emit("call:signal", { to, data }),
    [socket]
  );

  // the video track peers should currently see: screen share wins over camera
  const outgoingVideo = () => screenTrackRef.current || cameraTrackRef.current;

  const createPeer = useCallback(
    (id) => {
      pcsRef.current.get(id)?.close();
      const pc = new RTCPeerConnection({ iceServers: iceRef.current.servers });
      const remote = new MediaStream();

      pc.onicecandidate = (e) => {
        if (e.candidate) sendSignal(id, { candidate: e.candidate });
      };
      pc.ontrack = (e) => {
        remote.addTrack(e.track);
        // a new stream object, so effects keyed on it (level meter) see the track
        setRemoteStreams((s) => ({ ...s, [id]: new MediaStream(remote.getTracks()) }));
      };
      const markFailed = () => {
        setPeerStatus((st) => ({ ...st, [id]: "failed" }));
        if (!failNoticeRef.current) {
          failNoticeRef.current = true;
          noticeRef.current?.({
            toast: "Couldn't connect the call. This network may block calls, try Wi-Fi.",
          });
        }
      };
      const connectTimer = setTimeout(() => {
        if (pc.connectionState !== "connected" && pc.connectionState !== "closed") {
          markFailed();
        }
      }, CONNECT_TIMEOUT_MS);
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected" || pc.connectionState === "closed") {
          clearTimeout(connectTimer);
        }
        if (pc.connectionState === "failed") markFailed();
        else setPeerStatus((st) => ({ ...st, [id]: pc.connectionState }));
        if (pc.connectionState === "failed" && pc.localDescription?.type === "offer") {
          // the side that offered drives an ICE restart
          pc.createOffer({ iceRestart: true })
            .then((offer) => pc.setLocalDescription(offer))
            .then(() => sendSignal(id, { sdp: pc.localDescription }))
            .catch(() => {});
        }
      };
      pcsRef.current.set(id, pc);
      setRemoteStreams((s) => ({ ...s, [id]: remote }));
      return pc;
    },
    [sendSignal]
  );

  const loadIceServers = useCallback(() => {
    const ice = iceRef.current;
    if (ice.pending) return ice.pending;
    if (ice.loadedAt && Date.now() - ice.loadedAt < ICE_REFRESH_MS) {
      return Promise.resolve(ice.servers);
    }
    ice.pending = fetchIceServers(socket.io.uri).then(({ servers, relay: hasRelay }) => {
      iceRef.current = { servers, loadedAt: Date.now(), pending: null };
      setRelay(hasRelay);
      return servers;
    });
    return ice.pending;
  }, [socket]);

  // fetch early so answering a ring isn't slowed down by it
  useEffect(() => {
    loadIceServers();
  }, [loadIceServers]);

  const flushIce = async (id, pc) => {
    const queued = queuedIceRef.current.get(id) || [];
    queuedIceRef.current.delete(id);
    for (const candidate of queued) {
      await pc.addIceCandidate(candidate).catch(() => {});
    }
  };

  const closePeer = useCallback((id) => {
    pcsRef.current.get(id)?.close();
    pcsRef.current.delete(id);
    queuedIceRef.current.delete(id);
    setPeerStatus((st) => {
      const next = { ...st };
      delete next[id];
      return next;
    });
    setRemoteStreams((s) => {
      const next = { ...s };
      delete next[id];
      return next;
    });
  }, []);

  const cleanup = useCallback(() => {
    pcsRef.current.forEach((pc) => pc.close());
    pcsRef.current.clear();
    queuedIceRef.current.clear();
    localRef.current?.getTracks().forEach((t) => t.stop());
    screenTrackRef.current?.stop();
    localRef.current = null;
    cameraTrackRef.current = null;
    screenTrackRef.current = null;
    inCallRef.current = false;
    setLocalStream(null);
    setRemoteStreams({});
    setPeerStatus({});
    failNoticeRef.current = false;
    setInCall(false);
    setSharing(false);
    setScreenStream(null);
  }, []);

  const hangUp = useCallback(() => {
    if (inCallRef.current) socket.emit("call:leave");
    cleanup();
  }, [socket, cleanup]);

  // leaving the room (unmount) ends the call
  useEffect(() => () => hangUp(), [hangUp]);

  const join = useCallback(
    async (kind) => {
      if (inCallRef.current || joining) return;
      if (!canCall()) {
        noticeRef.current?.({ toast: "Calls aren't supported in this browser." });
        return;
      }
      setJoining(true);
      setIncoming(null);
      const wantVideo = kind === "video";
      const iceReady = loadIceServers();
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: wantVideo ? { ...VIDEO_CONSTRAINTS, facingMode: "user" } : false,
        });
      } catch (err) {
        setJoining(false);
        noticeRef.current?.({ toast: err?.name === "NotAllowedError"
            ? `Allow ${wantVideo ? "camera and microphone" : "microphone"} access to join the call.`
            : "Couldn't access your microphone or camera." });
        return;
      }

      await iceReady;
      localRef.current = stream;
      cameraTrackRef.current = stream.getVideoTracks()[0] || null;
      setLocalStream(stream);
      setMuted(false);
      setCameraOff(!cameraTrackRef.current);
      setFacing("user");
      mediaStateRef.current = { muted: false, cameraOff: !cameraTrackRef.current, screen: false };
      inCallRef.current = true;
      setInCall(true);

      socket.emit("call:join", { kind, ...mediaStateRef.current }, async (res) => {
        setJoining(false);
        if (res?.error) {
          noticeRef.current?.({ toast: res.error });
          cleanup();
          return;
        }
        // offer to everyone already in the call; both an audio and a video
        // transceiver are always created so the camera can be switched on
        // later with replaceTrack, without renegotiating
        for (const peer of res.participants) {
          const pc = createPeer(peer.id);
          const audio = stream.getAudioTracks()[0];
          pc.addTransceiver(audio || "audio", { direction: "sendrecv", streams: [stream] });
          pc.addTransceiver(outgoingVideo() || "video", { direction: "sendrecv", streams: [stream] });
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          sendSignal(peer.id, { sdp: pc.localDescription });
        }
      });
    },
    [socket, joining, createPeer, sendSignal, cleanup, loadIceServers]
  );

  useEffect(() => {
    const onState = (state) => {
      const prev = callStateRef.current;
      if (!prev.active && state.active) {
        noticeRef.current?.({
          system: `${state.startedBy || "Someone"} started a ${
            state.kind === "video" ? "video" : "voice"
          } call`,
        });
      }
      if (prev.active && !state.active) {
        const secs = Math.round((Date.now() - (prev.startedAt || Date.now())) / 1000);
        const m = Math.floor(secs / 60);
        noticeRef.current?.({
          system: `Call ended · ${m}:${String(secs % 60).padStart(2, "0")}`,
        });
        setIncoming(null);
      }
      callStateRef.current = state;
      setCallState(state);
    };

    const onRing = ({ username, kind }) => {
      if (inCallRef.current) return;
      setIncoming({ username, kind, at: Date.now() });
    };

    const onSignal = async ({ from, data }) => {
      if (!inCallRef.current) return;
      try {
        if (data.sdp?.type === "offer") {
          // a repeat offer from a known peer is an ICE restart, keep its connection
          const existing = pcsRef.current.get(from);
          const pc = existing?.remoteDescription ? existing : createPeer(from);
          await pc.setRemoteDescription(data.sdp);
          const stream = localRef.current;
          // answer on the transceivers the offer created
          pc.getTransceivers().forEach((t) => {
            const kind = t.receiver.track.kind;
            const track = kind === "audio" ? stream?.getAudioTracks()[0] : outgoingVideo();
            t.direction = "sendrecv";
            if (track) t.sender.replaceTrack(track);
            if (stream) t.sender.setStreams?.(stream);
          });
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignal(from, { sdp: pc.localDescription });
          await flushIce(from, pc);
        } else if (data.sdp?.type === "answer") {
          const pc = pcsRef.current.get(from);
          if (pc && pc.signalingState === "have-local-offer") {
            await pc.setRemoteDescription(data.sdp);
            await flushIce(from, pc);
          }
        } else if (data.candidate) {
          const pc = pcsRef.current.get(from);
          if (pc?.remoteDescription) {
            await pc.addIceCandidate(data.candidate).catch(() => {});
          } else {
            const queue = queuedIceRef.current.get(from) || [];
            queue.push(data.candidate);
            queuedIceRef.current.set(from, queue);
          }
        }
      } catch (err) {
        console.warn("call signal failed", err);
      }
    };

    const onPeerLeft = ({ id }) => closePeer(id);
    const onDeclined = ({ username }) =>
      noticeRef.current?.({ toast: `${username} declined the call` });

    socket.on("call:state", onState);
    socket.on("call:ring", onRing);
    socket.on("call:signal", onSignal);
    socket.on("call:peer-left", onPeerLeft);
    socket.on("call:declined", onDeclined);
    return () => {
      socket.off("call:state", onState);
      socket.off("call:ring", onRing);
      socket.off("call:signal", onSignal);
      socket.off("call:peer-left", onPeerLeft);
      socket.off("call:declined", onDeclined);
    };
  }, [socket, room, createPeer, closePeer, sendSignal]);

  // ring until answered, declined, or 30s pass
  useEffect(() => {
    if (!incoming) return;
    const stop = startRingtone();
    const timeout = setTimeout(() => setIncoming(null), RING_TIMEOUT_MS);
    return () => {
      stop();
      clearTimeout(timeout);
    };
  }, [incoming]);

  // don't leave a caller waiting forever when nobody picks up
  const alone = inCall && callState.participants.length <= 1;
  useEffect(() => {
    if (!alone) return;
    const t = setTimeout(() => {
      hangUp();
      noticeRef.current?.({ toast: "No one joined the call" });
    }, 45000);
    return () => clearTimeout(t);
  }, [alone, hangUp]);

  const decline = useCallback(() => {
    setIncoming(null);
    socket.emit("call:decline");
  }, [socket]);

  const replaceVideo = (track) => {
    pcsRef.current.forEach((pc) => {
      pc.getTransceivers()
        .filter((t) => t.receiver.track.kind === "video")
        .forEach((t) => t.sender.replaceTrack(track).catch(() => {}));
    });
  };

  const toggleMute = () => {
    const next = !muted;
    localRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
    emitMedia({ muted: next });
  };

  const getCamera = (facingMode) =>
    navigator.mediaDevices
      .getUserMedia({ video: { ...VIDEO_CONSTRAINTS, facingMode } })
      .then((s) => s.getVideoTracks()[0]);

  const toggleCamera = async () => {
    const stream = localRef.current;
    if (!stream) return;
    if (!cameraOff) {
      // stop the track so the camera light goes off
      const track = cameraTrackRef.current;
      if (track) {
        track.stop();
        stream.removeTrack(track);
      }
      cameraTrackRef.current = null;
      if (!screenTrackRef.current) replaceVideo(null);
      setCameraOff(true);
      setLocalStream(new MediaStream(stream.getTracks()));
      emitMedia({ cameraOff: true });
      return;
    }
    try {
      const track = await getCamera(facing);
      cameraTrackRef.current = track;
      stream.addTrack(track);
      if (!screenTrackRef.current) replaceVideo(track);
      setCameraOff(false);
      setLocalStream(new MediaStream(stream.getTracks()));
      emitMedia({ cameraOff: false });
    } catch {
      noticeRef.current?.({ toast: "Couldn't turn on the camera." });
    }
  };

  const flipCamera = async () => {
    const stream = localRef.current;
    const old = cameraTrackRef.current;
    if (!stream || !old) return;
    const nextFacing = facing === "user" ? "environment" : "user";
    try {
      old.stop();
      const track = await getCamera(nextFacing);
      stream.removeTrack(old);
      stream.addTrack(track);
      cameraTrackRef.current = track;
      if (!screenTrackRef.current) replaceVideo(track);
      setFacing(nextFacing);
      setLocalStream(new MediaStream(stream.getTracks()));
    } catch {
      noticeRef.current?.({ toast: "Couldn't switch camera." });
    }
  };

  const stopShare = useCallback(() => {
    screenTrackRef.current?.stop();
    screenTrackRef.current = null;
    replaceVideo(cameraTrackRef.current);
    setSharing(false);
    setScreenStream(null);
    emitMedia({ screen: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleShare = async () => {
    if (sharing) return stopShare();
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = display.getVideoTracks()[0];
      track.onended = stopShare;
      screenTrackRef.current = track;
      replaceVideo(track);
      setSharing(true);
      setScreenStream(display);
      emitMedia({ screen: true });
    } catch {
      /* picker dismissed */
    }
  };

  return {
    callState,
    inCall,
    joining,
    incoming,
    localStream,
    remoteStreams,
    muted,
    cameraOff,
    sharing,
    screenStream,
    relay,
    peerStatus,
    join,
    hangUp,
    decline,
    toggleMute,
    toggleCamera,
    flipCamera,
    toggleShare,
  };
}

export default useCall;
