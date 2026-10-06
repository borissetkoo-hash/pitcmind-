import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  worker: { format: 'es' },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 60_000 },
});
