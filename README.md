# SuperChat

Real-time chat rooms with photos, videos, audio files and voice notes. Installable as a PWA on phones and desktops.

## Features

- Join a room by name and room id, or open an invite link (`?room=<id>`)
- Send text, photos, videos, audio files (up to 20 MB) and recorded voice notes
- Voice and video calls with everyone in the room (peer to peer WebRTC): ringing, mute, camera on/off mid-call, flip camera on phones, screen share on desktop, speaking indicator
- Paste or drag and drop media straight into the chat
- Typing and "recording audio" indicators, online count, join/leave notices
- Sent/delivered ticks, image viewer, shared media gallery
- Light and dark themes that follow the system, responsive from phones to wide desktops
- Installable PWA with an offline app shell

## Running locally

Start the backend ([superchat-BE](https://github.com/jeevanandham5/superchat-BE)) on port 3001, then:

```bash
REACT_APP_SOCKET_URL=http://localhost:3001 npm start
```

Without `REACT_APP_SOCKET_URL` the app connects to `https://superchat-be.onrender.com`.

### Calls on strict networks

Calls connect directly between browsers using public STUN servers. Some networks (many mobile carriers, corporate wifi) block direct connections and need a TURN relay. Add one with:

```bash
REACT_APP_TURN_URL=turn:your-turn-host:3478,turns:your-turn-host:5349
REACT_APP_TURN_USERNAME=...
REACT_APP_TURN_CREDENTIAL=...
```

The service worker only registers in production builds (`npm run build`).
