import { existsSync } from 'node:fs';
import { createNook } from './app';
import { readServerConfig } from './config';

if (existsSync('.env')) process.loadEnvFile('.env');

const { port, host, origins, dataFile, voice } = readServerConfig(process.env);
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
