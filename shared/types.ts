export type RoomOwner = { id: string; name: string };

export type Room = {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  // null marks a built-in room that nobody may edit.
  owner: RoomOwner | null;
};

// What a client may propose. The owner is always decided by the server.
export type RoomShape = Omit<Room, 'owner'>;

export type Rect = Pick<Room, 'x' | 'y' | 'width' | 'height'>;

export type Point = { x: number; y: number };

export type World = { width: number; height: number };

export type Player = {
  id: string;
  userId: string;
  // The number this connection uses in the voice service, so clients can tell who is talking.
  voiceUid: number;
  name: string;
  color: string;
  x: number;
  y: number;
  roomId: string | null;
};
