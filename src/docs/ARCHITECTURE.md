# Architecture

Three threads, four layers. Folders strictly separate who may import what:

| Folder | Runs in | May import | Contents |
|---|---|---|---|
| `shared/` | everywhere | only `shared/` | Constants (`config`), floating origin (`origin`, `originShifter`), terrain height (`terrainHeight`), tile geometry (`tileGeometry`), tick (`stepClock`), messages (`protocol`), snapshot format (`snapshot`), vehicle types (`vehicleSpec`, `vehicleLayout`) |
| `physics/` | physics worker | `shared/`, Rapier | `worker.ts` (entry), `Simulation.ts`, `terrainColliders.ts`, `vehicle/` (build, suspensions, drivetrain, steering, presets, `layout.ts`) |
| `render/` | main thread | `shared/`, three.js | `scene.ts` (renderer/camera/light), `CameraRig`, `SunRig`, `terrain/` (LOD + tile worker), `vehicle/` (visuals from layout) |
| `app/` | main thread | everything except `physics/` (exception: dynamic fallback) | `PhysicsClient` (worker binding + interpolation), `keyboard`, `hud`, `debug` |

`main.ts` only wires things up.

**Public entry points** (for other projects, import only these): `shared/terrain/index.ts`,
`physics/vehicle/index.ts`, `render/vehicle/index.ts`, `render/terrain/index.ts`. Adoption:
[INTEGRATION_TERRAIN.md](INTEGRATION_TERRAIN.md), [INTEGRATION_VEHICLE.md](INTEGRATION_VEHICLE.md).

## Data flow
```
physics/worker ──'vehicle' {layout}──▶ app/PhysicsClient ──▶ render/vehicle/VehicleVisual (meshes from layout)
               ──'snapshots' [Float64Array]──▶ time interpolation ──▶ VehicleVisual.apply()
app/keyboard ──'input' / 'spawn'──▶ physics/worker
```
- **Layout** (`shared/vehicleLayout.ts`): pure data (spec, body indices, link points, mount plate points).
  The main thread no longer loads Rapier (except with `?worker=0`).
- **Snapshot** (`shared/snapshot.ts`): generation, timestamp, telemetry, absolute poses per body index.

## Main thread per frame (`main.ts`)
| # | Step | Module |
|---|---|---|
| 1 | Hotkeys (1–0 preset, R reset) → worker; send input only on change | `app/PhysicsClient.ts` |
| 2 | Interpolate snapshot at **`now − delay`** (two surrounding physics steps) | `app/PhysicsClient.ts`, `shared/snapshot.ts` |
| 3 | Set meshes (absolute poses − ORIGIN) | `render/vehicle/VehicleVisual.ts` |
| 4 | Floating-origin shift (main thread, independent of worker) | `shared/originShifter.ts` |
| 5 | Camera + sun follow | `render/CameraRig.ts`, `render/SunRig.ts` |
| 6 | LOD terrain (selection only on camera move / new tiles) | `render/terrain/LodTerrain.ts` |
| 7 | HUD + render (reversed Z) | `app/hud.ts` |

## Snapshots / interpolation
- Snapshot = `Float64Array` via transfer: generation, timestamp, telemetry, **absolute** poses of all bodies.
- The worker sends a **layout** (pure data) on spawn; `VehicleVisual` builds meshes from it. Body = index in snapshot.
- `delay` = largest gap to the newest snapshot in the last 0.5 s (+0.5 ms), rises immediately, decays smoothly:
  a newer snapshot is always available → never extrapolation. Render time is also monotonic (never runs backward).
- Generation changes on respawn/preset: snapshots from the old vehicle are discarded (no “stale frames”).
- HUD shows mode, ms per physics step, and current interpolation delay.

New terrain tiles (tile worker) and snapshots (physics worker) arrive between two frames and are applied in the
next frame. Physics worker: fixed 120 Hz wall-clock tick (`shared/stepClock.ts`), one snapshot per step.

## Instancing and TSL
- **TSL materials** live in `render/tsl/` (so far: `terrainMaterial.ts` with debug uniform `morphEnabled`). Put new node materials there, not inline in renderers.
- **Instancing pattern:** `render/vehicle/linkVisual.ts` – one `InstancedMesh` per (geometry, material), count precomputed from layout, matrix per frame via `setMatrixAt(i, Matrix4.compose(...))`, then `instanceMatrix.needsUpdate = true`.
- **Pitfalls:** set `frustumCulled = false` (bounding sphere is not updated); poses are render-local (absolute − `ORIGIN`, floating origin); `count` ≤ capacity; for per-instance color use `setColorAt` or in TSL `instancedBufferAttribute`/`storage()` + `instanceIndex`.

## Known causes of earlier flicker issues (do not reintroduce)
| Symptom | Cause | Safeguard |
|---|---|---|
| “invisible wall” | invisible chassis collider larger than frame, caught on triangle edges | `tests/invisibleWall.test.ts` |
| terrain flicker while driving | refinement required whole subtree → fallback to root tile | test “LOD while driving” |
| light jumps on LOD change | only height morphed, not normal | morph **height and normal** |
| tiles oscillate at boundaries | fixed 3×3 root window, view distance without hysteresis | test “camera jitter …” |

## Debug (narrowing down flicker)
| Key | Toggle | What it narrows down |
|---|---|---|
| F1 | shadows on/off | still flashing? → not the shadow |
| F2 | terrain geomorphing on/off | terrain flicker from morph? |
| F3 | vehicle interpolation on/off (off = always newest snapshot) | vehicle pop-in from interpolation? |
| F4 | freeze LOD selection | terrain flicker from tile swap? |
| F5 | terrain wireframe | make tile borders / skirts visible |
| F6 | freeze sun (does not follow vehicle) | shadow flashing from shadow camera follow? |
| F7 | cycle shadow filter (PCF → soft → VSM → hard) | shadow flashing from filter/bias? |

Disable in advance via URL: `?debug=shadows,morph,interp`. HUD counts frame outliers (> 2× mean).
More URL params: `?worker=0`, `?dpr=1`, `?x=…&z=…`.