import { describe, expect, it } from 'vitest';

/** Layer boundaries from src/docs/ARCHITECTURE.md — keeps physics and rendering from merging again. */
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

describe('layer boundaries', () => {
  it('finds the source files', () => {
    for (const d of ['src/shared', 'src/physics', 'src/render', 'src/app']) expect(files(d).length).toBeGreaterThan(2);
  });
  it('shared/ is pure (no three, no Rapier, no other layers)', () => {
    for (const f of files('src/shared'))
      for (const i of staticImports(f)) expect(`${f}: ${i}`).not.toMatch(/: (three|@dimforge|\.\.\/(physics|render|app))/);
  });
  it('physics/ knows no rendering', () => {
    for (const f of files('src/physics'))
      for (const i of staticImports(f)) expect(`${f}: ${i}`).not.toMatch(/: (three\/webgpu|three\/tsl|three\/addons|.*\/(render|app)\/)/);
  });
  it('render/ and app/ do not statically import Rapier/physics', () => {
    for (const f of [...files('src/render'), ...files('src/app'), 'src/main.ts'])
      for (const i of staticImports(f)) expect(`${f}: ${i}`).not.toMatch(/: (@dimforge|.*\/physics\/)/);
  });
});
