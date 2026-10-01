import { create } from 'zustand';
import { STARTER_ROOMS, WORLD } from '../../shared/constants';
import type { Room, World } from '../../shared/types';

type State = {
  world: World;
  rooms: Record<string, Room>;
};

export const useStore = create<State>(() => ({
  world: WORLD,
  rooms: Object.fromEntries(STARTER_ROOMS.map((room) => [room.id, room])),
}));
