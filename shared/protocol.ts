import type { PlacementReason } from './geometry';
import type { Player, Point, Room, RoomShape, World } from './types';

export type RejectReason =
  | PlacementReason
  | 'invalid'
  | 'exists'
  | 'missing'
  | 'limit'
  | 'forbidden';

// A rejection carries the room as the server has it, so the client can put it back.
export type RoomAck =
  | { ok: true; room: Room }
  | { ok: false; reason: RejectReason; conflicts: string[]; room: Room | null };

export type DeleteAck = { ok: true } | { ok: false; reason: RejectReason; room: Room | null };

// `key` is a secret kept by the browser. The server turns it into the public user id
// that room ownership is checked against.
export type JoinRequest = { name: string; key?: string; x?: number; y?: number };

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
  'room:create': (room: RoomShape, ack: (result: RoomAck) => void) => void;
  'room:update': (room: RoomShape, ack: (result: RoomAck) => void) => void;
  'room:delete': (id: string, ack: (result: DeleteAck) => void) => void;
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
