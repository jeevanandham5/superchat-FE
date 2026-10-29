import React, { useEffect, useRef, useState } from "react";
import useVoiceRecorder, { canRecord } from "./useVoiceRecorder";
import { formatDuration } from "./VoicePlayer";
import { formatBytes } from "./MessageBubble";
import {
  CloseIcon,
  ImageIcon,
  MicIcon,
  MusicIcon,
  PaperclipIcon,
  SendIcon,
  TrashIcon,
} from "./Icons";

function PendingPreview({ pending, onClear }) {
  const { file, url, type } = pending;
  return (
    <div className="pending">
      <div className="pending-thumb">
        {type === "image" && <img src={url} alt="" />}
        {type === "video" && <video src={url} muted playsInline />}
        {type === "audio" && <MusicIcon size={22} />}
      </div>
      <div className="pending-info">
        <span className="pending-name">{file.name}</span>
        <span className="pending-size">
          {type[0].toUpperCase() + type.slice(1)} · {formatBytes(file.size)}
        </span>
      </div>
      <button type="button" className="icon-btn" onClick={onClear}
        aria-label="Remove attachment">
        <CloseIcon size={18} />
      </button>
    </div>
  );
}

function Composer({
  pending,
  onPickFile,
  onClearPending,
  onSendText,
  onSendPending,
  onSendVoice,
  onTyping,
  onError,
}) {
  const [text, setText] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const textareaRef = useRef(null);
  const mediaInputRef = useRef(null);
  const audioInputRef = useRef(null);
  const menuRef = useRef(null);
  const recorder = useVoiceRecorder();

  useEffect(() => {
    if (recorder.error) {
      onError(recorder.error);
      recorder.setError("");
    }
  }, [recorder, onError]);

  useEffect(() => {
    onTyping({ recording: recorder.recording });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.recording]);

  // grow the textarea with its content, up to the css max-height
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
    el.style.overflowY = el.scrollHeight > el.clientHeight + 1 ? "auto" : "hidden";
  }, [text]);

  useEffect(() => {
    if (pending) textareaRef.current?.focus();
  }, [pending]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e) => {
      if (!menuRef.current?.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menuOpen]);

  const submit = () => {
    const value = text.trim();
    if (pending) {
      onSendPending(value);
    } else if (value) {
      onSendText(value);
    } else {
      return;
    }
    setText("");
    onTyping({ isTyping: false });
  };

  const onKeyDown = (e) => {
    // enter sends, shift+enter adds a line (ignored while composing IME text)
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const onFileChosen = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    setMenuOpen(false);
    if (file) onPickFile(file);
  };

  const onPaste = (e) => {
    const file = [...(e.clipboardData?.files || [])][0];
    if (file) {
      e.preventDefault();
      onPickFile(file);
    }
  };

  const startRecording = async () => {
    if (!canRecord()) {
      onError("Voice notes aren't supported in this browser.");
      return;
    }
    await recorder.start();
  };

  const finishRecording = async () => {
    const result = await recorder.stop();
    if (!result) return;
    if (result.duration < 0.6) {
      onError("Hold on a little longer to record a voice note.");
      return;
    }
    onSendVoice(result);
  };

  if (recorder.recording) {
    return (
      <div className="composer recording">
        <button type="button" className="icon-btn danger" onClick={recorder.cancel}
          aria-label="Discard voice note">
          <TrashIcon size={20} />
        </button>
        <div className="rec-status">
          <span className="rec-dot" />
          <span className="rec-time">{formatDuration(recorder.elapsed)}</span>
          <div className="rec-meter" aria-hidden="true">
            {Array.from({ length: 24 }, (_, i) => (
              <span
                key={i}
                style={{
                  transform: `scaleY(${Math.max(
                    0.15,
                    recorder.level * (0.55 + 0.45 * Math.abs(Math.sin(i * 1.3 + recorder.elapsed * 6)))
                  )})`,
                }}
              />
            ))}
          </div>
          <span className="rec-hint">Recording…</span>
        </div>
        <button type="button" className="send-btn" onClick={finishRecording}
          aria-label="Send voice note">
          <SendIcon size={20} />
        </button>
      </div>
    );
  }

  const canSend = !!pending || text.trim().length > 0;

  return (
    <div className="composer-wrap">
      {pending && <PendingPreview pending={pending} onClear={onClearPending} />}
      <div className="composer">
        <div className="attach" ref={menuRef}>
          <button
            type="button"
            className={`icon-btn ${menuOpen ? "active" : ""}`}
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Attach a file"
            aria-expanded={menuOpen}
          >
            <PaperclipIcon size={20} />
          </button>
          {menuOpen && (
            <div className="attach-menu" role="menu">
              <button type="button" role="menuitem"
                onClick={() => mediaInputRef.current?.click()}>
                <span className="attach-ico violet"><ImageIcon size={18} /></span>
                Photo or video
              </button>
              <button type="button" role="menuitem"
                onClick={() => audioInputRef.current?.click()}>
                <span className="attach-ico pink"><MusicIcon size={18} /></span>
                Audio file
              </button>
              <button type="button" role="menuitem"
                onClick={() => { setMenuOpen(false); startRecording(); }}>
                <span className="attach-ico cyan"><MicIcon size={18} /></span>
                Voice note
              </button>
            </div>
          )}
          <input ref={mediaInputRef} type="file" accept="image/*,video/*" hidden
            onChange={onFileChosen} />
          <input ref={audioInputRef} type="file" accept="audio/*" hidden
            onChange={onFileChosen} />
        </div>

        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          placeholder={pending ? "Add a caption…" : "Message"}
          onChange={(e) => {
            setText(e.target.value);
            onTyping({ isTyping: e.target.value.length > 0 });
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          aria-label="Message"
        />

        {canSend ? (
          <button type="button" className="send-btn" onClick={submit}
            aria-label="Send">
            <SendIcon size={20} />
          </button>
        ) : (
          <button type="button" className="send-btn mic" onClick={startRecording}
            aria-label="Record a voice note">
            <MicIcon size={20} />
          </button>
        )}
      </div>
    </div>
  );
}

export default Composer;
