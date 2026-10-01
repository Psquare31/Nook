import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Room } from '../shared/types';

// Returns null when nothing has been saved yet, so the caller can seed a first world.
export function loadRooms(file: string): unknown[] | null {
  if (!existsSync(file)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    const rooms = (parsed as { rooms?: unknown }).rooms;
    if (!Array.isArray(rooms)) throw new Error('missing "rooms" array');
    return rooms;
  } catch (error) {
    const backup = `${file}.corrupt`;
    renameSync(file, backup);
    console.error(`Could not read ${file} (${String(error)}). Moved it to ${backup}.`);
    return null;
  }
}

export function createSaver(file: string, read: () => Room[], delay = 250) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;

    // Write to a sibling file first so a crash mid-write cannot truncate the saved world.
    const temporary = `${file}.tmp`;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(temporary, JSON.stringify({ rooms: read() }, null, 2));
    renameSync(temporary, file);
  };

  const schedule = () => {
    timer ??= setTimeout(flush, delay);
  };

  return { schedule, flush };
}
