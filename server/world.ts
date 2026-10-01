import {
  MAX_ROOMS,
  PLAYER_COLORS,
  PLAYER_NAME_MAX,
  PLAYER_RADIUS,
  SPAWN,
  WORLD,
} from '../shared/constants';
import { clamp, roomAt, validateRoom } from '../shared/geometry';
import type { RejectReason, RoomAck } from '../shared/protocol';
import type { Player, Point, Room } from '../shared/types';

export type RoomChange = { player: Player; previous: string | null };

const SPAWN_SCATTER = 240;
const SPAWN_ATTEMPTS = 12;

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseRoom(input: unknown): Room | null {
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

function sameRoom(a: Room, b: Room): boolean {
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

  // Rooms go through the same validation as live edits, so a hand-edited save file
  // can never bring overlapping rooms into the world.
  constructor(rooms: unknown[] = []) {
    for (const room of rooms) this.createRoom(room);
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

  createRoom(input: unknown): RoomAck {
    const room = parseRoom(input);
    if (!room) return rejection('invalid');

    const existing = this.rooms.get(room.id);
    if (existing) {
      return sameRoom(existing, room) ? { ok: true, room: existing } : rejection('exists', existing);
    }
    if (this.rooms.size >= MAX_ROOMS) return rejection('limit');
    return this.commit(room, null);
  }

  updateRoom(input: unknown): RoomAck {
    const room = parseRoom(input);
    if (!room) return rejection('invalid');

    const existing = this.rooms.get(room.id);
    if (!existing) return rejection('missing');
    return this.commit(room, existing);
  }

  deleteRoom(id: unknown): boolean {
    return typeof id === 'string' && this.rooms.delete(id);
  }

  addPlayer(id: string, request: unknown): Player {
    const fields = isRecord(request) ? request : {};
    const position = parsePoint(fields) ?? this.spawnPoint();
    const player: Player = {
      id,
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

  renamePlayer(id: string, input: unknown): Player | null {
    const player = this.players.get(id);
    const name = cleanName(input);
    if (!player || !name) return null;
    player.name = name;
    return player;
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
