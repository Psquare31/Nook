import { PLAYER_RADIUS, PLAYER_SPEED } from '../../shared/constants';
import { clamp, roomAt } from '../../shared/geometry';
import type { Point } from '../../shared/types';
import { isTyping } from '../lib/dom';
import { savePosition } from '../lib/session';
import { enterRoom } from '../state/actions';
import { useStore } from '../state/store';
import { self } from '../world/avatars';

const DIRECTIONS: Record<string, Point> = {
  KeyW: { x: 0, y: -1 },
  ArrowUp: { x: 0, y: -1 },
  KeyS: { x: 0, y: 1 },
  ArrowDown: { x: 0, y: 1 },
  KeyA: { x: -1, y: 0 },
  ArrowLeft: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

const held = new Set<string>();

export function attachMovement(): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (useStore.getState().mode !== 'play' || isTyping(event.target)) return;
    if (event.code in DIRECTIONS) {
      event.preventDefault();
      held.add(event.code);
    }
  };
  const onKeyUp = (event: KeyboardEvent) => held.delete(event.code);
  const release = () => held.clear();
  const persist = () => savePosition(self);

  const unsubscribe = useStore.subscribe((state, previous) => {
    if (state.mode !== previous.mode) held.clear();
  });
  const saver = setInterval(persist, 1000);

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', release);
  window.addEventListener('pagehide', persist);

  return () => {
    unsubscribe();
    clearInterval(saver);
    held.clear();
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', release);
    window.removeEventListener('pagehide', persist);
  };
}

export function stepMovement(dt: number): void {
  const { world, rooms } = useStore.getState();

  let dx = 0;
  let dy = 0;
  for (const code of held) {
    dx += DIRECTIONS[code].x;
    dy += DIRECTIONS[code].y;
  }

  if (dx !== 0 || dy !== 0) {
    const distance = (PLAYER_SPEED * dt) / Math.hypot(dx, dy);
    self.x = clamp(self.x + dx * distance, PLAYER_RADIUS, world.width - PLAYER_RADIUS);
    self.y = clamp(self.y + dy * distance, PLAYER_RADIUS, world.height - PLAYER_RADIUS);
  }

  enterRoom(roomAt(self, Object.values(rooms))?.id ?? null);
}
