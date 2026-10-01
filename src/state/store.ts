import { create } from 'zustand';
import { WORLD } from '../../shared/constants';
import type { PlacementReason } from '../../shared/geometry';
import type { Snapshot } from '../../shared/protocol';
import type { Player, Room, World } from '../../shared/types';
import { newId } from '../lib/id';
import { loadName } from '../lib/session';

export type Mode = 'play' | 'edit';

export type Connection = 'connecting' | 'online' | 'offline';

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
  connection: Connection;
  world: World;
  rooms: Record<string, Room>;
  selfId: string | null;
  name: string;
  players: Record<string, PlayerInfo>;
  chat: ChatLine[];
  selectedId: string | null;
  placing: Placing | null;
  draft: Draft | null;
  toasts: Toast[];
  setMode: (mode: Mode) => void;
  setConnection: (connection: Connection) => void;
  applySnapshot: (snapshot: Snapshot) => void;
  setName: (name: string) => void;
  select: (id: string | null) => void;
  startPlacing: (placing: Placing) => void;
  stopPlacing: (selectId?: string) => void;
  setDraft: (draft: Draft | null) => void;
  upsertRoom: (room: Room) => void;
  removeRoom: (id: string) => void;
  upsertPlayer: (player: PlayerInfo) => void;
  patchPlayer: (id: string, patch: Partial<PlayerInfo>) => void;
  removePlayer: (id: string) => void;
  pushChat: (line: ChatLine) => void;
  notice: (text: string) => void;
  toast: (text: string) => void;
  dismissToast: (id: number) => void;
};

const TOAST_MS = 3200;
const CHAT_HISTORY = 200;
let toastId = 0;

function toInfo({ id, name, color, roomId }: Player): PlayerInfo {
  return { id, name, color, roomId };
}

export const useStore = create<State>((set, get) => ({
  mode: 'play',
  connection: 'connecting',
  world: WORLD,
  rooms: {},
  selfId: null,
  name: loadName(),
  players: {},
  chat: [],
  selectedId: null,
  placing: null,
  draft: null,
  toasts: [],

  setMode: (mode) => set({ mode, placing: null, draft: null, selectedId: null }),

  setConnection: (connection) => set({ connection }),

  applySnapshot: (snapshot) =>
    set((state) => {
      const rooms = Object.fromEntries(snapshot.rooms.map((room) => [room.id, room]));
      return {
        connection: 'online',
        world: snapshot.world,
        rooms,
        selfId: snapshot.selfId,
        players: Object.fromEntries(snapshot.players.map((player) => [player.id, toInfo(player)])),
        selectedId: state.selectedId && rooms[state.selectedId] ? state.selectedId : null,
      };
    }),

  setName: (name) => set({ name }),

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

  patchPlayer: (id, patch) =>
    set((state) => {
      const player = state.players[id];
      return player ? { players: { ...state.players, [id]: { ...player, ...patch } } } : state;
    }),

  removePlayer: (id) =>
    set((state) => {
      const { [id]: _removed, ...players } = state.players;
      return { players };
    }),

  pushChat: (line) => set((state) => ({ chat: [...state.chat.slice(-(CHAT_HISTORY - 1)), line] })),

  notice: (text) => get().pushChat({ kind: 'system', id: newId(), text }),

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
  return state.selfId ? state.players[state.selfId] : undefined;
}
