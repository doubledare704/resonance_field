import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    coverage: {
      include: ['src/server/**/*.ts', 'src/shared/**/*.ts'],
      exclude: ['src/server/index.ts', 'src/server/routes/**'],
    },
  },
});
