# Terrain – infinite, LOD, floating origin

## Grid (all powers of two)
| Level k | Cell size | Tile edge | Role |
|---|---|---|---|
| 0 | 0.5 m | 32 m | near visuals = **physics grid** (physics tile 64 m = 2×2 render tiles) |
| 1–5 | 1–16 m | 64–1024 m | finely split (`lodSplit` 0.9) → detail to ~2 km |
| 6–10 | 32–512 m | 2048–32 768 m | coarsely split (0.5) → distance to 32 768 m (fog end) |

Level k samples every second point from level k−1 (same sampler `sampleGrid`, same diagonal).
Render levels are band-limited (see generator); LOD 0 and physics are identical. Origin shift on 64 m grid from 1024 m.

| File | Responsibility |
|---|---|
| `shared/config.ts` | `CELL`, `TILE_SIZE`, `MAX_LOD`, `VIEW_DISTANCE`, `DETAIL_RANGE`, `lodSplit()`, physics tiles |
| `shared/terrain/` | **Generator** (pure, no three.js/Rapier): noise, layers, presets – see below |
| `shared/terrainHeight.ts` | `sampleTerrainHeightWorld(x, z)` + `sampleGrid()` of active terrain – **sole** sampler for physics and visuals |
| `shared/tileGeometry.ts` | tile: positions, normals, skirts, index buffers + morph data (coarse height **and** coarse normal, morph range) |
| `render/terrain/LodTerrain.ts` | quadtree selection (hysteresis on split **and** view distance), worker pool, **one BatchedMesh** (320 fixed slots, LRU) |
| `render/terrain/tileWorker.ts` | tile worker (transfer without copy) |
| `physics/terrainColliders.ts` | 3×3 Rapier heightfields at 64 m (128 cells) around the vehicle |

## Generator (`shared/terrain/`)
Infinite and deterministic: height = pure function of seed + configuration (no map, no state).

| File | Contents |
|---|---|
| `noise.ts` | hash, 2D Simplex (gradient noise), `fbm` with band limiting, `smoothstep` |
| `types.ts` | `TerrainConfig` (pure data), `Layer`, `SampleContext` (height + masks) |
| `layers/*.ts` | one file per layer; `layers/index.ts` maps type → factory |
| `generator.ts` | `createTerrain(config)` → `height(x, z)`, `sampleGrid(...)` |
| `presets.ts` | `DEFAULT_TERRAIN`, `TERRAIN_PRESETS` |
| `index.ts` | public entry, `setTerrain()` / `terrain()` (active terrain per thread) |

Rules:
- **Bit-identical everywhere:** only `+ − × ÷`, `floor`, `sqrt`, `Math.imul`/bit ops. No `Math.pow/sin/exp` (engine-dependent).
  Golden-value test (`tests/generateHeights.test.ts`) – re-record on intentional change.
- Each layer has its own seed (name + base seed) → new layers do not change existing ones.
- Configuration goes via message to physics worker and tile workers; each thread builds the same generator.
  Selection via URL: `?terrain=<preset>&seed=<number>`.
- **Band limiting:** render tiles omit wavelengths < 2·cell size (saves time, no shimmer);
  physics always full resolution. Morph target is therefore sampled from the real parent level (test “geomorphing target”).
- Cost ~1 µs per point (world). Physics tiles: under the vehicle immediately, neighbors incrementally with
  ~2500 points per physics step (~2.5 ms) → no worker hitch.

### Layers
| Layer | File | Effect | Masks |
|---|---|---|---|
| `continent` | `layers/continent.ts` | land/sea from noise at 160 km wavelength; threshold −0.06 → ~60% land. Land 0 … 300 m (flat coasts), shelf −150 m, deep sea to −1500 m | `land`, `coast`, `inland` |
| `mountains` | `layers/mountains.ts` | mountain ranges: mask (90 km) × `inland`, quadratic falloff (foothills). Shape = 30% smooth bulk (25 km) + 70% ridges (5 rounded ridged octaves from 12 km, crest rounding 0.12) + weak rock detail only on crests; warp 1.5 km, stretch 1.3; up to 3000 m | `mountain` |
| `detail` | `layers/detail.ts` | ground ripples (50 m, 5 octaves) | – |

Limits (`limits`): peaks soft to 3000 m (asymptotic from 2700), seabed hard at −1500 m.

### Presets
| Name | Contents |
|---|---|
| `world` (= `default`) | continent + mountains + ground ripples ±3 m |
| `hills` | hills only 1.5 … 7.5 m – suspension, physics, and LOD tests (`tests/setup.ts`) |

Start: without `?x/?z`, `findLand(0, 0)` finds the nearest flat land point (5 … 400 m, slope < 15%).
Mountains for sightseeing: `?x=858000&z=897000` (~2460 m).

Mountain shaping (lessons): many sharp ridged octaves (`1 − |n|`) create jagged spikes; strong stretch/warp creates
grooves; undamped fine detail looks like crumpled paper. Hence: few rounded ridges, smooth flanks,
fine detail only on crests.

Planned: `regions` (plains, hills, alpine, badlands, alien), `hills`, location-dependent `detail`, `materials`.

## Anti-flicker / anti-popping
- **LOD distance in 3D:** distance camera ↔ tile over its height span (`bounds`) – a mountain 2 km higher
  is not chosen too fine/coarse incorrectly.
- **Skirts follow terrain:** depth = 2·cell size + 0.5·2^k + 2·largest morph excursion → no cracks on steep slopes.
- **Refine level by level:** a tile is replaced by its 4 children only when those are ready; if one is missing,
  only that tile remains. (Previously the whole subtree to LOD 0 had to be ready – while driving a large area
  regularly fell back to the 32 km root → strong flicker. Test: “LOD while driving”.)
- Recently used tiles (visible + children in preparation) are not evicted from cache.
- **CDLOD geomorphing** in the vertex shader: between `morphRange` (0.65·end … end, end = parent split distance)
  glide height and normal toward the coarser level. On split children look exactly like the parent; on merge likewise
  → neither geometry nor lighting jump.
- Roots chosen by view distance (no fixed 3×3 window jumping at root boundaries).
- Toggle visibility only on change; selection only when camera moves > 0.25 m or new tiles arrive.

## Numbers
~120–160 visible tiles (to 32 km), **1 draw call**, ~1.3M triangles. Terrain casts no shadows.
Initial build in mountains ~1.3 s compute, spread across up to 4 tile workers.

## Later
- Distant physics: coarser heightfield rings (cell size 2^k · 0.5 m) via `sampleGrid`, own collision group
  (distant objects only), so the vehicle does not collide twice.