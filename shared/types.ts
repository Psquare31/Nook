export type Room = {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Rect = Pick<Room, 'x' | 'y' | 'width' | 'height'>;

export type Point = { x: number; y: number };

export type World = { width: number; height: number };

export type Player = {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  roomId: string | null;
};
