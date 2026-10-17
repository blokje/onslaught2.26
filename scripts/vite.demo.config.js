// Temporary config to build only the UI demo while src/game and src/render may not exist yet:
//   npx vite build --config scripts/vite.demo.config.js
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(import.meta.dirname, '..'),
  base: './',
  build: { outDir: 'dist-demo', emptyOutDir: true, rollupOptions: { input: resolve(import.meta.dirname, '../ui-demo.html') } },
});
