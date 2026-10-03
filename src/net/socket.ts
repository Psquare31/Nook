import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  Snapshot,
} from '../../shared/protocol';
import { clearSession, loadSession, loadUserKey } from '../lib/session';
import { selfPlayer, useStore } from '../state/store';
import {
  bubbles,
  dropRemote,
  hasSavedPosition,
  moveRemote,
  placeRemote,
  remotes,
  say,
  self,
} from '../world/avatars';

const url =
  import.meta.env.VITE_SERVER_URL || `${window.location.protocol}//${window.location.hostname}:3001`;

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(url, {
  transports: ['websocket'],
  // Read on every connection attempt, so signing in or out only needs a reconnect.
  auth: (send) => send({ session: loadSession() ?? undefined }),
});

export function reconnect(): void {
  socket.disconnect();
  socket.connect();
}

function roomName(roomId: string | null): string | undefined {
  return roomId ? useStore.getState().rooms[roomId]?.name : undefined;
}

const userKey = loadUserKey();

// A tab with no saved position lets the server pick a free spot near the spawn.
let placed = hasSavedPosition;

function applySnapshot(snapshot: Snapshot): void {
  const before = selfPlayer(useStore.getState());
  const { account } = snapshot.auth;

  // The server did not accept the stored session: it expired, or sign-in was switched off.
  if (!account && loadSession()) {
    clearSession();
    if (snapshot.auth.googleClientId) useStore.getState().toast('Your sign-in expired. Sign in again to build.');
  }
  useStore.getState().applySnapshot(snapshot);
  if (account) useStore.getState().setName(account.name);
  placed = true;

  remotes.clear();
  bubbles.clear();
  for (const player of snapshot.players) {
    if (player.id === snapshot.selfId) {
      self.x = player.x;
      self.y = player.y;
    } else {
      placeRemote(player.id, player.x, player.y);
    }
  }

  const me = selfPlayer(useStore.getState());
  const entered = roomName(me?.roomId ?? null);
  if (entered && me?.roomId !== before?.roomId) useStore.getState().notice(`You entered ${entered}`);
}

socket.on('connect', () => {
  const { name } = useStore.getState();
  const position = placed ? { x: Math.round(self.x), y: Math.round(self.y) } : {};
  socket.emit('join', { name, key: userKey, ...position }, applySnapshot);
});

socket.on('disconnect', () => useStore.getState().setConnection('offline'));
socket.on('connect_error', () => useStore.getState().setConnection('offline'));

socket.on('room:created', (room) => useStore.getState().upsertRoom(room));
socket.on('room:updated', (room) => useStore.getState().upsertRoom(room));
socket.on('room:deleted', (id) => useStore.getState().removeRoom(id));

socket.on('player:joined', (player) => {
  const state = useStore.getState();
  const { x, y, ...info } = player;
  state.upsertPlayer(info);
  placeRemote(player.id, x, y);

  const mine = selfPlayer(state)?.roomId ?? null;
  if (mine !== null && player.roomId === mine) state.notice(`${player.name} entered`);
});

socket.on('player:left', (id) => {
  const state = useStore.getState();
  const player = state.players[id];
  const mine = selfPlayer(state)?.roomId ?? null;
  if (player && mine !== null && player.roomId === mine) state.notice(`${player.name} left`);

  state.removePlayer(id);
  dropRemote(id);
});

socket.on('player:moved', ({ id, x, y }) => {
  if (id !== useStore.getState().selfId) moveRemote(id, x, y);
});

socket.on('player:room', ({ id, roomId }) => {
  const state = useStore.getState();
  const player = state.players[id];
  if (!player) return;

  const previous = player.roomId;
  const mine = selfPlayer(state)?.roomId ?? null;
  const left = roomName(previous);
  state.patchPlayer(id, { roomId });

  if (id === state.selfId) {
    const entered = roomName(roomId);
    state.notice(entered ? `You entered ${entered}` : `You left ${left ?? 'the room'}`);
  } else if (mine !== null && roomId === mine) {
    state.notice(`${player.name} entered`);
  } else if (mine !== null && previous === mine) {
    state.notice(`${player.name} left`);
  }
});

socket.on('player:renamed', ({ id, name }) => useStore.getState().patchPlayer(id, { name }));

socket.on('chat:message', (message) => {
  useStore.getState().pushChat({ kind: 'message', ...message });
  say(message.from.id, message.text);
});

// Without this, a hot reload of this module would leave the old connection behind as a ghost player.
if (import.meta.hot) import.meta.hot.dispose(() => socket.disconnect());
