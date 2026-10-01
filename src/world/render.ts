import { roomsOverlap } from '../../shared/geometry';
import type { Rect, Room, World } from '../../shared/types';
import { useStore } from '../state/store';
import { camera, viewport, visibleRect, worldToScreen } from './camera';

const COLORS = {
  void: '#101119',
  ground: '#22253a',
  gridFine: 'rgba(255, 255, 255, 0.025)',
  gridMinor: 'rgba(255, 255, 255, 0.04)',
  gridMajor: 'rgba(255, 255, 255, 0.08)',
  worldEdge: 'rgba(255, 255, 255, 0.2)',
  wall: '#2b2540',
  shadow: 'rgba(0, 0, 0, 0.3)',
  plate: 'rgba(22, 23, 34, 0.9)',
  plateText: '#f4f5fb',
};

const TINTS = [
  { light: '#f6ecd9', dark: '#ecdfc6', wall: '#c9b48c' },
  { light: '#e0f0e6', dark: '#d1e6d9', wall: '#93bfa4' },
  { light: '#e4e8f8', dark: '#d5dbf1', wall: '#9aa5d6' },
  { light: '#f8e3e3', dark: '#efd3d3', wall: '#d59c9c' },
  { light: '#e1f1f8', dark: '#d0e6f0', wall: '#8fbdd3' },
  { light: '#f5efcc', dark: '#ebe3b6', wall: '#c9bb72' },
];

const TILE = 50;
const WALL_BAND = 18;
const BORDER = 6;
const LABEL_FONT = '600 12px ui-sans-serif, system-ui, "Segoe UI", sans-serif';

function hash(text: string): number {
  let value = 0;
  for (let i = 0; i < text.length; i++) value = (value * 31 + text.charCodeAt(i)) >>> 0;
  return value;
}

function strokeGrid(
  ctx: CanvasRenderingContext2D,
  step: number,
  color: string,
  area: { left: number; top: number; right: number; bottom: number },
): void {
  ctx.beginPath();
  for (let x = Math.ceil(area.left / step) * step; x <= area.right; x += step) {
    ctx.moveTo(x, area.top);
    ctx.lineTo(x, area.bottom);
  }
  for (let y = Math.ceil(area.top / step) * step; y <= area.bottom; y += step) {
    ctx.moveTo(area.left, y);
    ctx.lineTo(area.right, y);
  }
  ctx.strokeStyle = color;
  ctx.stroke();
}

function drawGround(ctx: CanvasRenderingContext2D, world: World, view: Rect, zoom: number): void {
  ctx.fillStyle = COLORS.ground;
  ctx.fillRect(0, 0, world.width, world.height);

  const area = {
    left: Math.max(0, view.x),
    top: Math.max(0, view.y),
    right: Math.min(world.width, view.x + view.width),
    bottom: Math.min(world.height, view.y + view.height),
  };
  if (area.left >= area.right || area.top >= area.bottom) return;

  ctx.lineWidth = 1 / zoom;
  if (zoom >= 1.6) strokeGrid(ctx, 10, COLORS.gridFine, area);
  if (zoom >= 0.5) strokeGrid(ctx, 50, COLORS.gridMinor, area);
  strokeGrid(ctx, 250, COLORS.gridMajor, area);

  ctx.strokeStyle = COLORS.worldEdge;
  ctx.lineWidth = 2 / zoom;
  ctx.strokeRect(0, 0, world.width, world.height);
}

function drawRoom(ctx: CanvasRenderingContext2D, room: Room, view: Rect, zoom: number): void {
  const tint = TINTS[hash(room.id) % TINTS.length];

  ctx.fillStyle = tint.light;
  ctx.fillRect(room.x, room.y, room.width, room.height);

  if (zoom >= 0.35) {
    const left = Math.max(room.x, view.x);
    const top = Math.max(room.y, view.y);
    const right = Math.min(room.x + room.width, view.x + view.width);
    const bottom = Math.min(room.y + room.height, view.y + view.height);
    const firstColumn = Math.floor((left - room.x) / TILE);
    const lastColumn = Math.ceil((right - room.x) / TILE);
    const firstRow = Math.floor((top - room.y) / TILE);
    const lastRow = Math.ceil((bottom - room.y) / TILE);

    ctx.save();
    ctx.beginPath();
    ctx.rect(room.x, room.y, room.width, room.height);
    ctx.clip();
    ctx.fillStyle = tint.dark;
    for (let row = firstRow; row < lastRow; row++) {
      for (let column = firstColumn; column < lastColumn; column++) {
        if ((row + column) % 2 === 1) {
          ctx.fillRect(room.x + column * TILE, room.y + row * TILE, TILE, TILE);
        }
      }
    }
    ctx.restore();
  }

  ctx.fillStyle = tint.wall;
  ctx.fillRect(room.x, room.y, room.width, WALL_BAND);

  ctx.strokeStyle = COLORS.wall;
  ctx.lineWidth = BORDER;
  ctx.strokeRect(
    room.x + BORDER / 2,
    room.y + BORDER / 2,
    room.width - BORDER,
    room.height - BORDER,
  );
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let end = text.length;
  while (end > 1 && ctx.measureText(`${text.slice(0, end)}…`).width > maxWidth) end--;
  return `${text.slice(0, end)}…`;
}

function drawNameplate(ctx: CanvasRenderingContext2D, room: Room, zoom: number): void {
  const width = room.width * zoom;
  if (width < 64 || room.height * zoom < 40) return;

  const origin = worldToScreen(room.x, room.y);
  ctx.font = LABEL_FONT;
  const text = fitText(ctx, room.name, width - 36);
  const plateWidth = ctx.measureText(text).width + 16;

  ctx.fillStyle = COLORS.plate;
  ctx.beginPath();
  ctx.roundRect(origin.x + 10, origin.y + 9, plateWidth, 22, 11);
  ctx.fill();

  ctx.fillStyle = COLORS.plateText;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(text, origin.x + 18, origin.y + 20.5);
}

export function render(ctx: CanvasRenderingContext2D): void {
  const { rooms, world } = useStore.getState();
  const dpr = window.devicePixelRatio || 1;
  const zoom = camera.zoom;
  const view = visibleRect();
  const visible = Object.values(rooms).filter((room) => roomsOverlap(room, view));

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = COLORS.void;
  ctx.fillRect(0, 0, viewport.width, viewport.height);

  ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, -camera.x * zoom * dpr, -camera.y * zoom * dpr);
  drawGround(ctx, world, view, zoom);

  ctx.fillStyle = COLORS.shadow;
  for (const room of visible) ctx.fillRect(room.x + 6, room.y + 10, room.width, room.height);
  for (const room of visible) drawRoom(ctx, room, view, zoom);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const room of visible) drawNameplate(ctx, room, zoom);
}
