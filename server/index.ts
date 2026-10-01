import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createNook } from './app';
import { readVoiceConfig } from './voice';

if (existsSync('.env')) process.loadEnvFile('.env');

const port = Number(process.env.PORT) || 3001;
// Loopback only unless HOST says otherwise, so a dev machine does not expose the world to its network.
const host = process.env.HOST || '127.0.0.1';
// Browsers send the origin without a trailing slash, so one typed here would never match.
const origins = (process.env.CLIENT_ORIGIN ?? '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);
const dataFile = resolve(process.env.DATA_DIR || 'data', 'world.json');
const voice = readVoiceConfig(process.env);

const { httpServer, saver, state } = createNook({ dataFile, origins, voice });

httpServer.on('error', (error) => {
  console.error(`Could not listen on ${host}:${port}: ${error.message}`);
  process.exit(1);
});

httpServer.listen(port, host, () => {
  console.log(`Nook server on http://${host}:${port}`);
  console.log(`  rooms: ${state.listRooms().length}, saved in ${dataFile}`);
  console.log(`  allowed origins: ${origins.length > 0 ? origins.join(', ') : 'any'}`);
  console.log(`  voice chat: ${voice ? 'on' : 'off (no Agora credentials)'}`);
  if (process.env.NODE_ENV === 'production' && origins.length === 0) {
    console.warn('  CLIENT_ORIGIN is not set, so pages on any website can connect to this backend.');
  }
});

function shutdown() {
  saver?.flush();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
