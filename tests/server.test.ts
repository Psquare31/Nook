import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNook } from '../server/app';
import { STARTER_ROOMS, WORLD } from '../shared/constants';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  Snapshot,
} from '../shared/protocol';
import type { Point, Room } from '../shared/types';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

const INSIDE_LOUNGE: Point = { x: 2000, y: 1500 };
const INSIDE_WORKSHOP: Point = { x: 1400, y: 1400 };
const OUTSIDE: Point = { x: 300, y: 300 };
const FREE_ROOM: Room = { id: 'studio', name: 'Studio', x: 200, y: 200, width: 400, height: 250 };

let nook: ReturnType<typeof createNook>;
let url: string;
let clients: Client[];

async function start(options: Parameters<typeof createNook>[0] = {}) {
  nook = createNook(options);
  await new Promise<void>((resolve) => nook.httpServer.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(nook.httpServer.address() as AddressInfo).port}`;
}

async function stop() {
  for (const client of clients) client.disconnect();
  await nook.io.close();
}

async function connect(name: string, position: Point = INSIDE_LOUNGE) {
  const socket: Client = io(url, { transports: ['websocket'], forceNew: true });
  clients.push(socket);
  await new Promise<void>((resolve) => socket.once('connect', resolve));
  const snapshot: Snapshot = await socket.emitWithAck('join', { name, ...position });
  return { socket, snapshot };
}

function next<E extends keyof ServerToClientEvents>(socket: Client, event: E) {
  return new Promise<Parameters<ServerToClientEvents[E]>[0]>((resolve) => {
    socket.once(event, resolve as never);
  });
}

function collect<E extends keyof ServerToClientEvents>(socket: Client, event: E) {
  const received: Parameters<ServerToClientEvents[E]>[0][] = [];
  socket.on(event, ((payload: Parameters<ServerToClientEvents[E]>[0]) => {
    received.push(payload);
  }) as never);
  return received;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 80));

beforeEach(async () => {
  clients = [];
  await start();
});

afterEach(stop);

describe('joining', () => {
  it('returns the world, its rooms and the player itself', async () => {
    const { socket, snapshot } = await connect('Asha');

    expect(snapshot.world).toEqual(WORLD);
    expect(snapshot.rooms).toEqual(STARTER_ROOMS);
    expect(snapshot.selfId).toBe(socket.id);
    expect(snapshot.players).toEqual([
      expect.objectContaining({ id: socket.id, name: 'Asha', roomId: 'lounge', ...INSIDE_LOUNGE }),
    ]);
  });

  it('shows existing players to a newcomer and announces the newcomer', async () => {
    const asha = await connect('Asha');
    const joined = next(asha.socket, 'player:joined');
    const ben = await connect('Ben', OUTSIDE);

    expect(ben.snapshot.players.map((player) => player.name).sort()).toEqual(['Asha', 'Ben']);
    expect(await joined).toMatchObject({ id: ben.socket.id, name: 'Ben', roomId: null });
  });

  it('gives each connection its own colour and falls back to a guest name', async () => {
    const first = await connect('   ');
    const second = await connect('Ben');
    const [a, b] = second.snapshot.players;

    expect(first.snapshot.players[0].name).toBe('Guest');
    expect(a.color).not.toBe(b.color);
  });

  it('tells everyone when a player disconnects', async () => {
    const asha = await connect('Asha');
    const ben = await connect('Ben');
    const left = next(asha.socket, 'player:left');
    const benId = ben.socket.id;

    ben.socket.disconnect();

    expect(await left).toBe(benId);
    expect(nook.state.listPlayers()).toHaveLength(1);
  });
});

describe('movement', () => {
  it('relays positions to the other players', async () => {
    const asha = await connect('Asha');
    const ben = await connect('Ben');
    const moved = next(ben.socket, 'player:moved');

    asha.socket.emit('player:move', { x: 2050, y: 1520 });

    expect(await moved).toEqual({ id: asha.socket.id, x: 2050, y: 1520 });
  });

  it('keeps players inside the world', async () => {
    const asha = await connect('Asha');
    const ben = await connect('Ben');
    const moved = next(ben.socket, 'player:moved');

    asha.socket.emit('player:move', { x: -500, y: 99999 });

    const position = await moved;
    expect(position.x).toBeGreaterThan(0);
    expect(position.y).toBeLessThan(WORLD.height);
  });

  it('announces leaving and entering rooms', async () => {
    const asha = await connect('Asha');
    const ben = await connect('Ben');
    const changes = collect(ben.socket, 'player:room');

    asha.socket.emit('player:move', OUTSIDE);
    asha.socket.emit('player:move', INSIDE_WORKSHOP);
    await settle();

    expect(changes).toEqual([
      { id: asha.socket.id, roomId: null },
      { id: asha.socket.id, roomId: 'workshop' },
    ]);
  });

  it('says nothing while a player stays in the same room', async () => {
    const asha = await connect('Asha');
    const ben = await connect('Ben');
    const changes = collect(ben.socket, 'player:room');

    asha.socket.emit('player:move', { x: 2100, y: 1600 });
    await settle();

    expect(changes).toEqual([]);
  });
});

describe('chat', () => {
  it('reaches everyone in the same room, including the sender', async () => {
    const asha = await connect('Asha');
    const ben = await connect('Ben');
    const toAsha = next(asha.socket, 'chat:message');
    const toBen = next(ben.socket, 'chat:message');

    asha.socket.emit('chat:send', '  hello lounge  ');

    const expected = { text: 'hello lounge', roomId: 'lounge', from: { name: 'Asha' } };
    expect(await toAsha).toMatchObject(expected);
    expect(await toBen).toMatchObject(expected);
  });

  it('does not leak into other rooms or outside', async () => {
    const asha = await connect('Asha');
    const inWorkshop = await connect('Ben', INSIDE_WORKSHOP);
    const outside = await connect('Cy', OUTSIDE);
    const workshopChat = collect(inWorkshop.socket, 'chat:message');
    const outsideChat = collect(outside.socket, 'chat:message');
    const echoed = next(asha.socket, 'chat:message');

    asha.socket.emit('chat:send', 'lounge only');
    await echoed;
    await settle();

    expect(workshopChat).toEqual([]);
    expect(outsideChat).toEqual([]);
  });

  it('follows a player who walks into another room', async () => {
    const asha = await connect('Asha');
    const ben = await connect('Ben', INSIDE_WORKSHOP);
    const entered = next(ben.socket, 'player:room');

    asha.socket.emit('player:move', INSIDE_WORKSHOP);
    await entered;
    const toBen = next(ben.socket, 'chat:message');
    asha.socket.emit('chat:send', 'made it');

    expect(await toBen).toMatchObject({ text: 'made it', roomId: 'workshop' });
  });

  it('shares one channel between everyone outside', async () => {
    const asha = await connect('Asha', OUTSIDE);
    const ben = await connect('Ben', { x: 3500, y: 2500 });
    const toBen = next(ben.socket, 'chat:message');

    asha.socket.emit('chat:send', 'anyone out here?');

    expect(await toBen).toMatchObject({ text: 'anyone out here?', roomId: null });
  });

  it('ignores empty messages', async () => {
    const asha = await connect('Asha');
    const received = collect(asha.socket, 'chat:message');

    asha.socket.emit('chat:send', '    ');
    await settle();

    expect(received).toEqual([]);
  });
});

describe('room editing', () => {
  it('creates a room and tells the other players', async () => {
    const asha = await connect('Asha');
    const ben = await connect('Ben');
    const created = next(ben.socket, 'room:created');

    const result = await asha.socket.emitWithAck('room:create', FREE_ROOM);

    expect(result).toEqual({ ok: true, room: FREE_ROOM });
    expect(await created).toEqual(FREE_ROOM);
    expect(nook.state.listRooms()).toHaveLength(STARTER_ROOMS.length + 1);
  });

  it('rejects a room that overlaps an existing one', async () => {
    const asha = await connect('Asha');
    const ben = await connect('Ben');
    const created = collect(ben.socket, 'room:created');

    const result = await asha.socket.emitWithAck('room:create', {
      ...FREE_ROOM,
      x: 1900,
      y: 1400,
    });
    await settle();

    expect(result).toEqual({ ok: false, reason: 'overlap', conflicts: ['lounge'], room: null });
    expect(created).toEqual([]);
    expect(nook.state.listRooms()).toEqual(STARTER_ROOMS);
  });

  it('rejects a room outside the world', async () => {
    const { socket } = await connect('Asha');

    const result = await socket.emitWithAck('room:create', { ...FREE_ROOM, x: WORLD.width - 100 });

    expect(result).toMatchObject({ ok: false, reason: 'bounds' });
  });

  it('moves a room and tells the other players', async () => {
    const asha = await connect('Asha');
    const ben = await connect('Ben');
    const updated = next(ben.socket, 'room:updated');
    const moved = { ...STARTER_ROOMS[1], x: 600, y: 600 };

    const result = await asha.socket.emitWithAck('room:update', moved);

    expect(result).toEqual({ ok: true, room: moved });
    expect(await updated).toEqual(moved);
  });

  it('rejects a move into a neighbour and returns the room as it stands', async () => {
    const { socket } = await connect('Asha');
    const workshop = STARTER_ROOMS[1];

    const result = await socket.emitWithAck('room:update', { ...workshop, x: 1500 });

    expect(result).toEqual({ ok: false, reason: 'overlap', conflicts: ['lounge'], room: workshop });
    expect(nook.state.listRooms()).toEqual(STARTER_ROOMS);
  });

  it('rejects a resize into a neighbour', async () => {
    const { socket } = await connect('Asha');
    const workshop = STARTER_ROOMS[1];

    const result = await socket.emitWithAck('room:update', { ...workshop, width: 600 });

    expect(result).toMatchObject({ ok: false, reason: 'overlap', conflicts: ['lounge'] });
  });

  it('allows two rooms to share a wall', async () => {
    const { socket } = await connect('Asha');
    const workshop = STARTER_ROOMS[1];

    const result = await socket.emitWithAck('room:update', { ...workshop, width: 500 });

    expect(result).toMatchObject({ ok: true });
  });

  it('rejects an update for a room that no longer exists', async () => {
    const { socket } = await connect('Asha');

    const result = await socket.emitWithAck('room:update', FREE_ROOM);

    expect(result).toEqual({ ok: false, reason: 'missing', conflicts: [], room: null });
  });

  it('rejects malformed input without crashing', async () => {
    const { socket } = await connect('Asha');

    const garbage = await socket.emitWithAck('room:create', { id: 'x', name: 5 } as never);
    const notANumber = await socket.emitWithAck('room:create', {
      ...FREE_ROOM,
      width: 'wide',
    } as never);

    expect(garbage).toMatchObject({ ok: false, reason: 'invalid' });
    expect(notANumber).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await socket.emitWithAck('room:create', FREE_ROOM)).toMatchObject({ ok: true });
  });

  it('deletes a room, tells the other players and moves its occupants outside', async () => {
    const asha = await connect('Asha');
    const ben = await connect('Ben');
    const deleted = next(ben.socket, 'room:deleted');
    const changes = collect(ben.socket, 'player:room');

    const result = await asha.socket.emitWithAck('room:delete', 'lounge');
    await settle();

    expect(result).toEqual({ ok: true });
    expect(await deleted).toBe('lounge');
    expect(changes).toHaveLength(2);
    expect(changes.every((change) => change.roomId === null)).toBe(true);
  });

  it('puts a standing player into a room created around them', async () => {
    const asha = await connect('Asha', OUTSIDE);
    const ben = await connect('Ben');
    const entered = next(ben.socket, 'player:room');

    await asha.socket.emitWithAck('room:create', FREE_ROOM);

    expect(await entered).toEqual({ id: asha.socket.id, roomId: 'studio' });
  });

  it('ignores edits from a connection that has not joined', async () => {
    const stranger: Client = io(url, { transports: ['websocket'], forceNew: true });
    clients.push(stranger);
    await new Promise<void>((resolve) => stranger.once('connect', resolve));

    stranger.emit('room:create', FREE_ROOM, () => undefined);
    await settle();

    expect(nook.state.listRooms()).toEqual(STARTER_ROOMS);
  });
});

describe('persistence', () => {
  it('saves rooms and loads them again after a restart', async () => {
    await stop();
    const directory = mkdtempSync(join(tmpdir(), 'nook-'));
    const dataFile = join(directory, 'world.json');

    try {
      clients = [];
      await start({ dataFile });
      const { socket } = await connect('Asha');
      await socket.emitWithAck('room:create', FREE_ROOM);
      await socket.emitWithAck('room:delete', 'library');
      nook.saver?.flush();
      await stop();

      clients = [];
      await start({ dataFile });
      const names = nook.state.listRooms().map((room) => room.name).sort();
      expect(names).toEqual(['Lounge', 'Studio', 'Workshop']);
    } finally {
      await stop();
      rmSync(directory, { recursive: true, force: true });
      clients = [];
      await start();
    }
  });
});
