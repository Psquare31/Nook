# Nook

A small multiplayer 2D world in the spirit of Gather and Habbo. Rooms are not predefined: people signed in with Google can create, name, size and place a room in an editor, and rooms can never overlap or leave the world. Only the person who created a room can move, resize, rename or delete it. Anyone can walk around, chat and talk without signing in. The same world is walkable, and both text chat and voice chat are scoped to the room you stand in.

- Frontend: Vite, React, TypeScript, one Canvas 2D element for the world
- Backend: Node, Express, Socket.IO, one process, rooms saved to a JSON file
- Voice: Agora, optional, switched on by two values in `.env`

## Run it locally

Needs Node 20.19 or newer (22.12 or newer on the 22 line).

```
npm install
npm run dev
```

That starts the backend on `http://localhost:3001` and the frontend on `http://localhost:5173`. Open the frontend URL in a browser.

## Test multiplayer with two windows

Use two browsers that do not share storage, so each is a separate person:

- a normal Chrome window and an Incognito window, or
- two Chrome profiles

Two tabs in the same window also give you two avatars, but they count as the same person for room ownership.

With Google sign-in configured, sign in with a different Google account in each window before building. To try the editor without Google, start the backend with `ALLOW_BUILD_WITHOUT_SIGN_IN=true` in `.env` and no `GOOGLE_CLIENT_ID`.

With both open on `http://localhost:5173`:

1. Both show `2 online` in the top bar, and both avatars stand in the Lounge.
2. Walk with WASD or the arrow keys in one window. The other window shows the avatar move.
3. Press Enter, type, press Enter. The message appears in both windows while both are in the same room.
4. Walk one avatar out of the room. The other window logs `<name> left`, and messages no longer cross between them.
5. Walk it into the room the other avatar is in. That window logs `<name> entered`, and chat works again.
6. Switch both windows to **Edit world**. In the first, create a room and click a free spot. It appears in the second window, dimmed.
7. In the first window, drag the room onto another one. It turns red and snaps back when released. Move or resize it and watch the second window follow.
8. In the second window, select that room. The panel shows who created it and has no fields, dragging it only pans the map, and Delete is refused.
9. With voice set up (see [Voice chat](#voice-chat)), click **Join voice** in both windows. Each shows the other with a microphone icon, and a green ring appears around whoever is talking. Walk one avatar out of the room and the two stop hearing each other.
10. Close one window. The other drops to `1 online`.

Both servers listen on this machine only. To let a phone or another laptop on the same network join, set `HOST=0.0.0.0` in `.env`, run `npm run dev:server` in one terminal and `npm run dev:web -- --host` in another, then open the network URL that Vite prints. The operating system may ask to allow Node through its firewall.

## Controls

Play mode

| Input | Action |
| --- | --- |
| WASD or arrow keys | Walk |
| Enter | Start typing, then send |
| Esc | Leave the chat box |
| M | Mute or unmute your microphone while in voice |
| Scroll | Zoom |

Edit mode

| Input | Action |
| --- | --- |
| Create room, then click | Place a new room (green fits, red overlaps) |
| Click a room | Select it and see who created it |
| Drag your room | Move it |
| Drag an edge or corner of your room | Resize it |
| Arrow keys | Nudge your selected room (Shift for bigger steps) |
| Delete | Delete your selected room |
| Esc | Cancel placing or deselect |
| Drag empty space, scroll | Pan and zoom |

## How it fits together

`shared/geometry.ts` holds the placement rules: `roomsOverlap(a, b)` and `validateRoom(candidate, rooms, world)`. The editor uses them for the live valid or invalid state while dragging. The server uses the same functions before it accepts any change, so a client cannot create an overlap even if it skips its own check.

The server owns the world. Room edits are sent with an acknowledgement:

- accepted: the server saves the change and broadcasts it to the other clients
- rejected: the reply carries the reason and the room as the server has it, and the client restores that

The client applies its own edits immediately and rolls back on a rejection. On every connect or reconnect it asks for a full snapshot.

Each world room maps to a Socket.IO room. The server decides which room a player is in from their position, moves the socket between Socket.IO rooms as they walk, and sends chat only to that room. Everyone outside a room shares one channel.

### Voice

Voice follows the same rule as text chat: you hear the people in the room you stand in, or the others outside if you are in no room. Each room has its own Agora channel. When a browser joins voice it asks the server for a token, and the server issues one only for the channel of the room it has that player in, valid for ten minutes and for that player alone. Walking into another room leaves one channel and joins the next. The audio itself travels between the browsers and Agora, not through this server.

### Sign-in and who can edit a room

With `GOOGLE_CLIENT_ID` set, the top bar shows Google's **Sign in with Google** button.

1. Google gives the browser an ID token for that client id.
2. The browser sends the token to the backend once. The backend checks Google's signature, that the token was issued for this client id by `accounts.google.com`, and that it has not expired.
3. The backend answers with its own session, signed with `SESSION_SECRET` and valid for 30 days. The browser keeps it in `localStorage` and sends it with every connection, so a reload or a server restart keeps you signed in.

Sign in from a normal browser tab. Embedded browsers, such as an editor's preview pane, block the window Google opens; the page shows a note there instead of the button.

Rooms are owned by a digest of the Google account id, so they are yours on any device. The backend refuses any move, resize, rename or delete from a different account, and it never takes the owner from what a client sends. Guests can walk, chat and use voice, but cannot build. A signed-in person's name comes from their Google account.

Without `GOOGLE_CLIENT_ID` there is no sign-in, and nobody can build: the editor says so, and the backend's startup log and `/health` (`"building":"off"`) show it too. This is deliberate, so a missing setting cannot leave the world open to anyone.

For local testing without Google, set `ALLOW_BUILD_WITHOUT_SIGN_IN=true`. Everyone can then build, each browser keeps a random secret key in `localStorage`, and rooms belong to a digest of that key. That key is per browser profile, and clearing site data discards it. Do not set this on a public server.

The three starter rooms have no owner and are locked for everyone.

```
shared/    types, constants, geometry rules, socket event types
server/    Express + Socket.IO app, world state, persistence, voice tokens
src/       React app: world canvas, editor, play mode, voice, socket client
tests/     geometry, resize math, and server tests over real sockets
```

## Voice chat

Voice is off until the backend has Agora credentials.

1. Create a project in the [Agora console](https://console.agora.io) in secured mode (App ID + token).
2. Copy its App ID and primary certificate into `.env` as `AGORA_APP_ID` and `AGORA_APP_CERTIFICATE`.
3. Restart the backend. Its startup log says `voice chat: on`, and a **Join voice** button appears in the top bar.

Things to know:

- Voice is opt-in. Nobody's microphone is used until they click **Join voice**, and the mute button or the M key silences it.
- Browsers only allow microphone access on HTTPS or on `localhost`. Voice will not work when the page is opened through a plain network address such as `http://192.168.1.20:5173`.
- Two windows on one computer share the same microphone and speakers, so they echo. Use headphones, or mute one window.
- Someone without a microphone, or who refuses the permission prompt, still joins and can listen.
- The Agora SDK is large, so it is downloaded only when someone joins voice.
- The certificate is a secret. Only the backend reads it, and it is never sent to a browser.

## Configuration

Nothing needs to be set for local use without voice. To override a default, copy `.env.example` to `.env`.

| Variable | Used by | Default | Purpose |
| --- | --- | --- | --- |
| `PORT` | backend | `3001` | Port the backend listens on |
| `HOST` | backend | `127.0.0.1`, or `0.0.0.0` on Render | Address the backend binds to |
| `CLIENT_ORIGIN` | backend | any origin | Comma-separated frontend origins allowed to connect |
| `DATA_DIR` | backend | `data` | Folder that holds `world.json` |
| `AGORA_APP_ID` | backend | empty | Agora project id; voice is off without it |
| `AGORA_APP_CERTIFICATE` | backend | empty | Agora project certificate, used to sign voice tokens |
| `GOOGLE_CLIENT_ID` | backend | empty | Google OAuth client id; without it nobody can sign in or build |
| `ALLOW_BUILD_WITHOUT_SIGN_IN` | backend | empty | `true` lets everyone build when sign-in is not set up; local testing only |
| `SESSION_SECRET` | backend | empty | 32+ random characters that sign login sessions; required with `GOOGLE_CLIENT_ID` |
| `VITE_SERVER_URL` | frontend | this host, port 3001 | Address of the backend |

A hosted setup needs `VITE_SERVER_URL` on the frontend and `CLIENT_ORIGIN` on the backend. With `CLIENT_ORIGIN` set, the backend refuses connections from pages served anywhere else.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Backend and frontend together, both reloading on change |
| `npm run dev:server` | Backend only |
| `npm run dev:web` | Frontend only |
| `npm test` | Unit tests and server tests |
| `npm run build` | Type-check and build the frontend into `dist/` |
| `npm run build:server` | Bundle the backend into `dist-server/` for production |
| `npm start` | Run the bundled backend with plain Node |

## Deploying

[DEPLOY.md](DEPLOY.md) walks through putting the backend on Render's free plan (from `render.yaml`) and the frontend on Vercel, and pointing an uptime monitor at `/health` so the free service never sleeps.

## Resetting the world

Rooms are saved in `data/world.json`. Stop the backend and delete that file to start again with the three starter rooms. This is also the way to clear rooms whose owner key is gone.

On Render's free plan this file does not last: the disk is wiped whenever the service restarts or is redeployed.

## Not built yet

- Lasting storage on Render's free plan: created rooms are lost when the service restarts
- Chat history: messages are not stored
- Rate limits: nothing stops a visitor from flooding the chat or filling the world with rooms
