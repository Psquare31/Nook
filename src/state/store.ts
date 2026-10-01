import { create } from 'zustand';
import { STARTER_ROOMS, WORLD } from '../../shared/constants';
import type { PlacementReason } from '../../shared/geometry';
import type { Room, World } from '../../shared/types';

export type Draft = {
  kind: 'place' | 'move' | 'resize';
  room: Room;
  valid: boolean;
  reason: PlacementReason | null;
  conflicts: string[];
};

export type Placing = { id: string; name: string; width: number; height: number };

export type Toast = { id: number; text: string };

type State = {
  world: World;
  rooms: Record<string, Room>;
  selectedId: string | null;
  placing: Placing | null;
  draft: Draft | null;
  toasts: Toast[];
  select: (id: string | null) => void;
  startPlacing: (placing: Placing) => void;
  stopPlacing: (selectId?: string) => void;
  setDraft: (draft: Draft | null) => void;
  upsertRoom: (room: Room) => void;
  removeRoom: (id: string) => void;
  toast: (text: string) => void;
  dismissToast: (id: number) => void;
};

const TOAST_MS = 3200;
let toastId = 0;

export const useStore = create<State>((set, get) => ({
  world: WORLD,
  rooms: Object.fromEntries(STARTER_ROOMS.map((room) => [room.id, room])),
  selectedId: null,
  placing: null,
  draft: null,
  toasts: [],

  select: (id) => set({ selectedId: id }),

  startPlacing: (placing) => set({ placing, draft: null, selectedId: null }),

  stopPlacing: (selectId) =>
    set((state) => ({ placing: null, draft: null, selectedId: selectId ?? state.selectedId })),

  setDraft: (draft) => set({ draft }),

  upsertRoom: (room) => set((state) => ({ rooms: { ...state.rooms, [room.id]: room } })),

  removeRoom: (id) =>
    set((state) => {
      const { [id]: _removed, ...rooms } = state.rooms;
      return { rooms, selectedId: state.selectedId === id ? null : state.selectedId };
    }),

  toast: (text) => {
    const last = get().toasts.at(-1);
    if (last?.text === text) return;
    const id = ++toastId;
    set((state) => ({ toasts: [...state.toasts.slice(-2), { id, text }] }));
    setTimeout(() => get().dismissToast(id), TOAST_MS);
  },

  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));
