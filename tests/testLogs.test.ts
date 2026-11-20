import { describe, expect, it } from 'vitest';
import { buildLogField } from '../src/shared/testLogs';
import { sampleTerrainHeightWorld } from '../src/shared/terrainHeight';

describe('test log field', () => {
  const logs = buildLogField(0, 0);
  it('10 logs, 20 m ahead (−Z), 2.8 m pitch (0.8 m logs + 2 m gap)', () => {
    expect(logs).toHaveLength(10);
    expect(logs[0].z).toBeCloseTo(-20);
    expect(logs[1].z - logs[0].z).toBeCloseTo(-2.8);
  });
  it('buried 10 % … 90 %: top height above ground matches', () => {
    expect(logs[0].buried).toBeCloseTo(0.1);
    expect(logs[9].buried).toBeCloseTo(0.9);
    for (const l of logs) {
      const top = l.y + l.radius - sampleTerrainHeightWorld(l.x, l.z);
      expect(top).toBeCloseTo(0.8 * (1 - l.buried), 9);
    }
  });
});
