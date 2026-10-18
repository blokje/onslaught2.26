// Builds only the UI demo (ui-demo.html, App with mocks), independent of src/game and src/render. Output: dist-demo/
// Usage: npx vite build --config scripts/vite.demo.config.js
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(import.meta.dirname, '..'),
  base: './',
  build: { outDir: 'dist-demo', emptyOutDir: true, rollupOptions: { input: resolve(import.meta.dirname, '../ui-demo.html') } },
});
