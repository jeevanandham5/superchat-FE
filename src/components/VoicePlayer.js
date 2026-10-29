import React, { useEffect, useRef, useState } from "react";
import { PauseIcon, PlayIcon } from "./Icons";

const BAR_COUNT = 36;

export const formatDuration = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

// reduce the decoded audio to a handful of peak heights for the waveform
async function computePeaks(url) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  const ctx = new AudioCtx();
  try {
    const buffer = await fetch(url).then((r) => r.arrayBuffer());
    const audio = await ctx.decodeAudioData(buffer);
    const data = audio.getChannelData(0);
    const block = Math.floor(data.length / BAR_COUNT) || 1;
    const peaks = [];
    for (let i = 0; i < BAR_COUNT; i++) {
      let max = 0;
      for (let j = i * block; j < (i + 1) * block && j < data.length; j++) {
        max = Math.max(max, Math.abs(data[j]));
      }
      peaks.push(max);
    }
    const top = Math.max(...peaks) || 1;
    return { peaks: peaks.map((p) => p / top), duration: audio.duration };
  } catch {
    return null;
  } finally {
    ctx.close?.();
  }
}

// placeholder bars while decoding, or when the browser can't decode
const fallbackPeaks = Array.from(
  { length: BAR_COUNT },
  (_, i) => 0.35 + 0.3 * Math.abs(Math.sin(i * 1.7))
);

function VoicePlayer({ src, duration: knownDuration, label }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [current, setCurrent] = useState(0);
  const [peaks, setPeaks] = useState(fallbackPeaks);
  const [duration, setDuration] = useState(knownDuration || 0);

  useEffect(() => {
    let cancelled = false;
    computePeaks(src).then((result) => {
      if (cancelled || !result) return;
      setPeaks(result.peaks);
      if (Number.isFinite(result.duration)) setDuration(result.duration);
    });
    return () => {
      cancelled = true;
    };
  }, [src]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      // pause any other player that is running
      document.querySelectorAll("audio").forEach((a) => a !== audio && a.pause());
      audio.play();
    } else {
      audio.pause();
    }
  };

  const total = Number.isFinite(audioRef.current?.duration)
    ? audioRef.current.duration
    : duration;

  const onTimeUpdate = () => {
    const audio = audioRef.current;
    setCurrent(audio.currentTime);
    setProgress(total ? Math.min(audio.currentTime / total, 1) : 0);
  };

  const seek = (e) => {
    const audio = audioRef.current;
    if (!audio || !total) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    audio.currentTime = ratio * total;
    setProgress(ratio);
  };

  return (
    <div className="voice-player">
      <button
        type="button"
        className="voice-play"
        onClick={toggle}
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
      </button>
      <div className="voice-body">
        {label && <span className="voice-label">{label}</span>}
        <div className="voice-wave" onClick={seek} role="slider"
          aria-label="Seek" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}>
          {peaks.map((p, i) => (
            <span
              key={i}
              className={i / peaks.length < progress ? "played" : ""}
              style={{ height: `${Math.max(p * 100, 12)}%` }}
            />
          ))}
        </div>
        <span className="voice-time">
          {formatDuration(playing || current ? current : total)}
        </span>
      </div>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
          setCurrent(0);
        }}
        onTimeUpdate={onTimeUpdate}
      />
    </div>
  );
}

export default VoicePlayer;
