import { WORLD } from '../../shared/constants';
import { clamp } from '../../shared/geometry';
import type { Point, Rect, Room } from '../../shared/types';

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 2.5;

export const viewport = { width: 0, height: 0 };
export const camera = { x: 0, y: 0, zoom: 1 };

export function screenToWorld(sx: number, sy: number): Point {
  return { x: camera.x + sx / camera.zoom, y: camera.y + sy / camera.zoom };
}

export function worldToScreen(wx: number, wy: number): Point {
  return { x: (wx - camera.x) * camera.zoom, y: (wy - camera.y) * camera.zoom };
}

export function visibleRect(): Rect {
  return {
    x: camera.x,
    y: camera.y,
    width: viewport.width / camera.zoom,
    height: viewport.height / camera.zoom,
  };
}

// Keeps the centre of the view inside the world so the map can never be lost off screen.
function constrain(): void {
  const halfWidth = viewport.width / (2 * camera.zoom);
  const halfHeight = viewport.height / (2 * camera.zoom);
  camera.x = clamp(camera.x, -halfWidth, WORLD.width - halfWidth);
  camera.y = clamp(camera.y, -halfHeight, WORLD.height - halfHeight);
}

// The part of the canvas that the floating panels leave uncovered.
function clearArea(): Rect {
  const left = viewport.width > 900 ? 296 : 16;
  return { x: left, y: 16, width: viewport.width - left - 16, height: viewport.height - 88 };
}

export function centerOn(point: Point): void {
  camera.x = point.x - viewport.width / (2 * camera.zoom);
  camera.y = point.y - viewport.height / (2 * camera.zoom);
  constrain();
}

export function focusOn(point: Point): void {
  const area = clearArea();
  camera.x = point.x - (area.x + area.width / 2) / camera.zoom;
  camera.y = point.y - (area.y + area.height / 2) / camera.zoom;
  constrain();
}

export function panBy(dx: number, dy: number): void {
  camera.x -= dx / camera.zoom;
  camera.y -= dy / camera.zoom;
  constrain();
}

export function zoomAt(sx: number, sy: number, factor: number): void {
  const anchor = screenToWorld(sx, sy);
  camera.zoom = clamp(camera.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  camera.x = anchor.x - sx / camera.zoom;
  camera.y = anchor.y - sy / camera.zoom;
  constrain();
}

export function zoomBy(factor: number): void {
  zoomAt(viewport.width / 2, viewport.height / 2, factor);
}

export function fitRect(rect: Rect, maxZoom = MAX_ZOOM, padding = 48): void {
  const area = clearArea();
  const zoom = Math.min(
    (area.width - padding * 2) / rect.width,
    (area.height - padding * 2) / rect.height,
  );
  camera.zoom = clamp(zoom, MIN_ZOOM, maxZoom);
  focusOn({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
}

export function fitRooms(rooms: Room[]): void {
  if (rooms.length === 0) {
    fitRect({ x: 0, y: 0, width: WORLD.width, height: WORLD.height });
    return;
  }
  const left = Math.min(...rooms.map((room) => room.x));
  const top = Math.min(...rooms.map((room) => room.y));
  const right = Math.max(...rooms.map((room) => room.x + room.width));
  const bottom = Math.max(...rooms.map((room) => room.y + room.height));
  fitRect({ x: left, y: top, width: right - left, height: bottom - top }, 1.25);
}
