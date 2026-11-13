# Terrain – unendlich, LOD, Floating Origin

| Datei | Zuständig |
|---|---|
| `src/terrain/generateHeights.ts` | `sampleTerrainHeightWorld(xAbs, zAbs)` – deterministische Höhe (fbm), **absolute** Koordinaten |
| `src/terrain/terrainConfig.ts` | Raster 0,78125 m, 64 Segmente/Kachel, `MAX_LOD`, `LOD_SPLIT`, `VIEW_DISTANCE`, Physik-Radius |
| `src/terrain/lodTerrain.ts` | Optik: Quadtree-Auswahl (LOD 0 = 50 m … LOD 8 = 12,8 km), Worker-Pool (≤ 4), Cache; ohne Worker synchron mit 3 ms Budget |
| `src/terrain/tileGeometry.ts` | reine Kachel-Berechnung (Höhen, Normalen, Skirts, Indexpuffer) – ohne three.js, läuft im Worker |
| `src/terrain/terrainWorker.ts` | Worker: rechnet Kachel, gibt Puffer per Transfer (ohne Kopie) zurück |
| `src/terrain/physicsTiles.ts` | Physik: (2r+1)² Rapier-Heightfields (50 m) um das Fahrzeug, gestreamt |
| `src/world/origin.ts` | `ORIGIN` – absolut = lokal + ORIGIN; Shift ab 1 km im 50-m-Raster |
| `src/world/originShift.ts` | `OriginShifter`: verschiebt ORIGIN + alle Rapier-Körper, benachrichtigt Teilnehmer (`on(fn)`) |

## Regeln
- Kompletter Erstaufbau mit 4 Workern ≈ 0,6 s; Main-Thread ≤ ~2 ms/Frame für Auswahl + Mesh-Erzeugung.
- **Optik = Physik in der Nähe:** LOD 0 nutzt exakt das Physik-Raster und dieselbe Dreiecks-Diagonale wie Rapier
  ((x1,z0)–(x0,z1)), Abweichung < 1 mm (`tests/infiniteTerrain.test.ts`).
- Rapier-Heightfield: Spalten = X, Zeilen = Z, column-major, Collider zentriert auf den Körper.
- **Origin-Shift** (`OriginShifter`): alle Rapier-Körper werden verschoben (Joints sind relativ → bleiben gültig);
  Teilnehmer melden sich mit `origin.on(...)` an: Render-Interpolation, Kamera-Rig, Terrain. Neues mit Position → dort anmelden.
- Startposition per URL: `?x=2000000&z=-1350000`.
- ~100 Kacheln aktiv (16 LOD 0 + 12 je Stufe), Frustum-Culling reduziert die Draw Calls weiter.

## Nächste Ausbaustufen
- Großräumige Variation (Berge/Ebenen) über zusätzliche niederfrequente Noise-Ebene.
