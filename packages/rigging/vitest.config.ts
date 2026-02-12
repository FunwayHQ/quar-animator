import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/'],
    },
    alias: {
      'opentype.js': path.resolve(__dirname, '../core/src/test/__mocks__/opentype.js.ts'),
    },
  },
});
