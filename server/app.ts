import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { STARTER_ROOMS } from '../shared/constants';
import { registerHandlers, type NookServer } from './handlers';
import { createSaver, loadRooms } from './persistence';
import { WorldState } from './world';

export type NookOptions = {
  dataFile?: string;
  origins?: string[];
};

export function createNook({ dataFile, origins = [] }: NookOptions = {}) {
  const saved = dataFile ? loadRooms(dataFile) : null;
  const state = new WorldState(saved ?? STARTER_ROOMS);
  const saver = dataFile ? createSaver(dataFile, () => state.listRooms()) : null;

  const app = express();
  app.get('/health', (_request, response) => {
    response.json({
      ok: true,
      rooms: state.listRooms().length,
      players: state.listPlayers().length,
    });
  });

  const httpServer = createServer(app);
  const io: NookServer = new Server(httpServer, {
    cors: { origin: origins.length > 0 ? origins : true },
  });
  registerHandlers(io, state, () => saver?.schedule());

  return { httpServer, io, state, saver };
}
