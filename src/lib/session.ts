import type { Point } from '../../shared/types';

const NAME_KEY = 'nook:name';
const POSITION_KEY = 'nook:position';

// sessionStorage is per tab, so every tab keeps its own identity across reloads.
function read(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable in private modes; the session then just starts fresh.
  }
}

export function loadName(): string {
  const stored = read(NAME_KEY);
  if (stored) return stored;
  const name = `Guest ${100 + Math.floor(Math.random() * 900)}`;
  write(NAME_KEY, name);
  return name;
}

export function saveName(name: string): void {
  write(NAME_KEY, name);
}

export function loadPosition(): Point | null {
  try {
    const parsed: unknown = JSON.parse(read(POSITION_KEY) ?? 'null');
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { x, y } = parsed as Partial<Point>;
    return Number.isFinite(x) && Number.isFinite(y) ? { x: x!, y: y! } : null;
  } catch {
    return null;
  }
}

export function savePosition(point: Point): void {
  write(POSITION_KEY, JSON.stringify({ x: Math.round(point.x), y: Math.round(point.y) }));
}
