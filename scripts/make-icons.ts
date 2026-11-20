// Renders public/icons/icon.svg to the PNG sizes the web manifest and iOS need. Run: node scripts/make-icons.ts
// Uses the Chromium that Playwright provides on the development machine (a tool here, not a project dependency);
// the PNGs are committed, so a normal build does not need it.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const dir = fileURLToPath(new URL('../public/icons/', import.meta.url));
const svg = readFileSync(dir + 'icon.svg', 'utf8');
// require (not import) so the globally installed Playwright is found; it has no types here because it is not a dependency
// any: untyped optional tool module (see above)
const { chromium } = createRequire(import.meta.url)('playwright') as any;

const SIZES: [string, number, boolean][] = [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['maskable-512.png', 512, true], ['apple-touch-icon.png', 180, false]];
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, maskable] of SIZES) {
  // maskable: the art sits inside the 80% safe zone on a full-bleed background
  const inner = maskable ? Math.round(size * 0.8) : size;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:${maskable ? '#1a1410' : 'transparent'};display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px">`
    + `<img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${inner}" height="${inner}"></body></html>`);
  writeFileSync(dir + name, await page.screenshot({ omitBackground: !maskable }));
  console.log('wrote', name);
}
await browser.close();
