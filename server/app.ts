import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { STARTER_ROOMS } from '../shared/constants';
import { createAuth, type AuthConfig } from './auth';
import { registerHandlers, type NookServer } from './handlers';
import { createSaver, loadRooms } from './persistence';
import type { VoiceConfig } from './voice';
import { WorldState } from './world';

export type NookOptions = {
  dataFile?: string;
  origins?: string[];
  voice?: VoiceConfig | null;
  auth?: AuthConfig | null;
  // Lets everyone build when Google sign-in is not configured. Meant for local testing.
  openBuilding?: boolean;
};

export function createNook({
  dataFile,
  origins = [],
  voice = null,
  auth = null,
  openBuilding = false,
}: NookOptions = {}) {
  const saved = dataFile ? loadRooms(dataFile) : null;
  const state = new WorldState(saved ?? STARTER_ROOMS);
  const saver = dataFile ? createSaver(dataFile, () => state.listRooms()) : null;

  const app = express();

  // Polled by Render's health check and by an uptime monitor. Every request counts as
  // traffic, which is what keeps a free Render service from going to sleep. Express
  // answers HEAD on the same route, for monitors that only send HEAD.
  app.get('/health', (_request, response) => {
    response.set('Cache-Control', 'no-store');
    response.json({
      ok: true,
      uptime: Math.round(process.uptime()),
      rooms: state.listRooms().length,
      players: state.listPlayers().length,
      voice: voice !== null,
      signIn: auth !== null,
      building: auth ? 'signed-in' : openBuilding ? 'everyone' : 'off',
    });
  });

  app.get('/', (_request, response) => {
    response.type('text/plain').send('Nook backend. Status: /health\n');
  });

  const httpServer = createServer(app);
  const io: NookServer = new Server(httpServer, {
    cors: { origin: origins.length > 0 ? origins : true },
    // Browsers do not apply CORS to WebSockets, so the origin is checked here as well.
    // Requests without an Origin header come from scripts, not from another website's page.
    allowRequest: (request, decide) => {
      const origin = request.headers.origin;
      decide(null, origins.length === 0 || origin === undefined || origins.includes(origin));
    },
    // Every message this app sends is tiny; anything larger is not from this app.
    maxHttpBufferSize: 16 * 1024,
  });
  registerHandlers(io, state, voice, auth ? createAuth(auth) : null, openBuilding, () =>
    saver?.schedule(),
  );

  return { httpServer, io, state, saver };
}
