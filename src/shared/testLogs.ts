import { sampleTerrainHeightWorld } from './terrainHeight';

/**
 * Test obstacle: a row of logs lying across the driving direction, partly buried in the ground.
 * Shared by physics (fixed colliders) and rendering (meshes) so both always agree.
 * Positions are ABSOLUTE (world) coordinates; forward = −Z.
 */
export interface LogSpec {
  /** absolute centre of the log */
  x: number;
  y: number;
  z: number;
  radius: number;
  /** length along X [m] */
  length: number;
  /** fraction of the diameter below ground (0 = lying on it, 0.5 = half buried, 1 = flush) */
  buried: number;
}

export interface LogFieldOptions {
  count: number;
  /** distance from the spawn point to the first log [m] */
  distance: number;
  radius: number;
  length: number;
  /** clear gap between neighbouring logs [m] */
  gap: number;
  /** buried fraction of the first / last log; linear in between */
  buriedFirst: number;
  buriedLast: number;
}

export const DEFAULT_LOG_FIELD: LogFieldOptions = {
  count: 10,
  distance: 20,
  radius: 0.4,
  length: 10,
  gap: 2,
  buriedFirst: 0.1,
  buriedLast: 0.9,
};

/**
 * Logs ahead of an absolute spawn point (originX, originZ). Centre height follows the terrain at the log centre,
 * so `buried` is exact there.
 */
export function buildLogField(originX: number, originZ: number, opts: Partial<LogFieldOptions> = {}): LogSpec[] {
  const o = { ...DEFAULT_LOG_FIELD, ...opts };
  const pitch = 2 * o.radius + o.gap;
  const logs: LogSpec[] = [];
  for (let i = 0; i < o.count; i++) {
    const t = o.count > 1 ? i / (o.count - 1) : 0;
    const buried = o.buriedFirst + (o.buriedLast - o.buriedFirst) * t;
    const x = originX;
    const z = originZ - o.distance - i * pitch;
    const ground = sampleTerrainHeightWorld(x, z);
    // top sticks out by D·(1 − buried) above ground; centre is one radius below the top
    const y = ground + 2 * o.radius * (1 - buried) - o.radius;
    logs.push({ x, y, z, radius: o.radius, length: o.length, buried });
  }
  return logs;
}
