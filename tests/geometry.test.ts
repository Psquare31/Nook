import { describe, expect, it } from 'vitest';
import { ROOM_MAX, ROOM_MIN, STARTER_ROOMS, SPAWN, WORLD } from '../shared/constants';
import {
  clampToWorld,
  findOverlaps,
  roomAt,
  roomsOverlap,
  snap,
  validateRoom,
  withinWorld,
} from '../shared/geometry';
import type { RoomShape } from '../shared/types';

const room = (id: string, x: number, y: number, width = 200, height = 200): RoomShape => ({
  id,
  name: id,
  x,
  y,
  width,
  height,
});

describe('roomsOverlap', () => {
  it('detects partially overlapping rooms', () => {
    expect(roomsOverlap(room('a', 0, 0), room('b', 100, 100))).toBe(true);
  });

  it('is symmetric', () => {
    const a = room('a', 0, 0);
    const b = room('b', 150, 50);
    expect(roomsOverlap(a, b)).toBe(roomsOverlap(b, a));
  });

  it('detects a room fully inside another', () => {
    expect(roomsOverlap(room('a', 0, 0, 600, 600), room('b', 200, 200))).toBe(true);
  });

  it('treats identical rectangles as overlapping', () => {
    expect(roomsOverlap(room('a', 50, 50), room('b', 50, 50))).toBe(true);
  });

  it('allows rooms separated by a gap', () => {
    expect(roomsOverlap(room('a', 0, 0), room('b', 300, 0))).toBe(false);
    expect(roomsOverlap(room('a', 0, 0), room('b', 0, 300))).toBe(false);
  });

  it('allows rooms that share an edge', () => {
    expect(roomsOverlap(room('a', 0, 0), room('b', 200, 0))).toBe(false);
    expect(roomsOverlap(room('a', 0, 0), room('b', 0, 200))).toBe(false);
  });

  it('allows rooms that touch only at a corner', () => {
    expect(roomsOverlap(room('a', 0, 0), room('b', 200, 200))).toBe(false);
  });

  it('detects a one pixel overlap', () => {
    expect(roomsOverlap(room('a', 0, 0), room('b', 199, 0))).toBe(true);
  });
});

describe('findOverlaps', () => {
  const rooms = [room('a', 0, 0), room('b', 300, 0), room('c', 600, 0)];

  it('returns every room the candidate overlaps', () => {
    expect(findOverlaps(room('new', 150, 0, 400, 200), rooms)).toEqual(['a', 'b']);
  });

  it('ignores the room with the same id', () => {
    expect(findOverlaps(room('a', 10, 10), rooms)).toEqual([]);
  });

  it('returns nothing for free space', () => {
    expect(findOverlaps(room('new', 0, 400), rooms)).toEqual([]);
  });
});

describe('withinWorld', () => {
  it('accepts a room flush against every edge', () => {
    expect(withinWorld({ x: 0, y: 0, width: WORLD.width, height: WORLD.height }, WORLD)).toBe(true);
  });

  it('rejects a room past any edge', () => {
    expect(withinWorld(room('a', -10, 0), WORLD)).toBe(false);
    expect(withinWorld(room('a', 0, -10), WORLD)).toBe(false);
    expect(withinWorld(room('a', WORLD.width - 190, 0), WORLD)).toBe(false);
    expect(withinWorld(room('a', 0, WORLD.height - 190), WORLD)).toBe(false);
  });
});

describe('clampToWorld', () => {
  it('pulls a room back inside the world and keeps its size', () => {
    expect(clampToWorld(room('a', -50, WORLD.height), WORLD)).toMatchObject({
      x: 0,
      y: WORLD.height - 200,
      width: 200,
      height: 200,
    });
  });

  it('leaves a room that is already inside untouched', () => {
    expect(clampToWorld(room('a', 300, 400), WORLD)).toMatchObject({ x: 300, y: 400 });
  });
});

describe('snap', () => {
  it('rounds to the nearest grid step', () => {
    expect(snap(254)).toBe(250);
    expect(snap(255)).toBe(260);
    expect(snap(37, 25)).toBe(25);
  });
});

describe('roomAt', () => {
  const rooms = [room('a', 0, 0), room('b', 200, 0)];

  it('finds the room under a point', () => {
    expect(roomAt({ x: 50, y: 50 }, rooms)?.id).toBe('a');
    expect(roomAt({ x: 350, y: 50 }, rooms)?.id).toBe('b');
  });

  it('returns null outside every room', () => {
    expect(roomAt({ x: 500, y: 500 }, rooms)).toBeNull();
  });

  it('assigns a point on a shared wall to exactly one room', () => {
    expect(roomAt({ x: 200, y: 50 }, rooms)?.id).toBe('b');
    expect(roomAt({ x: 400, y: 50 }, rooms)).toBeNull();
  });
});

describe('validateRoom', () => {
  const rooms = [room('a', 0, 0), room('b', 300, 0)];

  it('accepts a room in free space', () => {
    expect(validateRoom(room('new', 0, 300), rooms, WORLD)).toEqual({ ok: true });
  });

  it('accepts a room placed wall to wall with a neighbour', () => {
    expect(validateRoom(room('new', 500, 0), rooms, WORLD)).toEqual({ ok: true });
  });

  it('rejects an overlap and names the conflicting rooms', () => {
    expect(validateRoom(room('new', 100, 100, 300, 200), rooms, WORLD)).toEqual({
      ok: false,
      reason: 'overlap',
      conflicts: ['a', 'b'],
    });
  });

  it('lets a room move without colliding with itself', () => {
    expect(validateRoom(room('a', 20, 20), rooms, WORLD)).toEqual({ ok: true });
  });

  it('still rejects a moved room that lands on a neighbour', () => {
    expect(validateRoom(room('a', 200, 0), rooms, WORLD)).toMatchObject({
      ok: false,
      reason: 'overlap',
      conflicts: ['b'],
    });
  });

  it('rejects a room outside the world', () => {
    expect(validateRoom(room('new', WORLD.width - 100, 0), rooms, WORLD)).toMatchObject({
      ok: false,
      reason: 'bounds',
    });
  });

  it('rejects sizes outside the allowed range', () => {
    expect(validateRoom(room('new', 0, 300, ROOM_MIN - 10, 200), rooms, WORLD)).toMatchObject({
      reason: 'size',
    });
    expect(validateRoom(room('new', 0, 300, 200, ROOM_MAX + 10), rooms, WORLD)).toMatchObject({
      reason: 'size',
    });
  });

  it('rejects an empty or oversized name', () => {
    expect(validateRoom({ ...room('new', 0, 300), name: '   ' }, rooms, WORLD)).toMatchObject({
      reason: 'name',
    });
    expect(
      validateRoom({ ...room('new', 0, 300), name: 'x'.repeat(40) }, rooms, WORLD),
    ).toMatchObject({ reason: 'name' });
  });

  it('rejects non-finite coordinates and sizes', () => {
    expect(validateRoom(room('new', Number.NaN, 0), rooms, WORLD)).toMatchObject({ ok: false });
    expect(validateRoom(room('new', 0, 300, Number.NaN, 200), rooms, WORLD)).toMatchObject({
      ok: false,
    });
    expect(validateRoom(room('new', Infinity, 0), rooms, WORLD)).toMatchObject({ ok: false });
  });
});

describe('starter rooms', () => {
  it('are valid and do not overlap each other', () => {
    for (const starter of STARTER_ROOMS) {
      expect(validateRoom(starter, STARTER_ROOMS, WORLD)).toEqual({ ok: true });
    }
  });

  it('put the spawn point inside a room', () => {
    expect(roomAt(SPAWN, STARTER_ROOMS)).not.toBeNull();
  });
});
