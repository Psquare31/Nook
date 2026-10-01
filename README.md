# Nook

A small multiplayer 2D world in the spirit of Gather and Habbo. Rooms are not predefined: anyone can create, name, size, place, move, resize and delete them in an editor, and rooms can never overlap or leave the world. The same world is walkable, and chat is scoped to the room you stand in.

- Frontend: Vite, React, TypeScript, one Canvas 2D element for the world
- Backend: Node, Express, Socket.IO, one process, rooms saved to a JSON file

## Run it locally

Needs Node 20.19 or newer (22.12 or newer on the 22 line).

```
npm install
npm run dev
```

That starts the backend on `http://localhost:3001` and the frontend on `http://localhost:5173`. Open the frontend URL in a browser.

## Test multiplayer with two windows

Every browser tab is its own user, so any of these gives you two users on the same backend:

- a normal Chrome window and an Incognito window
- two Chrome profiles
- two tabs in the same window

With both open on `http://localhost:5173`:

1. Both show `2 online` in the top bar, and both avatars stand in the Lounge.
2. Walk with WASD or the arrow keys in one window. The other window shows the avatar move.
3. Press Enter, type, press Enter. The message appears in both windows while both are in the same room.
4. Walk one avatar out of the room. The other window logs `<name> left`, and messages no longer cross between them.
5. Walk it into the room the other avatar is in. That window logs `<name> entered`, and chat works again.
6. Switch one window to **Edit world**, create a room and click a free spot. It appears in the other window.
7. Drag a room onto another one. It turns red and snaps back when released. Move, resize or delete a room and watch the other window follow.
8. Close one window. The other drops to `1 online`.

Both servers listen on this machine only. To let a phone or another laptop on the same network join, set `HOST=0.0.0.0` in `.env`, run `npm run dev:server` in one terminal and `npm run dev:web -- --host` in another, then open the network URL that Vite prints. The operating system may ask to allow Node through its firewall.

## Controls

Play mode

| Input | Action |
| --- | --- |
| WASD or arrow keys | Walk |
| Enter | Start typing, then send |
| Esc | Leave the chat box |
| Scroll | Zoom |

Edit mode

| Input | Action |
| --- | --- |
| Create room, then click | Place a new room (green fits, red overlaps) |
| Click a room | Select it |
| Drag a room | Move it |
| Drag an edge or corner | Resize it |
| Arrow keys | Nudge the selected room (Shift for bigger steps) |
| Delete | Delete the selected room |
| Esc | Cancel placing or deselect |
| Drag empty space, scroll | Pan and zoom |

## How it fits together

`shared/geometry.ts` holds the placement rules: `roomsOverlap(a, b)` and `validateRoom(candidate, rooms, world)`. The editor uses them for the live valid or invalid state while dragging. The server uses the same functions before it accepts any change, so a client cannot create an overlap even if it skips its own check.

The server owns the world. Room edits are sent with an acknowledgement:

- accepted: the server saves the change and broadcasts it to the other clients
- rejected: the reply carries the reason and the room as the server has it, and the client restores that

The client applies its own edits immediately and rolls back on a rejection. On every connect or reconnect it asks for a full snapshot.

Each world room maps to a Socket.IO room. The server decides which room a player is in from their position, moves the socket between Socket.IO rooms as they walk, and sends chat only to that room. Everyone outside a room shares one channel.

```
shared/    types, constants, geometry rules, socket event types
server/    Express + Socket.IO app, world state, persistence
src/       React app: world canvas, editor, play mode, socket client
tests/     geometry, resize math, and server tests over real sockets
```

## Configuration

Nothing needs to be set for local use. To override a default, copy `.env.example` to `.env`.

| Variable | Used by | Default | Purpose |
| --- | --- | --- | --- |
| `PORT` | backend | `3001` | Port the backend listens on |
| `HOST` | backend | `127.0.0.1` | Address the backend binds to |
| `CLIENT_ORIGIN` | backend | any origin | Comma-separated frontend origins allowed to connect |
| `DATA_DIR` | backend | `data` | Folder that holds `world.json` |
| `VITE_SERVER_URL` | frontend | this host, port 3001 | Address of the backend |

Pointing the frontend at a hosted backend later only needs `VITE_SERVER_URL`, plus `CLIENT_ORIGIN` on that backend.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Backend and frontend together, both reloading on change |
| `npm run dev:server` | Backend only |
| `npm run dev:web` | Frontend only |
| `npm test` | Unit tests and server tests |
| `npm run build` | Type-check and build the frontend into `dist/` |

## Resetting the world

Rooms are saved in `data/world.json`. Stop the backend and delete that file to start again with the three starter rooms.

## Not built yet

- Production deployment of the backend
- Accounts: anyone who can open the page can edit the world
- Chat history: messages are not stored
