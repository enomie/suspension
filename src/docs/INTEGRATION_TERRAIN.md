# Adopting terrain tech in another project

Goal: convert an existing game with fixed chunks (e.g. 9 pieces) and custom biomes to **infinite terrain** –
with LOD to 32 km in one draw call, matching physics up close, and floating origin.

## 1. The four building blocks
| Block | Files | Job | Replaces in target project |
|---|---|---|---|
| **Height function** | `shared/terrain/` | `height(x, z)` deterministic from seed + config | chunk height/biome generation |
| **LOD visuals** | `render/terrain/`, `shared/tileGeometry.ts`, `shared/config.ts` | quadtree tiles 32 m … 32 km, 1 BatchedMesh, geomorphing, tile worker | the 9 chunk meshes |
| **Physics ground** | `physics/terrainColliders.ts` | 3×3 Rapier heightfields at 64 m around vehicle, streamed | chunk colliders |
| **Floating origin** | `shared/origin.ts`, `shared/originShifter.ts` | world coordinates stay small (shift from 1024 m on 64 m grid) | – (new, needed past a few km) |

Everything hangs on **one** function: height at an absolute position. Visuals (each LOD level) and physics sample
the same points → up close, image and collider agree within < 1 mm.

## 2. Key decision: where do heights come from?
### Variant A (recommended): target project biomes as layers
The target project already has biomes. Convert them to **layers** in `shared/terrain/layers/`:
1. One layer file per biome rule (pattern: `layers/mountains.ts`): `apply(ctx)` adds height and sets masks.
2. Biome selection as its own layer (e.g. `biomes.ts`) setting masks `ctx.masks.<biome> = 0…1` –
   blended softly, else steps at biome borders.
3. Register layer type in `layers/index.ts` and `types.ts`, preset in `presets.ts`.
4. Add golden-value test (`tests/generateHeights.test.ts` as template).

### Variant B: adopt existing height function
If the target already has `height(x, z)`: wrap as **one** layer (`layers/external.ts`, `apply(ctx) { ctx.height += theirHeight(ctx.x, ctx.z) }`).
Requirements (else cracks/flicker/physics ↔ visual mismatch):
- **pure and deterministic**: no RNG without seed, no state, no dependency on loaded chunks
- **infinite**: value for every coordinate (not only inside 9 chunks)
- **worker-safe**: no DOM, no three.js scene access (runs in physics and tile workers)
- **bit-identical math**: only `+ − × ÷`, `floor`, `sqrt`, `Math.imul`/bit ops. `Math.pow/sin/cos/exp` can differ slightly per browser
  → usually OK for physics, not for exact golden tests.

## 3. Conventions the target project must match
| Topic | Here | Check in target |
|---|---|---|
| Axes | Y up, height = y; sea level y = 0 | same height reference as ocean project |
| Unit | 1 = 1 m | – |
| Grid | cell 0.5 m (LOD 0 = physics), render tile 32 m, physics tile 64 m, root 32 768 m | object placement (trees …) best tied to 64 m tiles |
| Triangle diagonal | (x1,z0)–(x0,z1) as Rapier heightfield | own meshes that must sit exactly on ground |
| Coordinates | scene + physics **local**, absolute = local + `ORIGIN` | anything with world position must shift with origin (`origin.on(...)`) |
| Depth | reversed Z (`reversedDepthBuffer: true`), near 0.3 m, far 36 km | post-processing/shaders that read depth |

## 4. Integration step by step
1. **Copy generator** (`shared/terrain/`, `shared/config.ts`, `shared/terrainHeight.ts`, `shared/tileGeometry.ts`),
   plug height source per variant A or B. Test: golden values + value range.
2. **Active terrain per thread**: on main thread `setTerrain(config)` **before** everything else; send same `config` to each
   worker (physics worker: init message; tile worker: `LodTerrain` does it).
3. **Visuals**: copy `render/terrain/`. `const lod = new LodTerrain(); scene.add(lod.root);`
   Each frame **after** camera update: `lod.update(camera.position.x, camera.position.y, camera.position.z)`.
   Remove the 9 chunk meshes.
4. **Physics**: `physics/terrainColliders.ts` – `new PhysicsTiles(R, world)`, per physics step
   `tiles.update(vehicle.x, vehicle.z, 2500)` (tile under vehicle immediately, neighbors incrementally).
   Multiple vehicles/objects: one instance per focus or extend `update` for each focus.
5. **Floating origin**: one `OriginShifter` instance per thread. Physics: listener moves all Rapier bodies
   (see `physics/Simulation.ts`); main thread: camera, `lod.onOriginShift()`, all own objects.
6. **Start point**: `terrain().findLand(x, z)` – nearest flat land point.
7. **Biome coloring** (not implemented here yet): write biome weights in `buildTileArrays` as extra
   vertex attribute (like `morph`), blend in material (`terrainMaterial()` in `LodTerrain.ts`).
   New attributes must also be added in `geometryFrom()` and tile worker transfer.

## 5. Pitfalls (all seen here before)
| Symptom | Cause | Fix / location |
|---|---|---|
| terrain flicker while driving | refinement waits for whole subtree → fallback to coarse tile | refine level by level (`select()` in `LodTerrain.ts`) |
| light jumps on LOD change | only height morphed | morph height **and** normal (`morphNormal`) |
| jump despite morph | coarse tiles omit fine octaves | sample morph target from real parent level (`buildTileArrays`) |
| tiles oscillate at boundaries | fixed window / thresholds without hysteresis | hysteresis on split and view distance |
| cracks on steep slopes | skirts too shallow | skirt depth from largest morph excursion |
| physics worker hitch | whole 64 m tile in one step (~20 ms at 1 µs/point) | incremental with budget |
| shadows jump on shift | texel grid in local coordinates | rasterize in absolute coordinates (`SunRig`) |

## 6. Numbers for comparison
~120–160 visible tiles, 1 draw call, ~1.3M triangles; height function ~1 µs/point (world preset);
initial build ~1.3 s compute spread across ≤ 4 tile workers; physics 0.2–0.3 ms per 120 Hz step.