import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';

// OnSlaught 3 lives in onslaught3/ next to OnSlaught2.26 and shares its node_modules.
// From the repo root: `npm run dev:os3` (port 5326), `npm run build:os3` -> onslaught3/dist/, `build:os3:single` -> onslaught3/dist-single/
export default defineConfig(({ mode }) => ({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist', target: 'es2020', emptyOutDir: true },
  server: { port: 5326 },
}));
