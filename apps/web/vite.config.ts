/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
// The user guide at /help/, built from docs/help/ before `vite` and `vite build`
import { helpPages } from './scripts/help/vite-plugin.mjs';

/**
 * A build's page runs scripts only from the editor itself: none written into
 * a page, or loaded from elsewhere — but for workers made from blob: URLs,
 * as mediabunny makes its (video and sound). Not on the dev server, whose own
 * hot-reload script is written into the page.
 */
function scriptsFromHereOnly(): Plugin {
  return {
    name: 'quar-scripts-from-here-only',
    apply: 'build',
    transformIndexHtml(html) {
      const policy = "object-src 'none'";
      if (!html.includes(policy))
        throw new Error('index.html has lost its Content-Security-Policy');
      return html.replace(policy, `script-src 'self'; worker-src 'self' blob:; ${policy}`);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), helpPages(), scriptsFromHereOnly()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/test/'],
    },
    alias: {
      'opentype.js': path.resolve(
        __dirname,
        '../../packages/core/src/test/__mocks__/opentype.js.ts'
      ),
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@quar/types': path.resolve(__dirname, '../../packages/types/src'),
      '@quar/core': path.resolve(__dirname, '../../packages/core/src'),
      '@quar/animation': path.resolve(__dirname, '../../packages/animation/src'),
      '@quar/rigging': path.resolve(__dirname, '../../packages/rigging/src'),
      '@quar/ui': path.resolve(__dirname, '../../packages/ui/src'),
      '@quar/export': path.resolve(__dirname, '../../packages/export/src'),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'zustand'],
  },
});
