import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { STARTER_ROOMS } from '../shared/constants';
import { registerHandlers, type NookServer } from './handlers';
import { createSaver, loadRooms } from './persistence';
import type { VoiceConfig } from './voice';
import { WorldState } from './world';

export type NookOptions = {
  dataFile?: string;
  origins?: string[];
  voice?: VoiceConfig | null;
};

export function createNook({ dataFile, origins = [], voice = null }: NookOptions = {}) {
  const saved = dataFile ? loadRooms(dataFile) : null;
  const state = new WorldState(saved ?? STARTER_ROOMS);
  const saver = dataFile ? createSaver(dataFile, () => state.listRooms()) : null;

  const app = express();
  app.get('/health', (_request, response) => {
    response.json({
      ok: true,
      rooms: state.listRooms().length,
      players: state.listPlayers().length,
      voice: voice !== null,
    });
  });

  const httpServer = createServer(app);
  const io: NookServer = new Server(httpServer, {
    cors: { origin: origins.length > 0 ? origins : true },
  });
  registerHandlers(io, state, voice, () => saver?.schedule());

  return { httpServer, io, state, saver };
}
