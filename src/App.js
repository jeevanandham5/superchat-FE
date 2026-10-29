import io from "socket.io-client";
import "./App.css";
import { useEffect, useMemo, useState } from "react";
import Chat from "./components/Chat";
import { LogoMark, DownloadIcon, ImageIcon, MicIcon, VideoIcon } from "./components/Icons";

const SOCKET_URL =
  process.env.REACT_APP_SOCKET_URL || "https://superchat-be.onrender.com";

const socket = io.connect(SOCKET_URL);

const NAME_KEY = "superchat:name";

const readStored = (key) => {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
};

const roomFromUrl = () =>
  new URLSearchParams(window.location.search).get("room") || "";

function App() {
  const [username, setUserName] = useState(readStored(NAME_KEY));
  const [room, setRoom] = useState(roomFromUrl());
  const [showChat, setShowChat] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const clientId = useMemo(
    () => window.crypto?.randomUUID?.() || String(Math.random()).slice(2),
    []
  );

  // offer an install button where the browser supports it
  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    const onInstalled = () => setInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const joinRoom = (e) => {
    e?.preventDefault();
    const name = username.trim();
    const roomId = room.trim();
    if (name !== "" && roomId !== "") {
      try {
        localStorage.setItem(NAME_KEY, name);
      } catch {
        /* storage unavailable */
      }
      setUserName(name);
      setRoom(roomId);
      socket.emit("join_room", { room: roomId, username: name });
      window.history.replaceState(null, "", `?room=${encodeURIComponent(roomId)}`);
      setShowChat(true);
    }
  };

  const leaveRoom = () => {
    socket.emit("leave_room");
    window.history.replaceState(null, "", window.location.pathname);
    setShowChat(false);
  };

  const install = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => {});
    setInstallPrompt(null);
  };

  if (showChat) {
    return (
      <div className="App">
        <Chat
          socket={socket}
          username={username}
          room={room}
          clientId={clientId}
          onLeave={leaveRoom}
        />
      </div>
    );
  }

  return (
    <div className="App">
      <main className="join">
        <section className="join-hero">
          <div className="brand">
            <LogoMark size={40} />
            <span>superchat</span>
          </div>
          <h1>
            Talk in <em>real time.</em>
            <br />
            Share everything.
          </h1>
          <p>
            Spin up a room, send the link, and you're talking. Photos, videos,
            audio and voice notes, delivered the moment you hit send.
          </p>
          <ul className="feature-pills">
            <li><ImageIcon size={16} /> Photos</li>
            <li><VideoIcon size={16} /> Videos</li>
            <li><MicIcon size={16} /> Voice notes</li>
          </ul>
        </section>

        <form className="join-card" onSubmit={joinRoom}>
          <h2>Join a room</h2>
          <p className="join-sub">Pick a name and a room. Anyone with the same room id joins you.</p>
          <label>
            <span>Your name</span>
            <input
              type="text"
              value={username}
              placeholder="e.g. Jeeva"
              maxLength={32}
              autoComplete="nickname"
              onChange={(e) => setUserName(e.target.value)}
            />
          </label>
          <label>
            <span>Room id</span>
            <input
              type="text"
              value={room}
              placeholder="e.g. weekend-plans"
              maxLength={48}
              onChange={(e) => setRoom(e.target.value)}
            />
          </label>
          <button type="submit" className="primary-btn"
            disabled={!username.trim() || !room.trim()}>
            Join room
          </button>
          {installPrompt && (
            <button type="button" className="ghost-btn" onClick={install}>
              <DownloadIcon size={18} /> Install app
            </button>
          )}
        </form>
      </main>
    </div>
  );
}

export default App;
