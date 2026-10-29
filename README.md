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

### Calls on mobile data and strict networks

Calls try a direct connection first. Mobile carriers and strict wifi often block that, so the backend can hand out Cloudflare TURN relay credentials from `GET /ice-servers`:

1. In the Cloudflare dashboard, open Realtime → TURN Server and create a TURN key.
2. In the backend's environment (Render → Environment), set `CF_TURN_KEY_ID` and `CF_TURN_API_TOKEN`.

Without them the backend returns STUN servers only. To use a different TURN provider, set `REACT_APP_TURN_URL`, `REACT_APP_TURN_USERNAME` and `REACT_APP_TURN_CREDENTIAL` on the frontend instead.

The service worker only registers in production builds (`npm run build`).
