# src – guide

This folder is **meant to be copied as-is**: code and docs live together. Anyone porting it into another project
(renamed or not) can use this as the map.

## Layout
| Folder | Runs in | Dependencies | Contents | Docs |
|---|---|---|---|---|
| `shared/` | everywhere | none | constants, floating origin, snapshot format, protocol, vehicle types | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| `shared/terrain/` | everywhere | none | **terrain generator** (deterministic, layers) | [docs/TERRAIN.md](docs/TERRAIN.md) |
| `physics/` | physics worker | Rapier | simulation, ground colliders, worker entry | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| `physics/vehicle/` | physics | Rapier, three.js math | **vehicle kit** (10 suspensions) | [docs/VEHICLE_KIT.md](docs/VEHICLE_KIT.md) |
| `render/terrain/` | main thread | three.js (WebGPU/TSL) | **LOD terrain** (1 draw call, geomorphing, tile workers) | [docs/TERRAIN.md](docs/TERRAIN.md) |
| `render/vehicle/` | main thread | three.js | vehicle visuals from data layout | [docs/VEHICLE_KIT.md](docs/VEHICLE_KIT.md) |
| `render/` (rest) | main thread | three.js | scene, camera rig, sun with shadows | – |
| `app/` | main thread | all of the above | this demo wiring: worker client, input, HUD, debug | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |

## Porting to another project
| Goal | Guide |
|---|---|
| Terrain (infinite, LOD, physics tiles, floating origin) | [docs/INTEGRATION_TERRAIN.md](docs/INTEGRATION_TERRAIN.md) |
| Terrain in **apokalypto** (status, file mapping, next steps) | [docs/INTEGRATION_APOKALYPTO.md](docs/INTEGRATION_APOKALYPTO.md) |
| Vehicle kit instead of raycast vehicle, asset-editor hookup | [docs/INTEGRATION_VEHICLE.md](docs/INTEGRATION_VEHICLE.md) |

Public entry points (import only these):
`shared/terrain/index.ts` · `physics/vehicle/index.ts` · `render/vehicle/index.ts` · `render/terrain/index.ts`

## Reference
| Doc | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layers, threads, frame flow, snapshots, debug keys, past root causes |
| [docs/TERRAIN.md](docs/TERRAIN.md) | Grid, generator, layers, LOD, geomorphing, numbers |
| [docs/VEHICLE_KIT.md](docs/VEHICLE_KIT.md) | Concepts, naming, parts, joints, Rapier rules |
| [docs/VEHICLE_PLAN.md](docs/VEHICLE_PLAN.md) | Decisions, shipped and open phases |

Versions everything is aligned to: `three@0.187` (WebGPURenderer, TSL), `@dimforge/rapier3d-simd-compat@0.21`,
Vite 8 (workers via `new Worker(new URL('./x.ts', import.meta.url), { type: 'module' })`). Tests: Vitest (`tests/`, outside `src`).