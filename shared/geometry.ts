import { GRID, ROOM_MAX, ROOM_MIN, ROOM_NAME_MAX } from './constants';
import type { Point, Rect, Room, World } from './types';

export type PlacementReason = 'name' | 'size' | 'bounds' | 'overlap';

export type Validation =
  | { ok: true }
  | { ok: false; reason: PlacementReason; conflicts: string[] };

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function snap(value: number, grid = GRID): number {
  return Math.round(value / grid) * grid;
}

// Strict comparison: rooms that only share an edge or a corner do not overlap.
export function roomsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function findOverlaps(candidate: Room, rooms: Iterable<Room>): string[] {
  const ids: string[] = [];
  for (const room of rooms) {
    if (room.id !== candidate.id && roomsOverlap(candidate, room)) ids.push(room.id);
  }
  return ids;
}

export function withinWorld(rect: Rect, world: World): boolean {
  return (
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.x + rect.width <= world.width &&
    rect.y + rect.height <= world.height
  );
}

export function clampToWorld<T extends Rect>(rect: T, world: World): T {
  return {
    ...rect,
    x: clamp(rect.x, 0, Math.max(0, world.width - rect.width)),
    y: clamp(rect.y, 0, Math.max(0, world.height - rect.height)),
  };
}

// Half-open on the far edges, so a point on a wall shared by two rooms is in exactly one.
export function contains(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x < rect.x + rect.width &&
    point.y >= rect.y &&
    point.y < rect.y + rect.height
  );
}

export function roomAt(point: Point, rooms: Iterable<Room>): Room | null {
  for (const room of rooms) {
    if (contains(room, point)) return room;
  }
  return null;
}

function sizeAllowed(value: number): boolean {
  return value >= ROOM_MIN && value <= ROOM_MAX;
}

function reject(reason: PlacementReason): Validation {
  return { ok: false, reason, conflicts: [] };
}

export function validateRoom(candidate: Room, rooms: Iterable<Room>, world: World): Validation {
  const name = candidate.name.trim();
  if (name.length === 0 || name.length > ROOM_NAME_MAX) return reject('name');
  if (!sizeAllowed(candidate.width) || !sizeAllowed(candidate.height)) return reject('size');
  if (!withinWorld(candidate, world)) return reject('bounds');

  const conflicts = findOverlaps(candidate, rooms);
  if (conflicts.length > 0) return { ok: false, reason: 'overlap', conflicts };

  return { ok: true };
}
