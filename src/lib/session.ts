import type { Point } from '../../shared/types';

const NAME_KEY = 'nook:name';
const POSITION_KEY = 'nook:position';
const USER_KEY = 'nook:key';

type Store = 'sessionStorage' | 'localStorage';

function read(store: Store, key: string): string | null {
  try {
    return window[store].getItem(key);
  } catch {
    return null;
  }
}

function write(store: Store, key: string, value: string): void {
  try {
    window[store].setItem(key, value);
  } catch {
    // Storage can be unavailable in private modes; the session then just starts fresh.
  }
}

// Name and position are per tab, so every tab is its own avatar and keeps it across reloads.
export function loadName(): string {
  const stored = read('sessionStorage', NAME_KEY);
  if (stored) return stored;
  const name = `Guest ${100 + Math.floor(Math.random() * 900)}`;
  write('sessionStorage', NAME_KEY, name);
  return name;
}

export function saveName(name: string): void {
  write('sessionStorage', NAME_KEY, name);
}

export function loadPosition(): Point | null {
  try {
    const parsed: unknown = JSON.parse(read('sessionStorage', POSITION_KEY) ?? 'null');
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { x, y } = parsed as Partial<Point>;
    return Number.isFinite(x) && Number.isFinite(y) ? { x: x!, y: y! } : null;
  } catch {
    return null;
  }
}

export function savePosition(point: Point): void {
  write('sessionStorage', POSITION_KEY, JSON.stringify({ x: Math.round(point.x), y: Math.round(point.y) }));
}

// The secret that proves which rooms this browser created. It lives in localStorage so it
// outlasts the tab, which means every tab of one browser profile is the same room owner.
export function loadUserKey(): string {
  const stored = read('localStorage', USER_KEY);
  if (stored) return stored;

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const key = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  write('localStorage', USER_KEY, key);
  return key;
}
