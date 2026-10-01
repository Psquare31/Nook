import type { Point, Room, World } from './types';

export const WORLD: World = { width: 4000, height: 3000 };
export const GRID = 10;

export const ROOM_MIN = 100;
export const ROOM_MAX = 1600;
export const MAX_ROOMS = 200;
export const ROOM_NAME_MAX = 32;

export const PLAYER_RADIUS = 16;
export const PLAYER_SPEED = 260;
export const PLAYER_NAME_MAX = 20;
export const CHAT_MAX = 300;

export const SPAWN: Point = { x: 2000, y: 1500 };

export const STARTER_ROOMS: Room[] = [
  { id: 'lounge', name: 'Lounge', x: 1700, y: 1300, width: 600, height: 400 },
  { id: 'workshop', name: 'Workshop', x: 1200, y: 1300, width: 400, height: 250 },
  { id: 'library', name: 'Library', x: 2400, y: 1300, width: 450, height: 300 },
];
