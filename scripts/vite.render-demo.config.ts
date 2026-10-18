// Builds only the renderer demo (render-demo.html), independent of src/game and src/ui. Output: dist-render-demo/
// Usage: npx vite build --config scripts/vite.render-demo.config.js
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(import.meta.dirname, '..'),
  base: './',
  build: {
    outDir: resolve(import.meta.dirname, '../dist-render-demo'),
    emptyOutDir: true,
    target: 'es2020',
    rollupOptions: { input: resolve(import.meta.dirname, '../render-demo.html') },
  },
});
