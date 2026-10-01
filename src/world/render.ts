import { roomsOverlap } from '../../shared/geometry';
import type { Rect, Room, World } from '../../shared/types';
import { HANDLES, handlePoint } from '../editor/handles';
import { useStore, type Draft } from '../state/store';
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
  accent: '#8f81ff',
  valid: '#3ecf8e',
  validFill: 'rgba(62, 207, 142, 0.22)',
  invalid: '#f2617a',
  invalidFill: 'rgba(242, 97, 122, 0.34)',
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
const FONT = 'ui-sans-serif, system-ui, "Segoe UI", sans-serif';

function hash(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
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

function drawShadow(ctx: CanvasRenderingContext2D, room: Room): void {
  ctx.fillStyle = COLORS.shadow;
  ctx.fillRect(room.x + 6, room.y + 10, room.width, room.height);
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

function strokeOutline(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  color: string,
  zoom: number,
  dash: number[] = [],
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2 / zoom;
  ctx.setLineDash(dash.map((length) => length / zoom));
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
}

function drawDraft(
  ctx: CanvasRenderingContext2D,
  draft: Draft,
  rooms: Record<string, Room>,
  view: Rect,
  zoom: number,
): void {
  for (const id of draft.conflicts) {
    const room = rooms[id];
    if (!room) continue;
    ctx.fillStyle = COLORS.invalidFill;
    ctx.fillRect(room.x, room.y, room.width, room.height);
    strokeOutline(ctx, room, COLORS.invalid, zoom);
  }

  ctx.globalAlpha = draft.kind === 'place' ? 0.85 : 1;
  drawShadow(ctx, draft.room);
  drawRoom(ctx, draft.room, view, zoom);
  ctx.globalAlpha = 1;

  ctx.fillStyle = draft.valid ? COLORS.validFill : COLORS.invalidFill;
  ctx.fillRect(draft.room.x, draft.room.y, draft.room.width, draft.room.height);
  strokeOutline(ctx, draft.room, draft.valid ? COLORS.valid : COLORS.invalid, zoom, [8, 6]);
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
  ctx.font = `600 12px ${FONT}`;
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

function drawHandles(ctx: CanvasRenderingContext2D, rect: Rect): void {
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = COLORS.accent;
  ctx.lineWidth = 2;
  for (const handle of HANDLES) {
    const at = handlePoint(rect, handle);
    const point = worldToScreen(at.x, at.y);
    ctx.beginPath();
    ctx.rect(point.x - 4.5, point.y - 4.5, 9, 9);
    ctx.fill();
    ctx.stroke();
  }
}

function drawDimensions(ctx: CanvasRenderingContext2D, draft: Draft): void {
  const { room } = draft;
  const center = worldToScreen(room.x + room.width / 2, room.y + room.height / 2);
  const text = `${room.width} × ${room.height}`;

  ctx.font = `600 13px ${FONT}`;
  const width = ctx.measureText(text).width + 22;
  ctx.fillStyle = draft.valid ? '#1f7a55' : '#b23a51';
  ctx.beginPath();
  ctx.roundRect(center.x - width / 2, center.y - 13, width, 26, 13);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, center.x, center.y + 0.5);
}

export function render(ctx: CanvasRenderingContext2D): void {
  const { rooms, world, draft, selectedId } = useStore.getState();
  const dpr = window.devicePixelRatio || 1;
  const zoom = camera.zoom;
  const view = visibleRect();

  const draggedId = draft && draft.kind !== 'place' ? draft.room.id : null;
  const visible = Object.values(rooms).filter(
    (room) => room.id !== draggedId && roomsOverlap(room, view),
  );
  const selected = selectedId
    ? draft?.room.id === selectedId
      ? draft.room
      : rooms[selectedId]
    : undefined;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = COLORS.void;
  ctx.fillRect(0, 0, viewport.width, viewport.height);

  ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, -camera.x * zoom * dpr, -camera.y * zoom * dpr);
  drawGround(ctx, world, view, zoom);
  for (const room of visible) drawShadow(ctx, room);
  for (const room of visible) drawRoom(ctx, room, view, zoom);
  if (draft) drawDraft(ctx, draft, rooms, view, zoom);
  if (selected && selected !== draft?.room) strokeOutline(ctx, selected, COLORS.accent, zoom);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const room of visible) drawNameplate(ctx, room, zoom);
  if (draft) drawNameplate(ctx, draft.room, zoom);
  if (selected) drawHandles(ctx, selected);
  if (draft) drawDimensions(ctx, draft);
}
