import { useCallback, useEffect, useRef, useState } from "react";

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/webm",
  "audio/ogg;codecs=opus",
];

const pickMime = () =>
  window.MediaRecorder
    ? MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) || ""
    : "";

export const canRecord = () =>
  !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

// records a voice note and exposes a live input level for the meter
function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState("");

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef(null);
  const rafRef = useRef(null);
  const audioCtxRef = useRef(null);
  const resolveRef = useRef(null);

  const cleanup = useCallback(() => {
    clearInterval(timerRef.current);
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close?.();
    streamRef.current = null;
    audioCtxRef.current = null;
    recorderRef.current = null;
    setRecording(false);
    setElapsed(0);
    setLevel(0);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickMime();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const duration = (Date.now() - startedAtRef.current) / 1000;
        const type = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        resolveRef.current?.({ blob, duration, mime: type });
        resolveRef.current = null;
        cleanup();
      };
      recorderRef.current = recorder;
      recorder.start(250);

      startedAtRef.current = Date.now();
      setRecording(true);
      timerRef.current = setInterval(
        () => setElapsed((Date.now() - startedAtRef.current) / 1000),
        200
      );

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (const v of data) sum += ((v - 128) / 128) ** 2;
          setLevel(Math.min(Math.sqrt(sum / data.length) * 4, 1));
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
      }
      return true;
    } catch (err) {
      setError(
        err?.name === "NotAllowedError"
          ? "Microphone access was blocked. Allow it in your browser settings."
          : "Couldn't start the microphone."
      );
      cleanup();
      return false;
    }
  }, [cleanup]);

  // resolves with the recording, or null when cancelled
  const stop = useCallback(
    () =>
      new Promise((resolve) => {
        const recorder = recorderRef.current;
        if (!recorder || recorder.state === "inactive") return resolve(null);
        resolveRef.current = resolve;
        recorder.stop();
      }),
    []
  );

  const cancel = useCallback(() => {
    const recorder = recorderRef.current;
    resolveRef.current = null;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = cleanup;
      recorder.stop();
    } else {
      cleanup();
    }
  }, [cleanup]);

  return { recording, elapsed, level, error, setError, start, stop, cancel };
}

export default useVoiceRecorder;
