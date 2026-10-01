import { SPAWN } from '../../shared/constants';
import type { Point } from '../../shared/types';
import { loadPosition } from '../lib/session';

type Remote = { x: number; y: number; targetX: number; targetY: number };

const BUBBLE_MS = 4500;

const saved = loadPosition();

// Positions change every frame, so they live outside the store and are read by the renderer.
export const self: Point = saved ?? { ...SPAWN };
export const hasSavedPosition = saved !== null;
export const remotes = new Map<string, Remote>();
export const bubbles = new Map<string, { text: string; until: number }>();

export function placeRemote(id: string, x: number, y: number): void {
  remotes.set(id, { x, y, targetX: x, targetY: y });
}

export function moveRemote(id: string, x: number, y: number): void {
  const remote = remotes.get(id);
  if (remote) {
    remote.targetX = x;
    remote.targetY = y;
  } else {
    placeRemote(id, x, y);
  }
}

export function dropRemote(id: string): void {
  remotes.delete(id);
  bubbles.delete(id);
}

// Updates arrive about 20 times a second; easing towards the latest one hides the steps.
export function stepRemotes(dt: number): void {
  const blend = 1 - Math.exp(-dt * 14);
  for (const remote of remotes.values()) {
    remote.x += (remote.targetX - remote.x) * blend;
    remote.y += (remote.targetY - remote.y) * blend;
  }
}

export function say(id: string, text: string): void {
  bubbles.set(id, { text, until: performance.now() + BUBBLE_MS });
}
