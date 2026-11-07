import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.{ts,tsx}', 'apps/*/test/**/*.test.{ts,tsx}'],
    testTimeout: 30_000,
    // Worker threads: Colyseus calls process.send() (PM2 integration) when it
    // exists, which collides with Vitest's child-process IPC channel.
    pool: 'threads',
  },
});
