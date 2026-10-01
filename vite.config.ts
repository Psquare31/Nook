import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  // The voice SDK is one large chunk that only loads when someone joins voice.
  build: { chunkSizeWarningLimit: 1600 },
  test: { include: ['tests/**/*.test.ts'] },
});
