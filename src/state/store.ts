import { create } from 'zustand';
import { PLAYER_COLORS, STARTER_ROOMS, WORLD } from '../../shared/constants';
import type { PlacementReason } from '../../shared/geometry';
import type { Player, Room, World } from '../../shared/types';
import { loadName } from '../lib/session';

export type Mode = 'play' | 'edit';

export type Draft = {
  kind: 'place' | 'move' | 'resize';
  room: Room;
  valid: boolean;
  reason: PlacementReason | null;
  conflicts: string[];
};

export type Placing = { id: string; name: string; width: number; height: number };

export type PlayerInfo = Omit<Player, 'x' | 'y'>;

export type ChatLine =
  | { kind: 'message'; id: string; from: { id: string; name: string; color: string }; text: string }
  | { kind: 'system'; id: string; text: string };

export type Toast = { id: number; text: string };

type State = {
  mode: Mode;
  world: World;
  rooms: Record<string, Room>;
  selfId: string;
  players: Record<string, PlayerInfo>;
  chat: ChatLine[];
  selectedId: string | null;
  placing: Placing | null;
  draft: Draft | null;
  toasts: Toast[];
  setMode: (mode: Mode) => void;
  select: (id: string | null) => void;
  startPlacing: (placing: Placing) => void;
  stopPlacing: (selectId?: string) => void;
  setDraft: (draft: Draft | null) => void;
  upsertRoom: (room: Room) => void;
  removeRoom: (id: string) => void;
  upsertPlayer: (player: PlayerInfo) => void;
  pushChat: (line: ChatLine) => void;
  toast: (text: string) => void;
  dismissToast: (id: number) => void;
};

const TOAST_MS = 3200;
const CHAT_HISTORY = 200;
const LOCAL_ID = 'local';
let toastId = 0;

export const useStore = create<State>((set, get) => ({
  mode: 'play',
  world: WORLD,
  rooms: Object.fromEntries(STARTER_ROOMS.map((room) => [room.id, room])),
  selfId: LOCAL_ID,
  players: {
    [LOCAL_ID]: { id: LOCAL_ID, name: loadName(), color: PLAYER_COLORS[0], roomId: null },
  },
  chat: [],
  selectedId: null,
  placing: null,
  draft: null,
  toasts: [],

  setMode: (mode) => set({ mode, placing: null, draft: null, selectedId: null }),

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

  upsertPlayer: (player) =>
    set((state) => ({ players: { ...state.players, [player.id]: player } })),

  pushChat: (line) => set((state) => ({ chat: [...state.chat.slice(-(CHAT_HISTORY - 1)), line] })),

  toast: (text) => {
    const last = get().toasts.at(-1);
    if (last?.text === text) return;
    const id = ++toastId;
    set((state) => ({ toasts: [...state.toasts.slice(-2), { id, text }] }));
    setTimeout(() => get().dismissToast(id), TOAST_MS);
  },

  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));

export function selfPlayer(state: State): PlayerInfo | undefined {
  return state.players[state.selfId];
}
