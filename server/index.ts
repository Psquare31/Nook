import { existsSync } from 'node:fs';
import { createNook } from './app';
import { readServerConfig } from './config';

if (existsSync('.env')) process.loadEnvFile('.env');

const { port, host, origins, dataFile, voice, auth, openBuilding } = readServerConfig(process.env);
const { httpServer, saver, state } = createNook({ dataFile, origins, voice, auth, openBuilding });

function describeBuilding(): string {
  if (auth) return 'on, required to build rooms';
  if (openBuilding) return 'off, everyone can build (ALLOW_BUILD_WITHOUT_SIGN_IN)';
  return 'off, so nobody can build. Set GOOGLE_CLIENT_ID and SESSION_SECRET.';
}

httpServer.on('error', (error) => {
  console.error(`Could not listen on ${host}:${port}: ${error.message}`);
  process.exit(1);
});

httpServer.listen(port, host, () => {
  console.log(`Nook server on http://${host}:${port}`);
  console.log(`  rooms: ${state.listRooms().length}, saved in ${dataFile}`);
  console.log(`  allowed origins: ${origins.length > 0 ? origins.join(', ') : 'any'}`);
  console.log(`  voice chat: ${voice ? 'on' : 'off (no Agora credentials)'}`);
  console.log(`  Google sign-in: ${describeBuilding()}`);
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
