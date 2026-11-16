# Terrain in apokalypto – adoption and status

Concrete implementation of [INTEGRATION_TERRAIN.md](INTEGRATION_TERRAIN.md) in **apokalypto**
(repo `enomie/apokalypto`). Chosen: **variant 3, stepwise** – foundation + generator from suspension,
apokalypto features (oasis, waterways, dunes …) rebuilt afterward one by one as generator layers.

| Step | Status | apokalypto commit |
|---|---|---|
| 1. Generator, LOD visuals, 0.5 m physics tiles | **done** | `a5e0afdd` |
| 1b. Physics worker builds terrain tiles itself (like suspension) | **done** | branch `claude/focused-cerf-gj1kcv` |
| 2. apokalypto features as layers | open – list in §7 | – |

Previously apokalypto had 3×3 chunks at 8192 m with 256 subdivisions (**32 m cell size**, visuals = physics).
Now: visuals 0.5 m near to 32 km far (1 draw call), physics 0.5 m in 64 m tiles.

## 1. File mapping suspension → apokalypto
All under `apokalypto/src/game/game-terrain/`. Naming per apokalypto convention (`game-terrain-…`, imports with `.ts`).

| suspension | apokalypto | Change when porting |
|---|---|---|
| `shared/terrain/noise.ts` | `game-terrain-gen/game-terrain-gen-noise.ts` | unchanged |
| `shared/terrain/types.ts`, `generator.ts`, `presets.ts`, `index.ts` | `game-terrain-gen/game-terrain-gen-{types,generator,presets,index}.ts` | unchanged |
| `shared/terrain/layers/*.ts` | `game-terrain-gen/layers/game-terrain-gen-layer-*.ts` | lint: `ctx.masks.inland ?? 1` → `'inland' in ctx.masks ? … : 1` |
| `shared/terrainHeight.ts` (+ `setTerrain`) | `game-terrain-gen/game-terrain-gen-world.ts` | **world offset** (§3), static preset instead of init message |
| `shared/config.ts` (LOD part) | `game-terrain-lod/game-terrain-lod-config.ts` | view distance = camera far 20 km (§5) |
| `shared/config.ts` (physics part) | `game-terrain-mesh/game-terrain-mesh-config.ts`, `game-terrain-stream-config.ts` | radius 6 instead of 1 (§4) |
| `shared/tileGeometry.ts` | `game-terrain-lod/game-terrain-lod-tile-geometry.ts` | + vertex color `color` and morph target `morphColor` |
| `render/terrain/LodTerrain.ts` | `game-terrain-lod/game-terrain-lod.ts` (`GameTerrainLod`) | absolute placement in `worldGroup`, `primeAround()` for boot |
| `render/terrain/tileWorker.ts` | `game-terrain-lod/game-terrain-lod-tile.worker.ts` | without `terrain` message |
| `terrainMaterial()` | `game-terrain-look/game-terrain-look-material.ts` → `buildGameTerrainLodMaterial()` | morph + apokalypto look chain (§5) |
| `physics/terrainColliders.ts` | `game-physics-worker/environment/game-physics-worker-environment-terrain.ts` (`PhysicsWorkerTerrainTiles`) | tiles under **every** dynamic body instead of one vehicle (§4) |
| `shared/origin.ts`, `originShifter.ts` | – **not adopted** | apokalypto has its own floating origin (§3) |

## 2. One height function for everything
`gameTerrainHeightAtWorld(x, z)` (`game-terrain-height/game-terrain-height-base.ts`) reads the generator. It is pure and
runs on every thread – **no height grids, no SAB, no readiness polling**:

| Consumer | Source |
|---|---|
| physics heightfields | physics worker, `gameTerrainGenSampleRowsInto` (full resolution) |
| LOD visuals | tile worker, `gameTerrainGenSampleGrid` (band-limited) |
| spawn, vehicle placement, props, decor, flora, minimap | `gameTerrainHeightAtWorld` / `session.sampleCoarseTerrainYAt` |
| biome colors (`gameTerrainVertexAlbedoRgbAtWorld`) | tile worker per vertex |

Physics tiles lie on exactly the same points; between points Rapier interpolates linearly (deviation from
generator height < 1 cm at 0.5 m grid).

## 3. Coordinates, floating origin, offset
| Topic | suspension | apokalypto |
|---|---|---|
| Axes / unit | Y up, 1 = 1 m, sea y = 0 | same (`GAME_WATER_LEVEL_Y_M = 0`) → continent layer fits without conversion |
| Floating origin | `ORIGIN`, tiles repositioned on shift | `worldGroup.position = −origin`, children absolute → LOD tiles sit **absolute** in `worldGroup`, no repositioning |
| Camera for LOD | local + `ORIGIN` | `presentScratch.cameraView.absolute*` (present lane, after camera update) |
| World placement | start via `findLand(0, 0)` | fixed **offset** `GAME_TERRAIN_GEN_OFFSET_X/Z_M = (400 000, −320 000)` |

Why offset instead of `findLand`: apokalypto has spawn presets at fixed coordinates (±9 km around 0,0). The offset places
that area on a high plateau inland: within ±12 km all land (247 … 330 m), peaks to ~2900 m
within 30 km (highest at world (8500, 20750)). Found via script over 20 km grid (condition: land in whole
preset area, mountains in view distance). New seeds/presets → repeat search.

Biome height bands unchanged: cold from 500 m, snow from 1000 m → mountains become cold/snowy, plateau stays temperate.

## 4. Physics tiles (owned by physics worker)
Tile = 128 cells × 0.5 m = 64 m (= 2×2 LOD-0 tiles, same points, same diagonal as Rapier).
Physics worker builds them itself, before each `world.step()` (`PhysicsWorkerCore.updateTerrainTiles`):

| Rule | Value | Reason |
|---|---|---|
| Immediate (same step) | tile under every active dynamic body + under its position in 0.25 s | nothing falls through missing ground; 10–20 ms per tile |
| Distributed | ring radius 1 (3×3, ±96 m) per body, nearest first, 2048 heights per step | like suspension (`tiles.update(…, 2500)`) |
| Retain | radius 2 per body | hysteresis |
| Unload | max 4 per step, constraints on body released first | |
| Refresh focus | every 8 steps (`world.forEachRigidBody`, dynamic + active) | between steps only “tile under body” |

Difference vs suspension: there one vehicle, here all bodies (character, vehicles, props, equipment) – hence
no ring size by streaming tier needed. After worker restart (recovery) new worker rebuilds
tiles itself.

Main thread learns changes only via response (`TERRAIN_CHUNK_READY` / `TERRAIN_CHUNK_REMOVED`) →
`game-terrain-mesh-physics-registry.ts` (tether anchors, contact mapping, telemetry `Chunks=`).
Topology changes mark raycast controllers near vehicles for rebuild (as before with `TERRAIN_CHUNK_ADD`).

Removed vs step 1: `GameTerrainChunkRing`, height grid SAB (layout, views, slots, bind), terrain worker job
`computeHeightTile`, `TERRAIN_CHUNK_ADD`/`REMOVE`, `INIT_TERRAIN_HEIGHT_GRID_SAB`, grid interpolation.

The **8192 m grid remains** as “macro chunk” (`GAME_TERRAIN_MACRO_CHUNK_M`, `gameTerrainMacro…` in
`game-terrain-chunk-coords.ts`) for water planes, cell streaming subcells, and float-origin recenter (4096 m).
`gameTerrain…Chunk…` without “Macro” now always means the 64 m physics tile.

## 5. LOD visuals and material
- `GameTerrainLod` belongs to `GameTerrainSession` (`session.lod`), `bindWorldGroup` attaches BatchedMesh,
  `tickLodAtCamera(absX, absY, absZ)` runs in `game-world-present-chunk-surface-lane.ts`.
- Boot: `bootGroundAtSpawn` only fills LOD (`primeAround`, max 8 s, rest streams coarse → fine); physics worker builds tiles when bodies spawn.
- BatchedMesh name = `GAME_TERRAIN_CHUNK_DRAW_MESH_NAME` → boot shader compile finds it like old chunks.
- **Material** (`buildGameTerrainLodMaterial`): CDLOD morph like suspension (height + normal) **plus color**
  (`morphColor`, else biome color jumps on slopes on tile change because it depends on normal).
  On top, existing apokalypto chain: near grain (color + normal), wet shore sand, water tint, tire tracks.
  `tslGameTerrainNearSandNormal` has optional param `baseNormalWorld` (morphed normal) for this.
- View distance = `GAME_SKY_CAMERA.FAR_CLIP_M` (20 km) instead of 32 km; apokalypto does not use reversed Z
  (see §8, open).

## 6. Pitfalls (during integration)
| Symptom | Cause | Fix / location |
|---|---|---|
| (step 1) Rapier “unreachable” panic after 2–11 steps, vehicles with `terrainY = NaN` | first present frame read PLAYER_ANCHOR = (0,0): boot seed set `interp` but not `previousPose/currentPose` → physics ring centered on 0,0 and unloaded tiles at spawn. Old 8 km chunk had 0,0 and spawn in same chunk – error invisible | `seedPlayerAnchorPresentInterpAtBoot` now sets pose pairs too (`game-world-player-anchor.ts`) |
| (step 1) vehicles near spawn without ground | ring around player did not cover all bodies | physics worker builds tiles under every body (§4) |
| minimap black | only read loaded grids | reads generator |
| character falls through terrain after free fall (not with parachute) | hard landing → ragdoll from two small spheres (~0.15 m) starts at impact speed (~−31 m/s) → tunnels through heightfield in Rapier, even with CCD and coarse grid (reproduced in isolation) | **open** – ragdoll entry (`game-physics-worker-character-ragdoll-chain.ts`): cap start velocity and/or spawn just above ground |
| “chunk” meant two things | water/streaming/origin still need 8 km, physics 64 m | macro chunk split (§4) |
| headless test black | SwiftShader WebGPU fails on `createBuffer` limits (also without this change) | visual check with `WebGPURenderer({ forceWebGL: true })`, same TSL materials |

## 7. Step 2: apokalypto features as layers
The old height chain (`game-terrain-height/…`) is **no longer applied** but still in code because
biome masks for oasis and dystopia import it. Source for rebuild: apokalypto commit `6f56bc60`
(before migration; includes deleted `game-terrain-height-waterways.ts`).

Pattern per feature (see [INTEGRATION_TERRAIN.md §2 variant A](INTEGRATION_TERRAIN.md)): layer file in
`game-terrain-gen/layers/`, type in `game-terrain-gen-types.ts` + `layers/game-terrain-gen-layer-index.ts`,
entry in preset, masks in `ctx.masks` for later layers and biome coloring. Rules:
only `+ − × ÷`, `floor`, `sqrt`, bit ops; respect `ctx.minWavelength` (band limiting); own seed per layer.

| Old (apokalypto) | New layer | Notes |
|---|---|---|
| `…-height-dunes.ts`, `…-sand-ripples.ts`, `…-feature-template.ts` | `dunes` (+ ripples as fine octaves) | mask from desert macro (`gameTerrainBiomeMacro01`) instead of own height dependency; ripples < 2 m wavelength drop at LOD 0 via band limit → physics/near only |
| `…-valleys.ts` | `valleys` | after `mountains`, reads `ctx.masks.mountain` |
| `…-middle-mountains.ts` | option on `mountains` layer or separate `hills` | suspension plans `regions` (hilly) |
| `…-obstacles.ts`, `…-micro-spikes.ts` | `obstacles` | small scale → physics/LOD 0 only |
| `…-oasis.ts` | `oasis` | sets `ctx.masks.oasis`; biome mask then from layer instead of old height chain |
| `…-waterways.ts` (deleted) | `waterways` | cuts below y = 0? → check water planes |
| `…-dystopia.ts` | `dystopia` | like oasis: mask from layer |
| `GAME_TERRAIN_SURFACE_Y_M` (10 m) | – | omitted once oasis/dystopia migrated |

Afterward: delete old height chain + `GAME_TERRAIN_SURFACE_Y_M`, golden-value test like `tests/generateHeights.test.ts`
in apokalypto (no Vitest there yet – smoke script in `_Scripts/` as alternative).

## 8. Open
- **Reversed Z / 32 km view distance**: apokalypto camera far = 20 km with standard depth. For 32 km like suspension:
  `reversedDepthBuffer: true` on renderer, then check post-processing/shaders that read depth (water, `game-scene-resolved-depth`).
- **Ragdoll tunnels** through heightfield (§6).
- **Floating origin**: physics worker uses scene = absolute (origin never set in worker). While
  `CELL_STREAMING_FLOAT_ORIGIN_GATE` is off, that matches; when enabled worker needs origin (anyway required for `ORIGIN_SHIFT`).
- `_Scripts/terrain-boot-hill-spawn-smoke-check.ts` was deleted (was already broken, tested old chunk ring).
- `vehicle-manifest-stream-in-placement-gate-smoke-check.ts` fails – independent of terrain (also on `lokal-arbeit` alone).
- Measure performance in real browser (boot fill headless/SwiftShader: LOD 3–8 s CPU, in browser with GPU expected much less).

## 9. Numbers (headless, SwiftShader, CPU only)
| Measurement | Value |
|---|---|
| LOD initial fill at spawn (3 tile workers) | 162 visible / 216 built tiles, 4.3 … 7.6 s |
| LOD in mountains | 149 visible tiles, 5.4 s |
| physics tile (64 m, 16 641 heights) | 10 ms (plain) … 20 ms (mountains) |
| physics tiles at spawn (7 dynamic bodies) | 21 |
| height at spawn (794, 74) | ~287 m |