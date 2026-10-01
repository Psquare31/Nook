import { createHash, randomBytes } from 'node:crypto';
import {
  MAX_ROOMS,
  PLAYER_COLORS,
  PLAYER_NAME_MAX,
  PLAYER_RADIUS,
  SPAWN,
  WORLD,
} from '../shared/constants';
import { clamp, roomAt, validateRoom } from '../shared/geometry';
import type { DeleteAck, RejectReason, RoomAck } from '../shared/protocol';
import type { Player, Point, Room, RoomOwner, RoomShape } from '../shared/types';

export type RoomChange = { player: Player; previous: string | null };

export type DeleteResult =
  | { ok: true; removed: boolean }
  | Extract<DeleteAck, { ok: false }>;

const SPAWN_SCATTER = 240;
const SPAWN_ATTEMPTS = 12;
const KEY_MIN = 16;
const KEY_MAX = 128;

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseShape(input: unknown): RoomShape | null {
  if (!isRecord(input)) return null;
  const { id, name, x, y, width, height } = input;
  if (typeof id !== 'string' || id.length === 0 || id.length > 64) return null;
  if (typeof name !== 'string') return null;
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return null;
  if (!isFiniteNumber(width) || !isFiniteNumber(height)) return null;

  return {
    id,
    name: name.trim(),
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}

function parseOwner(input: unknown): RoomOwner | null {
  if (!isRecord(input) || !isRecord(input.owner)) return null;
  const { id, name } = input.owner;
  return typeof id === 'string' && typeof name === 'string' ? { id, name } : null;
}

function parsePoint(input: unknown): Point | null {
  if (!isRecord(input) || !isFiniteNumber(input.x) || !isFiniteNumber(input.y)) return null;
  return {
    x: clamp(input.x, PLAYER_RADIUS, WORLD.width - PLAYER_RADIUS),
    y: clamp(input.y, PLAYER_RADIUS, WORLD.height - PLAYER_RADIUS),
  };
}

function cleanName(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  return input.trim().replace(/\s+/g, ' ').slice(0, PLAYER_NAME_MAX) || null;
}

// Everyone can see user ids on rooms and players, so they are a digest of the browser's
// secret key: knowing someone's id is not enough to act as them.
function publicUserId(key: unknown): string {
  if (typeof key !== 'string' || key.length < KEY_MIN || key.length > KEY_MAX) {
    return randomBytes(8).toString('hex');
  }
  return createHash('sha256').update(key).digest('hex').slice(0, 16);
}

function sameShape(a: RoomShape, b: RoomShape): boolean {
  return (
    a.name === b.name &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height
  );
}

function rejection(reason: RejectReason, room: Room | null = null): RoomAck {
  return { ok: false, reason, conflicts: [], room };
}

export class WorldState {
  readonly world = WORLD;
  private readonly rooms = new Map<string, Room>();
  private readonly players = new Map<string, Player>();
  private joined = 0;

  // Saved rooms go through the same validation as live edits, so a hand-edited save
  // file can never bring overlapping rooms into the world.
  constructor(saved: unknown[] = []) {
    for (const entry of saved) {
      const shape = parseShape(entry);
      if (shape) this.commit({ ...shape, owner: parseOwner(entry) }, null);
    }
  }

  listRooms(): Room[] {
    return [...this.rooms.values()];
  }

  listPlayers(): Player[] {
    return [...this.players.values()];
  }

  getPlayer(id: string): Player | undefined {
    return this.players.get(id);
  }

  createRoom(input: unknown, creator: RoomOwner): RoomAck {
    const shape = parseShape(input);
    if (!shape) return rejection('invalid');

    const existing = this.rooms.get(shape.id);
    if (existing) {
      const replayed = existing.owner?.id === creator.id && sameShape(existing, shape);
      return replayed ? { ok: true, room: existing } : rejection('exists', existing);
    }
    if (this.rooms.size >= MAX_ROOMS) return rejection('limit');
    return this.commit({ ...shape, owner: creator }, null);
  }

  updateRoom(input: unknown, userId: string): RoomAck {
    const shape = parseShape(input);
    if (!shape) return rejection('invalid');

    const existing = this.rooms.get(shape.id);
    if (!existing) return rejection('missing');
    if (existing.owner?.id !== userId) return rejection('forbidden', existing);
    return this.commit({ ...shape, owner: existing.owner }, existing);
  }

  deleteRoom(id: unknown, userId: string): DeleteResult {
    const existing = typeof id === 'string' ? this.rooms.get(id) : undefined;
    if (!existing) return { ok: true, removed: false };
    if (existing.owner?.id !== userId) return { ok: false, reason: 'forbidden', room: existing };

    this.rooms.delete(existing.id);
    return { ok: true, removed: true };
  }

  addPlayer(id: string, request: unknown): Player {
    const fields = isRecord(request) ? request : {};
    const position = parsePoint(fields) ?? this.spawnPoint();
    const player: Player = {
      id,
      userId: publicUserId(fields.key),
      name: cleanName(fields.name) ?? 'Guest',
      color: this.players.get(id)?.color ?? PLAYER_COLORS[this.joined++ % PLAYER_COLORS.length],
      x: Math.round(position.x),
      y: Math.round(position.y),
      roomId: null,
    };
    player.roomId = roomAt(player, this.rooms.values())?.id ?? null;
    this.players.set(id, player);
    return player;
  }

  removePlayer(id: string): boolean {
    return this.players.delete(id);
  }

  movePlayer(id: string, input: unknown): RoomChange | null {
    const player = this.players.get(id);
    const position = parsePoint(input);
    if (!player || !position) return null;

    const previous = player.roomId;
    player.x = position.x;
    player.y = position.y;
    player.roomId = roomAt(position, this.rooms.values())?.id ?? null;
    return { player, previous };
  }

  // Returns the rooms whose "created by" label changed along with the name.
  renamePlayer(id: string, input: unknown): { player: Player; rooms: Room[] } | null {
    const player = this.players.get(id);
    const name = cleanName(input);
    if (!player || !name) return null;
    player.name = name;

    const relabelled: Room[] = [];
    for (const room of this.rooms.values()) {
      if (room.owner?.id === player.userId && room.owner.name !== name) {
        const updated = { ...room, owner: { ...room.owner, name } };
        this.rooms.set(room.id, updated);
        relabelled.push(updated);
      }
    }
    return { player, rooms: relabelled };
  }

  // Rooms can be created, moved or deleted underneath a standing player.
  refreshOccupancy(): RoomChange[] {
    const changes: RoomChange[] = [];
    for (const player of this.players.values()) {
      const previous = player.roomId;
      player.roomId = roomAt(player, this.rooms.values())?.id ?? null;
      if (player.roomId !== previous) changes.push({ player, previous });
    }
    return changes;
  }

  // Tries a few spots around the spawn and keeps the one furthest from everyone else,
  // so people who arrive together do not land on top of each other.
  private spawnPoint(): Point {
    let best = SPAWN;
    let bestGap = -1;
    for (let attempt = 0; attempt < SPAWN_ATTEMPTS; attempt++) {
      const candidate = {
        x: SPAWN.x + (Math.random() - 0.5) * SPAWN_SCATTER,
        y: SPAWN.y + (Math.random() - 0.5) * SPAWN_SCATTER,
      };
      let gap = Infinity;
      for (const player of this.players.values()) {
        gap = Math.min(gap, Math.hypot(player.x - candidate.x, player.y - candidate.y));
      }
      if (gap > bestGap) {
        best = candidate;
        bestGap = gap;
      }
    }
    return best;
  }

  private commit(room: Room, fallback: Room | null): RoomAck {
    const result = validateRoom(room, this.rooms.values(), this.world);
    if (!result.ok) {
      return { ok: false, reason: result.reason, conflicts: result.conflicts, room: fallback };
    }
    this.rooms.set(room.id, room);
    return { ok: true, room };
  }
}
