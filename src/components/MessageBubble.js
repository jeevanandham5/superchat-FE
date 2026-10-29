import React from "react";
import Avatar from "./Avatar";
import VoicePlayer from "./VoicePlayer";
import {
  ClockIcon,
  DoubleCheckIcon,
  DownloadIcon,
  MicIcon,
} from "./Icons";

export const formatBytes = (bytes) => {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 3);
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
};

function MediaContent({ msg, onOpenImage }) {
  switch (msg.type) {
    case "image":
      return (
        <button
          type="button"
          className="bubble-media"
          onClick={() => onOpenImage(msg)}
          aria-label={`Open ${msg.name || "image"}`}
        >
          <img src={msg.url} alt={msg.name || "Shared image"} loading="lazy" />
        </button>
      );
    case "video":
      return (
        <div className="bubble-media">
          <video src={msg.url} controls playsInline preload="metadata" />
        </div>
      );
    case "voice":
      return <VoicePlayer src={msg.url} duration={msg.duration} />;
    case "audio":
      return (
        <div className="audio-file">
          <VoicePlayer src={msg.url} duration={msg.duration} label={msg.name} />
          <a className="audio-download" href={msg.url} download={msg.name}
            aria-label="Download audio">
            <DownloadIcon size={16} />
          </a>
        </div>
      );
    default:
      return null;
  }
}

function MessageBubble({ msg, own, first, last, onOpenImage }) {
  const isMedia = msg.type && msg.type !== "text";
  const isVisual = msg.type === "image" || msg.type === "video";

  return (
    <div
      className={[
        "msg-row",
        own ? "own" : "theirs",
        first ? "first" : "",
        last ? "last" : "",
      ].join(" ")}
    >
      {!own && (
        <div className="msg-avatar">
          {last ? <Avatar name={msg.author} size={30} /> : null}
        </div>
      )}
      <div className="msg-stack">
        {!own && first && <span className="msg-author">{msg.author}</span>}
        <div
          className={[
            "bubble",
            isMedia ? `bubble-${msg.type}` : "",
            isVisual ? "bubble-visual" : "",
          ].join(" ")}
        >
          {isMedia ? (
            <MediaContent msg={msg} onOpenImage={onOpenImage} />
          ) : (
            <p className="bubble-text">{msg.message}</p>
          )}
          {isMedia && msg.message ? (
            <p className="bubble-text bubble-caption">{msg.message}</p>
          ) : null}
          <span className="bubble-meta">
            {msg.type === "voice" && !own && <MicIcon size={12} />}
            {msg.time}
            {own &&
              (msg.status === "sending" ? (
                <ClockIcon size={13} aria-label="Sending" />
              ) : (
                <DoubleCheckIcon size={15} aria-label="Delivered" />
              ))}
          </span>
        </div>
      </div>
    </div>
  );
}

export default MessageBubble;
