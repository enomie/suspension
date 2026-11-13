import { describe, expect, it } from 'vitest';

/** Schichtgrenzen aus docs/ARCHITECTURE.md – verhindert, dass Physik und Optik wieder verschmelzen. */
const SOURCES = import.meta.glob('../src/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;
const files = (dir: string): string[] =>
  Object.keys(SOURCES)
    .map((k) => k.replace('../', ''))
    .filter((p) => p.startsWith(dir + '/') || p === dir);
const staticImports = (p: string) =>
  [...SOURCES['../' + p].matchAll(/^import\s[^;]*?from\s+'([^']+)'/gms)]
    .filter((m) => !/^import\s+type\s/.test(m[0]))
    .map((m) => m[1]);

describe('Schichtgrenzen', () => {
  it('findet die Quellen', () => {
    for (const d of ['src/shared', 'src/physics', 'src/render', 'src/app']) expect(files(d).length).toBeGreaterThan(2);
  });
  it('shared/ ist rein (kein three, kein Rapier, keine anderen Schichten)', () => {
    for (const f of files('src/shared'))
      for (const i of staticImports(f)) expect(`${f}: ${i}`).not.toMatch(/: (three|@dimforge|\.\.\/(physics|render|app))/);
  });
  it('physics/ kennt kein Rendering', () => {
    for (const f of files('src/physics'))
      for (const i of staticImports(f)) expect(`${f}: ${i}`).not.toMatch(/: (three\/webgpu|three\/tsl|three\/addons|.*\/(render|app)\/)/);
  });
  it('render/ und app/ laden Rapier/Physik nicht statisch', () => {
    for (const f of [...files('src/render'), ...files('src/app'), 'src/main.ts'])
      for (const i of staticImports(f)) expect(`${f}: ${i}`).not.toMatch(/: (@dimforge|.*\/physics\/)/);
  });
});
