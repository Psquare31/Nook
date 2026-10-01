import { ROOM_MAX, ROOM_MIN, ROOM_NAME_MAX } from '../../shared/constants';
import { validateRoom, type PlacementReason } from '../../shared/geometry';
import type { Room } from '../../shared/types';
import { useStore } from './store';

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
