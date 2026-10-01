import { ROOM_MAX, ROOM_MIN } from '../../shared/constants';
import { clamp, snap } from '../../shared/geometry';
import type { Point, Rect, World } from '../../shared/types';

export type Handle = 'nw' | 'ne' | 'se' | 'sw' | 'n' | 'e' | 's' | 'w';

// Corners come first so they win when handles crowd together on a small room.
export const HANDLES: Handle[] = ['nw', 'ne', 'se', 'sw', 'n', 'e', 's', 'w'];

export function handlePoint(rect: Rect, handle: Handle): Point {
  const x = handle.includes('w')
    ? rect.x
    : handle.includes('e')
      ? rect.x + rect.width
      : rect.x + rect.width / 2;
  const y = handle.includes('n')
    ? rect.y
    : handle.includes('s')
      ? rect.y + rect.height
      : rect.y + rect.height / 2;
  return { x, y };
}

export function hitHandle(rect: Rect, point: Point, reach: number): Handle | null {
  for (const handle of HANDLES) {
    const at = handlePoint(rect, handle);
    if (Math.abs(point.x - at.x) <= reach && Math.abs(point.y - at.y) <= reach) return handle;
  }

  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const withinX = point.x >= rect.x && point.x <= right;
  const withinY = point.y >= rect.y && point.y <= bottom;
  if (withinX && Math.abs(point.y - rect.y) <= reach) return 'n';
  if (withinX && Math.abs(point.y - bottom) <= reach) return 's';
  if (withinY && Math.abs(point.x - rect.x) <= reach) return 'w';
  if (withinY && Math.abs(point.x - right) <= reach) return 'e';
  return null;
}

export function resizeRect(origin: Rect, handle: Handle, point: Point, world: World): Rect {
  let left = origin.x;
  let top = origin.y;
  let right = origin.x + origin.width;
  let bottom = origin.y + origin.height;

  if (handle.includes('w')) {
    left = clamp(snap(point.x), Math.max(0, right - ROOM_MAX), right - ROOM_MIN);
  }
  if (handle.includes('e')) {
    right = clamp(snap(point.x), left + ROOM_MIN, Math.min(world.width, left + ROOM_MAX));
  }
  if (handle.includes('n')) {
    top = clamp(snap(point.y), Math.max(0, bottom - ROOM_MAX), bottom - ROOM_MIN);
  }
  if (handle.includes('s')) {
    bottom = clamp(snap(point.y), top + ROOM_MIN, Math.min(world.height, top + ROOM_MAX));
  }

  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function handleCursor(handle: Handle): string {
  switch (handle) {
    case 'n':
    case 's':
      return 'ns-resize';
    case 'e':
    case 'w':
      return 'ew-resize';
    case 'nw':
    case 'se':
      return 'nwse-resize';
    default:
      return 'nesw-resize';
  }
}
