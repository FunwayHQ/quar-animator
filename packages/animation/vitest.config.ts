import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
    // Importing the core barrel also loads opentype.js. Its CommonJS export
    // mutation fails under Vitest's jsdom/module runner, so use core's existing
    // deterministic font mock for animation unit tests.
    alias: {
      'opentype.js': path.resolve(__dirname, '../core/src/test/__mocks__/opentype.js.ts'),
    },
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/test/'],
    },
  },
});
