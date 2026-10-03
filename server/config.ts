import { resolve } from 'node:path';
import { readAuthConfig, type AuthConfig } from './auth';
import { readVoiceConfig, type VoiceConfig } from './voice';

export type ServerConfig = {
  port: number;
  host: string;
  origins: string[];
  dataFile: string;
  voice: VoiceConfig | null;
  auth: AuthConfig | null;
};

export function readServerConfig(env: NodeJS.ProcessEnv): ServerConfig {
  return {
    port: Number(env.PORT) || 3001,
    // Render only routes traffic to apps listening on every interface. Anywhere else the
    // default is loopback, so a dev machine does not expose the world to its network.
    host: env.HOST || (env.RENDER ? '0.0.0.0' : '127.0.0.1'),
    // Browsers send the origin without a trailing slash, so one typed here would never match.
    origins: (env.CLIENT_ORIGIN ?? '')
      .split(',')
      .map((origin) => origin.trim().replace(/\/+$/, ''))
      .filter(Boolean),
    dataFile: resolve(env.DATA_DIR || 'data', 'world.json'),
    voice: readVoiceConfig(env),
    auth: readAuthConfig(env),
  };
}
