import { it } from 'vitest';
import { createTerrain, WORLD_TERRAIN } from '../src/shared/terrain';
it('stat', () => {
  const t = createTerrain(WORLD_TERRAIN);
  let land = 0, mtn = 0, min = 1e9, max = -1e9, n = 0; const hist: Record<string, number> = {};
  const t0 = performance.now();
  for (let i = 0; i < 300; i++) for (let j = 0; j < 300; j++) {
    const h = t.height(i * 3000 + 0.5, j * 3000 + 0.5); n++;
    if (h > 0) land++; if (h > 800) mtn++; min = Math.min(min, h); max = Math.max(max, h);
    const b = String(Math.floor(h / 500) * 500); hist[b] = (hist[b] ?? 0) + 1;
  }
  console.log('ns', ((performance.now() - t0) / n * 1e6).toFixed(0), 'land', (land / n).toFixed(3), '>800', (mtn / n).toFixed(3), 'min', min.toFixed(0), 'max', max.toFixed(0), JSON.stringify(hist));
  // Kosten in Gebirgs-Gegend
  let bx = 0, bz = 0, bh = -1e9; for (let i = 0; i < 300; i++) for (let j = 0; j < 300; j++) { const h = t.height(i * 3000, j * 3000); if (h > bh) { bh = h; bx = i * 3000; bz = j * 3000; } }
  const t1 = performance.now(); for (let k = 0; k < 20000; k++) t.height(bx + k * 0.5, bz); console.log('peak at', bx, bz, bh.toFixed(0), 'ns in mountains', ((performance.now() - t1) / 20000 * 1e6).toFixed(0));
});
