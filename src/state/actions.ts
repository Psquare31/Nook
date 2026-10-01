import {
  CHAT_MAX,
  PLAYER_NAME_MAX,
  ROOM_MAX,
  ROOM_MIN,
  ROOM_NAME_MAX,
} from '../../shared/constants';
import { validateRoom, type PlacementReason } from '../../shared/geometry';
import type { Room } from '../../shared/types';
import { newId } from '../lib/id';
import { saveName } from '../lib/session';
import { say } from '../world/avatars';
import { selfPlayer, useStore } from './store';

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? 'another room';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

export function describeRejection(reason: PlacementReason, conflicts: string[]): string {
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
  }
}

function accept(room: Room): boolean {
  const { rooms, world, toast } = useStore.getState();
  const result = validateRoom(room, Object.values(rooms), world);
  if (!result.ok) toast(describeRejection(result.reason, result.conflicts));
  return result.ok;
}

export function createRoom(room: Room): boolean {
  if (!accept(room)) return false;
  useStore.getState().upsertRoom(room);
  return true;
}

export function updateRoom(room: Room): boolean {
  if (!accept(room)) return false;
  useStore.getState().upsertRoom(room);
  return true;
}

export function deleteRoom(id: string): void {
  useStore.getState().removeRoom(id);
}

export function enterRoom(roomId: string | null): void {
  const state = useStore.getState();
  const me = selfPlayer(state);
  if (!me || me.roomId === roomId) return;

  const left = me.roomId ? state.rooms[me.roomId]?.name : undefined;
  const entered = roomId ? state.rooms[roomId]?.name : undefined;
  state.upsertPlayer({ ...me, roomId });
  state.pushChat({
    kind: 'system',
    id: newId(),
    text: entered ? `You entered ${entered}` : `You left ${left ?? 'the room'}`,
  });
}

export function sendChat(text: string): void {
  const state = useStore.getState();
  const me = selfPlayer(state);
  const trimmed = text.trim().slice(0, CHAT_MAX);
  if (!me || !trimmed) return;

  state.pushChat({
    kind: 'message',
    id: newId(),
    from: { id: me.id, name: me.name, color: me.color },
    text: trimmed,
  });
  say(me.id, trimmed);
}

export function rename(name: string): boolean {
  const state = useStore.getState();
  const me = selfPlayer(state);
  const cleaned = name.trim().replace(/\s+/g, ' ').slice(0, PLAYER_NAME_MAX);
  if (!me || !cleaned) return false;

  state.upsertPlayer({ ...me, name: cleaned });
  saveName(cleaned);
  return true;
}
