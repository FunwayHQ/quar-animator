/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
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
