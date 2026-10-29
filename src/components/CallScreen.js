import React, { useEffect, useRef, useState } from "react";
import Avatar from "./Avatar";
import { canShareScreen } from "./useCall";
import { formatDuration } from "./VoicePlayer";
import {
  FlipCameraIcon,
  MicIcon,
  MicOffIcon,
  MinimizeIcon,
  PhoneIcon,
  PhoneOffIcon,
  ScreenIcon,
  VideoIcon,
  VideoOffIcon,
} from "./Icons";

let levelCtx;
const getLevelCtx = () => {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!levelCtx || levelCtx.state === "closed") levelCtx = new AudioCtx();
  return levelCtx;
};

// true while the stream's audio is above a speaking threshold
function useSpeaking(stream, enabled = true) {
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    if (!stream || !enabled) return;
    let source;
    let timer;
    const setup = () => {
      if (source || !stream.getAudioTracks().length) return;
      const ctx = getLevelCtx();
      if (!ctx) return;
      ctx.resume?.();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      timer = setInterval(() => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += ((v - 128) / 128) ** 2;
        setSpeaking(Math.sqrt(sum / data.length) > 0.04);
      }, 150);
    };
    setup();
    stream.addEventListener("addtrack", setup);
    return () => {
      stream.removeEventListener("addtrack", setup);
      clearInterval(timer);
      source?.disconnect();
      setSpeaking(false);
    };
  }, [stream, enabled]);
  return speaking;
}

function StreamVideo({ stream, mirrored, contain }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      className={[mirrored ? "mirrored" : "", contain ? "contain" : ""].join(" ")}
    />
  );
}

// remote audio lives outside the tiles so it keeps playing when minimised
function StreamAudio({ stream }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);
  return <audio ref={ref} autoPlay />;
}

// phones and mobile data are where calls without a TURN relay tend to fail
const onMobileNetwork = () =>
  navigator.connection?.type === "cellular" ||
  window.matchMedia("(pointer: coarse)").matches;

function Tile({ name, label = name, stream, showVideo, muted, screen, mirrored, small, status }) {
  const speaking = useSpeaking(stream, !muted);
  // the local tile has no status; remote ones start out with none until ICE moves
  const statusText = small
    ? null
    : status === "failed"
    ? "Couldn't connect. Try Wi-Fi."
    : status === "disconnected"
    ? "Reconnecting…"
    : !status || status === "new" || status === "connecting"
    ? "Connecting…"
    : null;
  return (
    <div className={`call-tile ${speaking ? "speaking" : ""} ${small ? "small" : ""}`}>
      {statusText && (
        <div className={`call-tile-status ${status === "failed" ? "failed" : ""}`}>
          {statusText}
        </div>
      )}
      {showVideo && stream ? (
        <StreamVideo stream={stream} mirrored={mirrored} contain={screen} />
      ) : (
        <div className="call-tile-avatar">
          <span className="call-avatar-ring">
            <Avatar name={name} size={small ? 48 : 88} />
          </span>
        </div>
      )}
      <div className="call-tile-label">
        {muted && <MicOffIcon size={14} />}
        <span>{label}</span>
        {screen && <em>· sharing screen</em>}
      </div>
    </div>
  );
}

function CallScreen({ call, selfId, username, room }) {
  const [minimized, setMinimized] = useState(false);
  const [now, setNow] = useState(Date.now());
  const { callState } = call;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const others = callState.participants.filter((p) => p.id !== selfId);
  const elapsed = callState.startedAt ? (now - callState.startedAt) / 1000 : 0;
  const isTouch = window.matchMedia("(pointer: coarse)").matches;
  const localShowsVideo = call.sharing || !call.cameraOff;

  const audio = others.map((p) =>
    call.remoteStreams[p.id] ? (
      <StreamAudio key={p.id} stream={call.remoteStreams[p.id]} />
    ) : null
  );

  if (minimized) {
    return (
      <>
        {audio}
        <button type="button" className="call-pill" onClick={() => setMinimized(false)}>
          <span className="call-pill-dot" />
          <PhoneIcon size={16} />
          <span>
            {others.length ? `In call · ${formatDuration(elapsed)}` : "Calling…"}
          </span>
          <strong>Return</strong>
        </button>
      </>
    );
  }

  const cols = others.length <= 1 ? 1 : others.length <= 4 ? 2 : 3;

  return (
    <div className="call-screen" role="dialog" aria-label="Call">
      {audio}
      <header className="call-top">
        <button type="button" className="call-round ghost" onClick={() => setMinimized(true)}
          aria-label="Back to chat">
          <MinimizeIcon size={18} />
        </button>
        <div className="call-title">
          <strong>#{room}</strong>
          <span>
            {others.length
              ? `${formatDuration(elapsed)} · ${others.length + 1} in call`
              : callState.kind === "video" ? "Video calling…" : "Calling…"}
          </span>
        </div>
        <span className="call-round placeholder" />
      </header>

      <div className="call-stage">
        {others.length === 0 ? (
          <div className="call-waiting">
            {localShowsVideo && (
              <div className="call-waiting-bg">
                <StreamVideo
                  stream={call.screenStream || call.localStream}
                  mirrored={!call.sharing}
                />
              </div>
            )}
            <span className="call-avatar-ring pulsing">
              <Avatar name={room} size={104} />
            </span>
            <h2>#{room}</h2>
            <p>Waiting for others to join…</p>
          </div>
        ) : (
          <div className="call-grid" style={{ "--cols": cols }} data-count={others.length}>
            {others.map((p) => (
              <Tile
                key={p.id}
                name={p.username || "Guest"}
                stream={call.remoteStreams[p.id]}
                showVideo={!p.cameraOff || p.screen}
                muted={p.muted}
                screen={p.screen}
                status={call.peerStatus[p.id]}
              />
            ))}
          </div>
        )}

        {others.length > 0 && (
          <div className="call-self">
            <Tile
              name={username}
              label={`${username} (you)`}
              stream={call.sharing ? call.screenStream : call.localStream}
              showVideo={localShowsVideo}
              muted={call.muted}
              mirrored={!call.sharing}
              small
            />
          </div>
        )}
      </div>

      {!call.relay && onMobileNetwork() && (
        <p className="call-hint">
          Calls work best on Wi-Fi. On mobile data they may not connect.
        </p>
      )}

      <div className="call-controls">
        <button
          type="button"
          className={`call-round ${call.muted ? "off" : ""}`}
          onClick={call.toggleMute}
          aria-label={call.muted ? "Unmute" : "Mute"}
          aria-pressed={call.muted}
        >
          {call.muted ? <MicOffIcon size={22} /> : <MicIcon size={22} />}
        </button>
        <button
          type="button"
          className={`call-round ${call.cameraOff ? "off" : ""}`}
          onClick={call.toggleCamera}
          aria-label={call.cameraOff ? "Turn camera on" : "Turn camera off"}
          aria-pressed={!call.cameraOff}
        >
          {call.cameraOff ? <VideoOffIcon size={22} /> : <VideoIcon size={22} />}
        </button>
        {isTouch && !call.cameraOff && (
          <button type="button" className="call-round" onClick={call.flipCamera}
            aria-label="Switch camera">
            <FlipCameraIcon size={22} />
          </button>
        )}
        {canShareScreen() && (
          <button
            type="button"
            className={`call-round ${call.sharing ? "on" : ""}`}
            onClick={call.toggleShare}
            aria-label={call.sharing ? "Stop sharing" : "Share screen"}
            aria-pressed={call.sharing}
          >
            <ScreenIcon size={22} />
          </button>
        )}
        <button type="button" className="call-round end" onClick={call.hangUp}
          aria-label="End call">
          <PhoneOffIcon size={24} />
        </button>
      </div>
    </div>
  );
}

export function IncomingCall({ incoming, onAccept, onDecline }) {
  const video = incoming.kind === "video";
  return (
    <div className="incoming" role="alertdialog" aria-label="Incoming call">
      <span className="call-avatar-ring pulsing">
        <Avatar name={incoming.username} size={52} />
      </span>
      <div className="incoming-text">
        <strong>{incoming.username}</strong>
        <span>Incoming {video ? "video" : "voice"} call…</span>
      </div>
      <div className="incoming-actions">
        <button type="button" className="call-round end small" onClick={onDecline}
          aria-label="Decline">
          <PhoneOffIcon size={20} />
        </button>
        {video && (
          <button type="button" className="call-round accept small"
            onClick={() => onAccept("audio")} aria-label="Answer with audio only">
            <PhoneIcon size={20} />
          </button>
        )}
        <button type="button" className="call-round accept small"
          onClick={() => onAccept(incoming.kind)}
          aria-label={video ? "Answer with video" : "Answer"}>
          {video ? <VideoIcon size={20} /> : <PhoneIcon size={20} />}
        </button>
      </div>
    </div>
  );
}

export default CallScreen;
