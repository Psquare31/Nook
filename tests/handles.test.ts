import { describe, expect, it } from 'vitest';
import { ROOM_MAX, ROOM_MIN, WORLD } from '../shared/constants';
import { handlePoint, hitHandle, resizeRect } from '../src/editor/handles';

const origin = { x: 1000, y: 1000, width: 400, height: 300 };

describe('handlePoint', () => {
  it('places corner and edge handles on the outline', () => {
    expect(handlePoint(origin, 'nw')).toEqual({ x: 1000, y: 1000 });
    expect(handlePoint(origin, 'se')).toEqual({ x: 1400, y: 1300 });
    expect(handlePoint(origin, 'n')).toEqual({ x: 1200, y: 1000 });
    expect(handlePoint(origin, 'e')).toEqual({ x: 1400, y: 1150 });
  });
});

describe('hitHandle', () => {
  it('finds a corner handle within reach', () => {
    expect(hitHandle(origin, { x: 1403, y: 1297 }, 8)).toBe('se');
  });

  it('prefers a corner over the edge it sits on', () => {
    expect(hitHandle(origin, { x: 1000, y: 1004 }, 8)).toBe('nw');
  });

  it('treats any point along an edge as that edge', () => {
    expect(hitHandle(origin, { x: 1100, y: 1002 }, 8)).toBe('n');
    expect(hitHandle(origin, { x: 1398, y: 1080 }, 8)).toBe('e');
  });

  it('returns null in the middle of the room and far outside it', () => {
    expect(hitHandle(origin, { x: 1200, y: 1150 }, 8)).toBeNull();
    expect(hitHandle(origin, { x: 2000, y: 2000 }, 8)).toBeNull();
  });
});

describe('resizeRect', () => {
  it('grows from the east edge and keeps the origin fixed', () => {
    expect(resizeRect(origin, 'e', { x: 1603, y: 0 }, WORLD)).toEqual({
      x: 1000,
      y: 1000,
      width: 600,
      height: 300,
    });
  });

  it('moves the origin when dragging the west edge and keeps the right edge fixed', () => {
    const next = resizeRect(origin, 'w', { x: 900, y: 0 }, WORLD);
    expect(next).toEqual({ x: 900, y: 1000, width: 500, height: 300 });
    expect(next.x + next.width).toBe(origin.x + origin.width);
  });

  it('resizes both axes from a corner', () => {
    expect(resizeRect(origin, 'nw', { x: 950, y: 940 }, WORLD)).toEqual({
      x: 950,
      y: 940,
      width: 450,
      height: 360,
    });
  });

  it('snaps to the grid', () => {
    expect(resizeRect(origin, 'se', { x: 1456, y: 1344 }, WORLD)).toMatchObject({
      width: 460,
      height: 340,
    });
  });

  it('never shrinks below the minimum size', () => {
    expect(resizeRect(origin, 'e', { x: 0, y: 0 }, WORLD).width).toBe(ROOM_MIN);
    const fromWest = resizeRect(origin, 'w', { x: 5000, y: 0 }, WORLD);
    expect(fromWest.width).toBe(ROOM_MIN);
    expect(fromWest.x + fromWest.width).toBe(origin.x + origin.width);
  });

  it('never grows past the maximum size', () => {
    expect(resizeRect(origin, 'e', { x: 9000, y: 0 }, WORLD).width).toBe(ROOM_MAX);
    expect(resizeRect(origin, 'n', { x: 0, y: -9000 }, WORLD).height).toBeLessThanOrEqual(ROOM_MAX);
  });

  it('stops at the world edges', () => {
    const nearEdge = { x: WORLD.width - 300, y: 100, width: 200, height: 200 };
    const grown = resizeRect(nearEdge, 'e', { x: WORLD.width + 500, y: 0 }, WORLD);
    expect(grown.x + grown.width).toBe(WORLD.width);

    const nearTop = { x: 100, y: 50, width: 200, height: 200 };
    expect(resizeRect(nearTop, 'n', { x: 0, y: -400 }, WORLD).y).toBe(0);
  });
});
