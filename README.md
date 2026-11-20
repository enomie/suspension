# suspension

Joint-based vehicle kit (Rapier SIMD) on infinite, deterministic LOD terrain (WebGPU, three.js):
continents and seabed down to −1500 m, mountain ranges up to 3000 m.
Ten suspension layouts to cycle through, physics in a worker at 120 Hz, view distance 32 km.

```bash
npm install
```

```bash
npm run dev
```

Dev server on port 9897. Tests (Rapier headless):

```bash
npm test
```

## Controls
| Key | Function |
|---|---|
| W / S | Throttle / brake (reverse when stopped) |
| A / D | Steer |
| Space | Handbrake (rear) |
| R | Reset at current position |
| 1 … 0 | Suspension: sliding strut, double wishbone, MacPherson, trailing arm, semi-trailing arm, swing axle, solid axle, twist beam, multi-link, tandem bogie |
| Mouse | Orbit / zoom camera |
| F1 … F7 | Debug toggles (shadows, morph, interpolation, freeze LOD, wireframe, sun, shadow filter) |

URL parameters: `?x=…&z=…` spawn position (mountains: `?x=858000&z=897000`), `?terrain=world|hills`, `?seed=…`, `?worker=0` physics on main thread, `?dpr=1` lower resolution,
`?debug=shadows,morph,interp` enable toggles upfront.

## Documentation
Docs live **in `src/`** so they travel with the code when copied: [src/README.md](src/README.md) is the index.

| File | Contents |
|---|---|
| [src/docs/INTEGRATION_TERRAIN.md](src/docs/INTEGRATION_TERRAIN.md) | Porting terrain tech to another project |
| [src/docs/INTEGRATION_APOKALYPTO.md](src/docs/INTEGRATION_APOKALYPTO.md) | apokalypto integration: status, mapping, next steps |
| [src/docs/INTEGRATION_VEHICLE.md](src/docs/INTEGRATION_VEHICLE.md) | Vehicle kit vs raycast vehicle, asset-editor hookup |
| [src/docs/ARCHITECTURE.md](src/docs/ARCHITECTURE.md) | Layers, threads, frame flow, debug |
| [src/docs/TERRAIN.md](src/docs/TERRAIN.md) | Grid, generator, LOD, geomorphing |
| [src/docs/VEHICLE_KIT.md](src/docs/VEHICLE_KIT.md) | Concepts, parts, joints, Rapier rules |
| [src/docs/TRACKED_VEHICLE.md](src/docs/TRACKED_VEHICLE.md) | Tracked vehicle: decisions, files, driving, chain |
| [src/docs/VEHICLE_PLAN.md](src/docs/VEHICLE_PLAN.md) | Decisions, status |
| [src/docs/requirements.md](src/docs/requirements.md) | Custom vehicle profile: requirements and decisions |