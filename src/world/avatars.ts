import { SPAWN } from '../../shared/constants';
import type { Point } from '../../shared/types';
import { loadPosition } from '../lib/session';

const BUBBLE_MS = 4500;

// Positions change every frame, so they live outside the store and are read by the renderer.
export const self: Point = loadPosition() ?? { ...SPAWN };
export const bubbles = new Map<string, { text: string; until: number }>();

export function say(id: string, text: string): void {
  bubbles.set(id, { text, until: performance.now() + BUBBLE_MS });
}
