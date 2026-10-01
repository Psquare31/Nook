import type { PlacementReason } from './geometry';
import type { Player, Point, Room, World } from './types';

export type RejectReason = PlacementReason | 'invalid' | 'exists' | 'missing' | 'limit';

export type RoomAck =
  | { ok: true; room: Room }
  | { ok: false; reason: RejectReason; conflicts: string[]; room: Room | null };

export type JoinRequest = { name: string; x?: number; y?: number };

export type Snapshot = {
  selfId: string;
  world: World;
  rooms: Room[];
  players: Player[];
};

export type ChatMessage = {
  id: string;
  from: { id: string; name: string; color: string };
  roomId: string | null;
  text: string;
};

export interface ClientToServerEvents {
  join: (request: JoinRequest, ack: (snapshot: Snapshot) => void) => void;
  'room:create': (room: Room, ack: (result: RoomAck) => void) => void;
  'room:update': (room: Room, ack: (result: RoomAck) => void) => void;
  'room:delete': (id: string, ack: (result: { ok: boolean }) => void) => void;
  'player:move': (position: Point) => void;
  'player:rename': (name: string) => void;
  'chat:send': (text: string) => void;
}

export interface ServerToClientEvents {
  'room:created': (room: Room) => void;
  'room:updated': (room: Room) => void;
  'room:deleted': (id: string) => void;
  'player:joined': (player: Player) => void;
  'player:left': (id: string) => void;
  'player:moved': (move: { id: string; x: number; y: number }) => void;
  'player:room': (change: { id: string; roomId: string | null }) => void;
  'player:renamed': (change: { id: string; name: string }) => void;
  'chat:message': (message: ChatMessage) => void;
}
