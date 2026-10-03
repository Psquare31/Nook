import {
  CHAT_MAX,
  MAX_ROOMS,
  PLAYER_NAME_MAX,
  ROOM_MAX,
  ROOM_MIN,
  ROOM_NAME_MAX,
} from '../../shared/constants';
import { validateRoom } from '../../shared/geometry';
import type { RejectReason, RoomAck } from '../../shared/protocol';
import type { Room } from '../../shared/types';
import { saveName } from '../lib/session';
import { socket } from '../net/socket';
import { canBuild, canEdit, useStore } from './store';

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? 'another room';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

export function describeRejection(reason: RejectReason, conflicts: string[] = []): string {
  switch (reason) {
    case 'overlap': {
      const { rooms } = useStore.getState();
      const names = conflicts.map((id) => rooms[id]?.name).filter((name) => name !== undefined);
      return `Overlaps ${listNames(names)}`;
    }
    case 'bounds':
      return 'Rooms have to stay inside the world';
    case 'size':
      return `Rooms must be between ${ROOM_MIN} and ${ROOM_MAX} on each side`;
    case 'name':
      return `Room names need 1 to ${ROOM_NAME_MAX} characters`;
    case 'signin':
      return useStore.getState().auth.googleClientId
        ? 'Sign in with Google to build rooms'
        : 'Building is off until Google sign-in is set up on the server';
    case 'forbidden':
      return 'Only the person who created a room can change it';
    case 'limit':
      return `This world already has ${MAX_ROOMS} rooms`;
    case 'missing':
      return 'That room no longer exists';
    case 'exists':
    case 'invalid':
      return 'The server did not accept that room';
  }
}

function online(): boolean {
  const { connection, toast } = useStore.getState();
  if (connection !== 'online') toast('Not connected to the server');
  return connection === 'online';
}

function owns(id: string): boolean {
  const state = useStore.getState();
  const room = state.rooms[id];
  const allowed = room !== undefined && canEdit(state, room);
  if (!allowed) state.toast(describeRejection('forbidden'));
  return allowed;
}

// Checked here for instant feedback; the server runs the same checks and has the final say.
function fits(room: Room): boolean {
  const { rooms, world, toast } = useStore.getState();
  const result = validateRoom(room, Object.values(rooms), world);
  if (!result.ok) toast(describeRejection(result.reason, result.conflicts));
  return result.ok;
}

function settle(attempted: Room, result: RoomAck): void {
  const { upsertRoom, removeRoom, toast } = useStore.getState();
  if (result.ok) {
    upsertRoom(result.room);
    return;
  }
  if (result.room) upsertRoom(result.room);
  else removeRoom(attempted.id);
  toast(describeRejection(result.reason, result.conflicts));
}

export function createRoom(room: Room): boolean {
  if (!online()) return false;
  if (!canBuild(useStore.getState())) {
    useStore.getState().toast(describeRejection('signin'));
    return false;
  }
  if (!fits(room)) return false;
  useStore.getState().upsertRoom(room);
  socket.emit('room:create', room, (result) => settle(room, result));
  return true;
}

export function updateRoom(room: Room): boolean {
  if (!online() || !owns(room.id) || !fits(room)) return false;
  useStore.getState().upsertRoom(room);
  socket.emit('room:update', room, (result) => settle(room, result));
  return true;
}

export function deleteRoom(id: string): void {
  if (!online() || !owns(id)) return;
  useStore.getState().removeRoom(id);
  socket.emit('room:delete', id, (result) => {
    if (result.ok) return;
    const { upsertRoom, toast } = useStore.getState();
    if (result.room) upsertRoom(result.room);
    toast(describeRejection(result.reason));
  });
}

export function sendChat(text: string): void {
  const trimmed = text.trim().slice(0, CHAT_MAX);
  if (trimmed && online()) socket.emit('chat:send', trimmed);
}

export function rename(name: string): boolean {
  const cleaned = name.trim().replace(/\s+/g, ' ').slice(0, PLAYER_NAME_MAX);
  if (!cleaned) return false;

  const { selfId, setName, patchPlayer } = useStore.getState();
  setName(cleaned);
  saveName(cleaned);
  if (selfId) patchPlayer(selfId, { name: cleaned });
  if (socket.connected) socket.emit('player:rename', cleaned);
  return true;
}
