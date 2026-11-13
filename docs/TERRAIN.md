# Terrain – unendlich, LOD, Floating Origin

| Datei | Zuständig |
|---|---|
| `src/terrain/generateHeights.ts` | `sampleTerrainHeightWorld(xAbs, zAbs)` – deterministische Höhe (fbm), **absolute** Koordinaten |
| `src/terrain/terrainConfig.ts` | Raster 0,78125 m, 64 Segmente/Kachel, `MAX_LOD`, `LOD_SPLIT`, `VIEW_DISTANCE`, Physik-Radius |
| `src/terrain/lodTerrain.ts` | Optik: Quadtree-Auswahl (LOD 0 = 50 m … LOD 10 = 51,2 km), Sichtweite 30 km, CDLOD-Geomorphing (TSL), Worker-Pool (≤ 4), Cache; ohne Worker synchron mit 3 ms Budget |
| `src/terrain/tileGeometry.ts` | reine Kachel-Berechnung (Höhen, Normalen, Morph-Delta zur gröberen Stufe, Skirts, Indexpuffer) – ohne three.js, läuft im Worker |
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
- ~140 Kacheln aktiv bis 30 km (LOD_SPLIT 0,9), ~1,2 Mio. Dreiecke, Frustum-Culling reduziert weiter. Terrain wirft keine Schatten.
- **Geomorphing (CDLOD):** jede Kachel trägt pro Vertex die Höhe der nächstgröberen Stufe (Attribut `morph`).
  Der Vertex-Shader blendet ab 0,65·R bis R = LOD_SPLIT·2·Kante (Abstand Vertex–Kamera) stufenlos dorthin.
  Beim Teilen sehen die Kinder exakt wie der Elternteil aus → kein Popping. Nahe (< ~58 m) volle Auflösung = Physik.
- Auswahl läuft nur, wenn sich die Kamera > 0,25 m bewegt hat oder Kacheln fertig wurden; Szenengraph nur bei Änderungen.

## Nächste Ausbaustufen
- Großräumige Variation (Berge/Ebenen) über zusätzliche niederfrequente Noise-Ebene.
