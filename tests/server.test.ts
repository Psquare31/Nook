import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNook } from '../server/app';
import { readServerConfig } from '../server/config';
import { readVoiceConfig, voiceChannel } from '../server/voice';
import { PLAYER_RADIUS, STARTER_ROOMS, WORLD } from '../shared/constants';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  Snapshot,
} from '../shared/protocol';
import type { Point, RoomShape } from '../shared/types';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

const INSIDE_LOUNGE: Point = { x: 2000, y: 1500 };
const INSIDE_WORKSHOP: Point = { x: 1400, y: 1400 };
const OUTSIDE: Point = { x: 300, y: 300 };
const STUDIO: RoomShape = { id: 'studio', name: 'Studio', x: 200, y: 200, width: 400, height: 250 };
const WORKSHOP = STARTER_ROOMS[1];

let nook: ReturnType<typeof createNook>;
let url: string;
let clients: Client[];

const keyOf = (name: string) => `${name}-secret-key-0000`;

async function start(options: Parameters<typeof createNook>[0] = {}) {
  nook = createNook(options);
  await new Promise<void>((resolve) => nook.httpServer.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(nook.httpServer.address() as AddressInfo).port}`;
}

async function stop() {
  for (const client of clients) client.disconnect();
  await nook.io.close();
}

async function open(): Promise<Client> {
  const socket: Client = io(url, { transports: ['websocket'], forceNew: true });
  clients.push(socket);
  await new Promise<void>((resolve) => socket.once('connect', resolve));
  return socket;
}

async function connect(name: string, position: Point = INSIDE_LOUNGE, key = keyOf(name)) {
  const socket = await open();
  const snapshot: Snapshot = await socket.emitWithAck('join', { name, key, ...position });
  const me = snapshot.players.find((player) => player.id === socket.id)!;
  return { socket, snapshot, me, owner: { id: me.userId, name: me.name } };
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

    expect(first.me.name).toBe('Guest');
    expect(a.color).not.toBe(b.color);
  });

  it('spawns newcomers in the starting room without stacking them', async () => {
    for (let index = 0; index < 4; index++) {
      const socket = await open();
      await socket.emitWithAck('join', { name: `Guest ${index}` });
    }

    const players = nook.state.listPlayers();
    expect(players.every((player) => player.roomId === 'lounge')).toBe(true);
    for (const a of players) {
      for (const b of players) {
        if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(PLAYER_RADIUS * 2);
      }
    }
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

describe('identity', () => {
  it('gives connections that share a key the same user id', async () => {
    const tab = await connect('Asha');
    const otherTab = await connect('Asha again', INSIDE_LOUNGE, keyOf('Asha'));
    const ben = await connect('Ben');

    expect(otherTab.me.userId).toBe(tab.me.userId);
    expect(ben.me.userId).not.toBe(tab.me.userId);
  });

  it('never sends the key back to anyone', async () => {
    const asha = await connect('Asha');
    await asha.socket.emitWithAck('room:create', STUDIO);
    const ben = await connect('Ben');

    expect(asha.me.userId).not.toBe(keyOf('Asha'));
    expect(JSON.stringify(ben.snapshot)).not.toContain(keyOf('Asha'));
  });

  it('gives a throwaway user id to a connection without a usable key', async () => {
    const noKey = await open();
    const shortKey = await open();
    const first: Snapshot = await noKey.emitWithAck('join', { name: 'One' });
    const second: Snapshot = await shortKey.emitWithAck('join', { name: 'Two', key: 'short' });
    const ids = second.players.map((player) => player.userId);

    expect(first.players[0].userId).toMatch(/^[0-9a-f]{16}$/);
    expect(new Set(ids).size).toBe(2);
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
  it('creates a room owned by its creator and tells the other players', async () => {
    const asha = await connect('Asha');
    const ben = await connect('Ben');
    const created = next(ben.socket, 'room:created');
    const expected = { ...STUDIO, owner: asha.owner };

    const result = await asha.socket.emitWithAck('room:create', STUDIO);

    expect(result).toEqual({ ok: true, room: expected });
    expect(await created).toEqual(expected);
    expect(nook.state.listRooms()).toHaveLength(STARTER_ROOMS.length + 1);
  });

  it('rejects a room that overlaps an existing one', async () => {
    const asha = await connect('Asha');
    const ben = await connect('Ben');
    const created = collect(ben.socket, 'room:created');

    const result = await asha.socket.emitWithAck('room:create', { ...STUDIO, x: 1900, y: 1400 });
    await settle();

    expect(result).toEqual({ ok: false, reason: 'overlap', conflicts: ['lounge'], room: null });
    expect(created).toEqual([]);
    expect(nook.state.listRooms()).toEqual(STARTER_ROOMS);
  });

  it('rejects a room outside the world', async () => {
    const { socket } = await connect('Asha');

    const result = await socket.emitWithAck('room:create', { ...STUDIO, x: WORLD.width - 100 });

    expect(result).toMatchObject({ ok: false, reason: 'bounds' });
  });

  it('lets the creator move a room and tells the other players', async () => {
    const asha = await connect('Asha');
    const ben = await connect('Ben');
    await asha.socket.emitWithAck('room:create', STUDIO);
    const updated = next(ben.socket, 'room:updated');
    const moved = { ...STUDIO, x: 600, y: 600 };

    const result = await asha.socket.emitWithAck('room:update', moved);

    expect(result).toEqual({ ok: true, room: { ...moved, owner: asha.owner } });
    expect(await updated).toEqual({ ...moved, owner: asha.owner });
  });

  it('rejects a move into a neighbour and returns the room as it stands', async () => {
    const asha = await connect('Asha');
    await asha.socket.emitWithAck('room:create', STUDIO);

    const result = await asha.socket.emitWithAck('room:update', { ...STUDIO, x: 1900, y: 1400 });

    expect(result).toEqual({
      ok: false,
      reason: 'overlap',
      conflicts: ['lounge'],
      room: { ...STUDIO, owner: asha.owner },
    });
  });

  it('rejects a resize into a neighbour but allows sharing a wall', async () => {
    const asha = await connect('Asha');
    const beside = { ...STUDIO, x: WORKSHOP.x - 500, y: WORKSHOP.y };
    await asha.socket.emitWithAck('room:create', beside);

    const touching = await asha.socket.emitWithAck('room:update', { ...beside, width: 500 });
    const overlapping = await asha.socket.emitWithAck('room:update', { ...beside, width: 510 });

    expect(touching).toMatchObject({ ok: true });
    expect(overlapping).toMatchObject({ ok: false, reason: 'overlap', conflicts: ['workshop'] });
  });

  it('rejects an update for a room that no longer exists', async () => {
    const { socket } = await connect('Asha');

    const result = await socket.emitWithAck('room:update', STUDIO);

    expect(result).toEqual({ ok: false, reason: 'missing', conflicts: [], room: null });
  });

  it('rejects malformed input without crashing', async () => {
    const { socket } = await connect('Asha');

    const garbage = await socket.emitWithAck('room:create', { id: 'x', name: 5 } as never);
    const notANumber = await socket.emitWithAck('room:create', {
      ...STUDIO,
      width: 'wide',
    } as never);

    expect(garbage).toMatchObject({ ok: false, reason: 'invalid' });
    expect(notANumber).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await socket.emitWithAck('room:create', STUDIO)).toMatchObject({ ok: true });
  });

  it('puts standing players into a room created around them and out again when it is deleted', async () => {
    const asha = await connect('Asha', OUTSIDE);
    const ben = await connect('Ben', OUTSIDE);
    const changes = collect(ben.socket, 'player:room');
    const deleted = next(ben.socket, 'room:deleted');

    await asha.socket.emitWithAck('room:create', STUDIO);
    await settle();
    expect(changes.map((change) => change.roomId)).toEqual(['studio', 'studio']);

    const result = await asha.socket.emitWithAck('room:delete', 'studio');
    await settle();

    expect(result).toEqual({ ok: true });
    expect(await deleted).toBe('studio');
    expect(changes.map((change) => change.roomId)).toEqual(['studio', 'studio', null, null]);
  });

  it('ignores edits from a connection that has not joined', async () => {
    const stranger = await open();

    stranger.emit('room:create', STUDIO, () => undefined);
    await settle();

    expect(nook.state.listRooms()).toEqual(STARTER_ROOMS);
  });
});

describe('room ownership', () => {
  it('stops other users from moving, resizing or renaming a room', async () => {
    const asha = await connect('Asha');
    const ben = await connect('Ben');
    await asha.socket.emitWithAck('room:create', STUDIO);
    const updates = collect(asha.socket, 'room:updated');
    const asCreated = { ...STUDIO, owner: asha.owner };

    const moved = await ben.socket.emitWithAck('room:update', { ...STUDIO, x: 700 });
    const renamed = await ben.socket.emitWithAck('room:update', { ...STUDIO, name: 'Mine now' });
    await settle();

    const refusal = { ok: false, reason: 'forbidden', conflicts: [], room: asCreated };
    expect(moved).toEqual(refusal);
    expect(renamed).toEqual(refusal);
    expect(updates).toEqual([]);
    expect(nook.state.listRooms()).toContainEqual(asCreated);
  });

  it('stops other users from deleting a room', async () => {
    const asha = await connect('Asha');
    const ben = await connect('Ben');
    await asha.socket.emitWithAck('room:create', STUDIO);
    const deletions = collect(asha.socket, 'room:deleted');

    const result = await ben.socket.emitWithAck('room:delete', 'studio');
    await settle();

    expect(result).toEqual({
      ok: false,
      reason: 'forbidden',
      room: { ...STUDIO, owner: asha.owner },
    });
    expect(deletions).toEqual([]);
    expect(nook.state.listRooms()).toHaveLength(STARTER_ROOMS.length + 1);
  });

  it('keeps built-in rooms locked for everyone', async () => {
    const { socket } = await connect('Asha');

    const moved = await socket.emitWithAck('room:update', { ...WORKSHOP, x: 600, y: 600 });
    const deleted = await socket.emitWithAck('room:delete', 'workshop');

    expect(moved).toMatchObject({ ok: false, reason: 'forbidden', room: WORKSHOP });
    expect(deleted).toMatchObject({ ok: false, reason: 'forbidden', room: WORKSHOP });
    expect(nook.state.listRooms()).toEqual(STARTER_ROOMS);
  });

  it('decides the owner itself and ignores one sent by the client', async () => {
    const asha = await connect('Asha');
    const ben = await connect('Ben');
    await asha.socket.emitWithAck('room:create', STUDIO);

    const forged = { ...STUDIO, id: 'forged', y: 600, owner: asha.owner };
    const created = await ben.socket.emitWithAck('room:create', forged);
    const takeover = await ben.socket.emitWithAck('room:update', {
      ...STUDIO,
      x: 700,
      owner: ben.owner,
    } as RoomShape);

    expect(created).toMatchObject({ ok: true, room: { id: 'forged', owner: ben.owner } });
    expect(takeover).toMatchObject({ ok: false, reason: 'forbidden' });
  });

  it('does not let another user reuse the id of an existing room', async () => {
    const asha = await connect('Asha');
    const ben = await connect('Ben');
    await asha.socket.emitWithAck('room:create', STUDIO);

    const sameShape = await ben.socket.emitWithAck('room:create', STUDIO);
    const elsewhere = await ben.socket.emitWithAck('room:create', { ...STUDIO, x: 900, y: 900 });

    expect(sameShape).toMatchObject({ ok: false, reason: 'exists' });
    expect(elsewhere).toMatchObject({ ok: false, reason: 'exists' });
    expect(nook.state.listRooms()).toContainEqual({ ...STUDIO, owner: asha.owner });
  });

  it('recognises the creator again after a reconnect, in any tab with the same key', async () => {
    const asha = await connect('Asha');
    await asha.socket.emitWithAck('room:create', STUDIO);
    asha.socket.disconnect();

    const back = await connect('Asha', OUTSIDE);
    const impostor = await connect('Asha', OUTSIDE, keyOf('someone else'));

    const byImpostor = await impostor.socket.emitWithAck('room:update', { ...STUDIO, x: 700 });
    const byOwner = await back.socket.emitWithAck('room:update', { ...STUDIO, x: 800 });

    expect(byImpostor).toMatchObject({ ok: false, reason: 'forbidden' });
    expect(byOwner).toMatchObject({ ok: true, room: { x: 800 } });
  });

  it('updates the creator shown on a room when the owner renames', async () => {
    const asha = await connect('Asha');
    const ben = await connect('Ben');
    await asha.socket.emitWithAck('room:create', STUDIO);
    const updated = next(ben.socket, 'room:updated');

    asha.socket.emit('player:rename', 'Asha K');

    expect(await updated).toEqual({ ...STUDIO, owner: { id: asha.owner.id, name: 'Asha K' } });
  });
});

describe('voice', () => {
  const credentials = { appId: '0123456789abcdef0123456789abcdef', certificate: 'f'.repeat(32) };

  it('reports voice as off and issues nothing without credentials', async () => {
    const { socket, snapshot } = await connect('Asha');

    expect(snapshot.voice).toBe(false);
    expect(await socket.emitWithAck('voice:token')).toEqual({ ok: false, reason: 'disabled' });
  });

  describe('with credentials', () => {
    beforeEach(async () => {
      await stop();
      clients = [];
      await start({ voice: credentials });
    });

    it('issues a token for the channel of the room the player stands in', async () => {
      const { socket, snapshot, me } = await connect('Asha');

      const grant = await socket.emitWithAck('voice:token');

      expect(snapshot.voice).toBe(true);
      expect(grant).toMatchObject({
        ok: true,
        appId: credentials.appId,
        channel: voiceChannel('lounge'),
        uid: me.voiceUid,
        roomId: 'lounge',
      });
      expect(grant.ok && grant.token.startsWith('007')).toBe(true);
    });

    it('never puts the certificate in what it sends', async () => {
      const { socket, snapshot } = await connect('Asha');

      const grant = await socket.emitWithAck('voice:token');

      expect(JSON.stringify([snapshot, grant])).not.toContain(credentials.certificate);
    });

    it('puts people in the same room on one channel with different uids', async () => {
      const asha = await connect('Asha');
      const ben = await connect('Ben');

      const first = await asha.socket.emitWithAck('voice:token');
      const second = await ben.socket.emitWithAck('voice:token');

      expect(first.ok && second.ok && first.channel === second.channel).toBe(true);
      expect(asha.me.voiceUid).not.toBe(ben.me.voiceUid);
    });

    it('follows the player into another room and outside', async () => {
      const asha = await connect('Asha');
      const ben = await connect('Ben');
      const moved = collect(ben.socket, 'player:room');

      asha.socket.emit('player:move', INSIDE_WORKSHOP);
      await settle();
      const inWorkshop = await asha.socket.emitWithAck('voice:token');
      asha.socket.emit('player:move', OUTSIDE);
      await settle();
      const outside = await asha.socket.emitWithAck('voice:token');

      expect(moved).toHaveLength(2);
      expect(inWorkshop).toMatchObject({ channel: voiceChannel('workshop'), roomId: 'workshop' });
      expect(outside).toMatchObject({ channel: 'outside', roomId: null });
    });

    it('refuses a connection that has not joined', async () => {
      const stranger = await open();

      expect(await stranger.emitWithAck('voice:token')).toEqual({ ok: false, reason: 'not-joined' });
    });
  });

  it('gives every room its own channel name whatever its id contains', () => {
    const names = ['lounge', 'workshop', 'a room/with spaces & émojis 🎧', 'outside'].map(voiceChannel);

    expect(new Set(names).size).toBe(names.length);
    expect(names.every((name) => /^room-[0-9a-f]{32}$/.test(name))).toBe(true);
    expect(voiceChannel(null)).toBe('outside');
  });

  it('only turns voice on when both credentials look right', () => {
    expect(readVoiceConfig({})).toBeNull();
    expect(readVoiceConfig({ AGORA_APP_ID: credentials.appId })).toBeNull();
    expect(readVoiceConfig({ AGORA_APP_ID: 'nope', AGORA_APP_CERTIFICATE: 'nope' })).toBeNull();
    expect(
      readVoiceConfig({
        AGORA_APP_ID: ` ${credentials.appId} `,
        AGORA_APP_CERTIFICATE: credentials.certificate,
      }),
    ).toEqual(credentials);
  });
});

describe('http endpoints', () => {
  it('reports health without letting anything cache it', async () => {
    await connect('Asha');

    const response = await fetch(`${url}/health`);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      ok: true,
      rooms: STARTER_ROOMS.length,
      players: 1,
      voice: false,
    });
  });

  it('answers HEAD on the health route for monitors that only send HEAD', async () => {
    const response = await fetch(`${url}/health`, { method: 'HEAD' });

    expect(response.status).toBe(200);
  });

  it('answers on the root path too, where some monitors point by default', async () => {
    const response = await fetch(url);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('/health');
  });
});

describe('server config', () => {
  it('keeps to loopback and port 3001 by default', () => {
    expect(readServerConfig({})).toMatchObject({ host: '127.0.0.1', port: 3001, origins: [] });
  });

  it('listens on every interface and on the given port when running on Render', () => {
    expect(readServerConfig({ RENDER: 'true', PORT: '10000' })).toMatchObject({
      host: '0.0.0.0',
      port: 10000,
    });
  });

  it('lets HOST override the Render default', () => {
    expect(readServerConfig({ RENDER: 'true', HOST: '127.0.0.1' }).host).toBe('127.0.0.1');
  });

  it('reads a comma-separated origin list and drops trailing slashes', () => {
    expect(
      readServerConfig({ CLIENT_ORIGIN: 'https://nook.vercel.app/, https://nook-git-dev.vercel.app' })
        .origins,
    ).toEqual(['https://nook.vercel.app', 'https://nook-git-dev.vercel.app']);
  });
});

describe('allowed origins', () => {
  const ALLOWED = 'https://nook.example';

  async function attempt(origin?: string): Promise<'connected' | 'refused'> {
    const socket: Client = io(url, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      extraHeaders: origin ? { origin } : undefined,
    });
    clients.push(socket);
    return new Promise((resolve) => {
      socket.once('connect', () => resolve('connected'));
      socket.once('connect_error', () => resolve('refused'));
    });
  }

  it('accepts every origin when none are configured', async () => {
    expect(await attempt('https://anywhere.example')).toBe('connected');
  });

  describe('when configured', () => {
    beforeEach(async () => {
      await stop();
      clients = [];
      await start({ origins: [ALLOWED] });
    });

    it('accepts pages served from an allowed origin', async () => {
      expect(await attempt(ALLOWED)).toBe('connected');
    });

    it('refuses pages served from any other origin', async () => {
      expect(await attempt('https://evil.example')).toBe('refused');
      expect(await attempt(`${ALLOWED}.evil.example`)).toBe('refused');
    });

    it('still accepts clients that are not web pages', async () => {
      expect(await attempt()).toBe('connected');
    });
  });
});

describe('persistence', () => {
  it('saves rooms with their owners and loads them again after a restart', async () => {
    await stop();
    const directory = mkdtempSync(join(tmpdir(), 'nook-'));
    const dataFile = join(directory, 'world.json');

    try {
      clients = [];
      await start({ dataFile });
      const asha = await connect('Asha');
      await asha.socket.emitWithAck('room:create', STUDIO);
      nook.saver?.flush();
      await stop();

      clients = [];
      await start({ dataFile });
      const names = nook.state.listRooms().map((room) => room.name).sort();
      expect(names).toEqual(['Library', 'Lounge', 'Studio', 'Workshop']);

      const ben = await connect('Ben');
      const back = await connect('Asha');
      expect(await ben.socket.emitWithAck('room:delete', 'studio')).toMatchObject({ ok: false });
      expect(await back.socket.emitWithAck('room:delete', 'studio')).toEqual({ ok: true });
    } finally {
      await stop();
      rmSync(directory, { recursive: true, force: true });
      clients = [];
      await start();
    }
  });
});
