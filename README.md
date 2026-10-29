# SuperChat

Real-time chat rooms with photos, videos, audio files and voice notes. Installable as a PWA on phones and desktops.

## Features

- Join a room by name and room id, or open an invite link (`?room=<id>`)
- Send text, photos, videos, audio files (up to 20 MB) and recorded voice notes
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

The service worker only registers in production builds (`npm run build`).
