import React, { useCallback, useEffect, useRef, useState } from "react";
import Avatar from "./Avatar";
import Composer from "./Composer";
import MessageBubble, { formatBytes } from "./MessageBubble";
import {
  ArrowLeftIcon,
  CloseIcon,
  ImageIcon,
  InfoIcon,
  LinkIcon,
  LogOutIcon,
  LogoMark,
} from "./Icons";

// socket packets are capped at 25MB on the server, leave room for metadata
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const GROUP_WINDOW_MS = 3 * 60 * 1000;

const makeId = () =>
  window.crypto?.randomUUID?.() ||
  `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const clockTime = (date = new Date()) =>
  date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

const kindOf = (mime = "") => {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return null;
};

const describe = (msg) =>
  ({
    image: "📷 Photo",
    video: "🎬 Video",
    audio: "🎵 Audio",
    voice: "🎤 Voice note",
  }[msg.type] || msg.message);

function Chat({ socket, username, room, clientId, onLeave }) {
  const [messages, setMessages] = useState([]);
  const [pending, setPending] = useState(null);
  const [typers, setTypers] = useState({});
  const [online, setOnline] = useState(1);
  const [connected, setConnected] = useState(socket.connected);
  const [lightbox, setLightbox] = useState(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState(null);

  const listRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const typingTimerRef = useRef(null);
  const typingStateRef = useRef(false);
  const urlsRef = useRef([]);
  const unreadRef = useRef(0);

  const showToast = useCallback((text) => {
    setToast({ text, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const trackUrl = (url) => {
    urlsRef.current.push(url);
    return url;
  };

  useEffect(
    () => () => urlsRef.current.forEach((url) => URL.revokeObjectURL(url)),
    []
  );

  // unread count in the tab title while the app is in the background
  useEffect(() => {
    const reset = () => {
      if (document.visibilityState === "visible") {
        unreadRef.current = 0;
        document.title = "SuperChat";
        navigator.clearAppBadge?.().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", reset);
    return () => document.removeEventListener("visibilitychange", reset);
  }, []);

  useEffect(() => {
    const onMessage = (data) => {
      const msg = { ...data, kind: "message" };
      if (data.file) {
        const blob = new Blob([data.file], { type: data.mime });
        msg.url = trackUrl(URL.createObjectURL(blob));
        delete msg.file;
      }
      msg.id = msg.id || makeId();
      msg.sentAt = msg.sentAt || Date.now();
      setMessages((list) => [...list, msg]);
      setTypers((t) => {
        const next = { ...t };
        delete next[data.author];
        return next;
      });

      if (document.visibilityState === "hidden") {
        unreadRef.current += 1;
        document.title = `(${unreadRef.current}) SuperChat`;
        navigator.setAppBadge?.(unreadRef.current).catch(() => {});
      }
    };

    const onTyping = ({ author, isTyping, recording }) => {
      setTypers((t) => {
        const next = { ...t };
        if (isTyping || recording) next[author] = recording ? "recording" : "typing";
        else delete next[author];
        return next;
      });
    };

    const onUserEvent = ({ type, username: who }) => {
      setMessages((list) => [
        ...list,
        {
          kind: "system",
          id: makeId(),
          text: `${who} ${type === "joined" ? "joined the room" : "left the room"}`,
        },
      ]);
      if (type === "left") onTyping({ author: who, isTyping: false });
    };

    const onUsers = ({ count }) => setOnline(Math.max(count, 1));
    const onConnect = () => {
      setConnected(true);
      // rejoin after a dropped connection so messages keep flowing
      socket.emit("join_room", { room, username });
    };
    const onDisconnect = () => setConnected(false);

    socket.on("receive_massage", onMessage);
    socket.on("typing", onTyping);
    socket.on("user_event", onUserEvent);
    socket.on("room_users", onUsers);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    return () => {
      socket.off("receive_massage", onMessage);
      socket.off("typing", onTyping);
      socket.off("user_event", onUserEvent);
      socket.off("room_users", onUsers);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, [socket, room, username]);

  // follow new messages unless the reader has scrolled up
  const onScroll = () => {
    const el = listRef.current;
    stickToBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottomRef.current) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages, typers]);

  const emitTyping = useCallback(
    ({ isTyping, recording }) => {
      if (recording !== undefined) {
        socket.emit("typing", { room, author: username, recording, isTyping: false });
        return;
      }
      clearTimeout(typingTimerRef.current);
      if (isTyping) {
        if (!typingStateRef.current) {
          typingStateRef.current = true;
          socket.emit("typing", { room, author: username, isTyping: true });
        }
        typingTimerRef.current = setTimeout(() => emitTyping({ isTyping: false }), 2000);
      } else if (typingStateRef.current) {
        typingStateRef.current = false;
        socket.emit("typing", { room, author: username, isTyping: false });
      }
    },
    [socket, room, username]
  );

  const deliver = (local, payload) => {
    stickToBottomRef.current = true;
    setMessages((list) => [...list, { ...local, kind: "message", status: "sending" }]);
    const markSent = () =>
      setMessages((list) =>
        list.map((m) => (m.id === local.id ? { ...m, status: "sent" } : m))
      );
    // old servers never ack, so fall back to marking it sent after a beat
    const fallback = setTimeout(markSent, 4000);
    socket.emit("send_message", { ...local, ...payload }, () => {
      clearTimeout(fallback);
      markSent();
    });
  };

  const baseMessage = (extra) => ({
    id: makeId(),
    room,
    author: username,
    senderId: clientId,
    time: clockTime(),
    sentAt: Date.now(),
    ...extra,
  });

  const sendText = (text) => deliver(baseMessage({ type: "text", message: text }));

  const pickFile = useCallback(
    (file) => {
      const type = kindOf(file.type);
      if (!type) {
        showToast("Only photos, videos and audio can be shared.");
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        showToast(`That file is ${formatBytes(file.size)}. The limit is 20 MB.`);
        return;
      }
      setPending((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { file, type, url: URL.createObjectURL(file) };
      });
    },
    [showToast]
  );

  const clearPending = () => {
    if (pending) URL.revokeObjectURL(pending.url);
    setPending(null);
  };

  const sendPending = async (caption) => {
    // a fast double tap can call this twice before the re-render clears it
    if (!pending || pending.sent) return;
    pending.sent = true;
    const { file, type, url } = pending;
    setPending(null);
    trackUrl(url);
    const buffer = await file.arrayBuffer();
    deliver(
      baseMessage({
        type,
        message: caption,
        name: file.name,
        mime: file.type,
        size: file.size,
        url,
      }),
      { url: undefined, file: buffer }
    );
  };

  const sendVoice = async ({ blob, duration, mime }) => {
    const url = trackUrl(URL.createObjectURL(blob));
    const buffer = await blob.arrayBuffer();
    deliver(
      baseMessage({
        type: "voice",
        message: "",
        name: `voice-note.${mime.includes("mp4") ? "m4a" : "webm"}`,
        mime,
        size: blob.size,
        duration,
        url,
      }),
      { url: undefined, file: buffer }
    );
  };

  const copyInvite = async () => {
    const link = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(room)}`;
    try {
      if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ title: "Join me on SuperChat", url: link });
      } else {
        await navigator.clipboard.writeText(link);
        showToast("Invite link copied");
      }
    } catch {
      /* share sheet dismissed */
    }
  };

  // drag and drop a file anywhere on the chat
  const onDragOver = (e) => {
    if ([...e.dataTransfer.types].includes("Files")) {
      e.preventDefault();
      setDragging(true);
    }
  };
  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) pickFile(file);
  };

  const isOwn = (m) => (m.senderId ? m.senderId === clientId : m.author === username);
  const media = messages.filter(
    (m) => m.kind === "message" && (m.type === "image" || m.type === "video")
  );

  const typerEntries = Object.entries(typers);
  const typingLabel = typerEntries.length
    ? typerEntries.length > 1
      ? `${typerEntries.length} people are typing…`
      : `${typerEntries[0][0]} is ${
          typerEntries[0][1] === "recording" ? "recording audio" : "typing"
        }…`
    : null;

  const roomInfo = (
    <>
      <div className="info-head">
        <div className="info-room-badge">#</div>
        <h2>{room}</h2>
        <p>
          <span className={`presence-dot ${connected ? "" : "off"}`} />
          {connected ? `${online} online` : "Reconnecting…"}
        </p>
      </div>
      <button type="button" className="info-action" onClick={copyInvite}>
        <LinkIcon size={18} /> Invite people
      </button>

      <div className="info-section">
        <h3>You</h3>
        <div className="info-me">
          <Avatar name={username} size={36} />
          <span>{username}</span>
        </div>
      </div>

      <div className="info-section grow">
        <h3>
          Shared media <span>{media.length}</span>
        </h3>
        {media.length ? (
          <div className="media-grid">
            {media.map((m) => (
              <button
                type="button"
                key={m.id}
                className="media-tile"
                onClick={() => setLightbox(m)}
                aria-label={`Open ${m.name || m.type}`}
              >
                {m.type === "image" ? (
                  <img src={m.url} alt="" loading="lazy" />
                ) : (
                  <video src={m.url} muted playsInline preload="metadata" />
                )}
              </button>
            ))}
          </div>
        ) : (
          <p className="info-empty">Photos and videos you share show up here.</p>
        )}
      </div>

      <button type="button" className="info-action leave" onClick={onLeave}>
        <LogOutIcon size={18} /> Leave room
      </button>
    </>
  );

  return (
    <div className="chat-shell">
      <aside className="sidebar">
        <div className="brand">
          <LogoMark size={32} />
          <span>superchat</span>
        </div>
        {roomInfo}
      </aside>

      <section
        className="chat-panel"
        onDragOver={onDragOver}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
        }}
        onDrop={onDrop}
      >
        <header className="chat-header">
          <button type="button" className="icon-btn mobile-only" onClick={onLeave}
            aria-label="Leave room">
            <ArrowLeftIcon size={20} />
          </button>
          <div className="room-badge">#</div>
          <div className="chat-title">
            <h1>{room}</h1>
            <p className={typingLabel ? "typing" : ""}>
              {typingLabel ||
                (connected ? (
                  <>
                    <span className="presence-dot" />
                    {online} online
                  </>
                ) : (
                  "Reconnecting…"
                ))}
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={copyInvite}
            aria-label="Invite people">
            <LinkIcon size={20} />
          </button>
          <button type="button" className="icon-btn info-toggle" onClick={() => setInfoOpen(true)}
            aria-label="Room info">
            <InfoIcon size={20} />
          </button>
        </header>

        <div className="messages" ref={listRef} onScroll={onScroll}>
          {messages.length === 0 ? (
            <div className="empty">
              <div className="empty-art">
                <LogoMark size={56} />
              </div>
              <h2>Welcome to #{room}</h2>
              <p>
                Say hi, drop a photo, or hold a thought in a voice note.
                Messages only live while you're here.
              </p>
              <button type="button" className="chip" onClick={copyInvite}>
                <LinkIcon size={16} /> Invite someone
              </button>
            </div>
          ) : (
            messages.map((m, i) => {
              if (m.kind === "system") {
                return (
                  <div key={m.id} className="system-msg">
                    <span>{m.text}</span>
                  </div>
                );
              }
              const prev = messages[i - 1];
              const next = messages[i + 1];
              const sameAs = (other) =>
                other &&
                other.kind === "message" &&
                other.author === m.author &&
                isOwn(other) === isOwn(m) &&
                Math.abs((other.sentAt || 0) - (m.sentAt || 0)) < GROUP_WINDOW_MS;
              return (
                <MessageBubble
                  key={m.id}
                  msg={m}
                  own={isOwn(m)}
                  first={!sameAs(prev)}
                  last={!sameAs(next)}
                  onOpenImage={setLightbox}
                />
              );
            })
          )}
          {typerEntries.length > 0 && (
            <div className="typing-row" aria-live="polite">
              <div className="typing-bubble">
                <span />
                <span />
                <span />
              </div>
            </div>
          )}
        </div>

        <Composer
          pending={pending}
          onPickFile={pickFile}
          onClearPending={clearPending}
          onSendText={sendText}
          onSendPending={sendPending}
          onSendVoice={sendVoice}
          onTyping={emitTyping}
          onError={showToast}
        />

        {dragging && (
          <div className="drop-overlay">
            <div>
              <ImageIcon size={36} />
              <p>Drop to share</p>
              <span>Photos, videos or audio up to 20 MB</span>
            </div>
          </div>
        )}
      </section>

      {infoOpen && (
        <div className="drawer-backdrop" onClick={() => setInfoOpen(false)}>
          <aside className="drawer" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="icon-btn drawer-close"
              onClick={() => setInfoOpen(false)} aria-label="Close">
              <CloseIcon size={20} />
            </button>
            {roomInfo}
          </aside>
        </div>
      )}

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)} role="dialog"
          aria-label="Media viewer">
          <button type="button" className="icon-btn lightbox-close" aria-label="Close">
            <CloseIcon size={22} />
          </button>
          <div className="lightbox-body" onClick={(e) => e.stopPropagation()}>
            {lightbox.type === "video" ? (
              <video src={lightbox.url} controls autoPlay playsInline />
            ) : (
              <img src={lightbox.url} alt={lightbox.name || ""} />
            )}
            <div className="lightbox-meta">
              <Avatar name={lightbox.author} size={28} />
              <div>
                <strong>{lightbox.author}</strong>
                <span>{lightbox.message || describe(lightbox)} · {lightbox.time}</span>
              </div>
              <a href={lightbox.url} download={lightbox.name} className="chip">
                Save
              </a>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast" key={toast.id} role="status">
          {toast.text}
        </div>
      )}
    </div>
  );
}

export default Chat;
