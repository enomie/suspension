# Terrain-Technik in ein anderes Projekt übernehmen

Ziel: ein bestehendes Spiel mit festen Chunks (z. B. 9 Stück) und eigenen Biomen auf **unendliches Terrain** umstellen –
mit LOD bis 32 km in einem Draw Call, exakt passender Physik in der Nähe und Floating Origin.

## 1. Die vier Bausteine
| Baustein | Dateien | Aufgabe | Ersetzt im Zielprojekt |
|---|---|---|---|
| **Höhenfunktion** | `shared/terrain/` | `height(x, z)` deterministisch aus Seed + Konfiguration | die Höhen-/Biom-Erzeugung der Chunks |
| **LOD-Optik** | `render/terrain/`, `shared/tileGeometry.ts`, `shared/config.ts` | Quadtree-Kacheln 32 m … 32 km, 1 BatchedMesh, Geomorphing, Kachel-Worker | die 9 Chunk-Meshes |
| **Physik-Boden** | `physics/terrainColliders.ts` | 3×3 Rapier-Heightfields à 64 m um das Fahrzeug, gestreamt | Chunk-Collider |
| **Floating Origin** | `shared/origin.ts`, `shared/originShifter.ts` | Weltkoordinaten bleiben klein (Shift ab 1024 m im 64-m-Raster) | – (neu, nötig ab einigen km) |

Alles hängt nur an **einer** Funktion: der Höhe an einer absoluten Position. Optik (jede LOD-Stufe) und Physik tasten
sie an denselben Punkten ab → in der Nähe stimmen Bild und Collider auf < 1 mm überein.

## 2. Wichtigste Entscheidung: woher kommen die Höhen?
### Variante A (empfohlen): Biome des Zielprojekts als Schichten
Das Zielprojekt hat bereits Biome. Diese werden zu **Schichten** in `shared/terrain/layers/`:
1. Pro Biom-Regel eine Schicht-Datei (Muster: `layers/mountains.ts`): `apply(ctx)` addiert Höhe und setzt Masken.
2. Biom-Auswahl als eigene Schicht (z. B. `biomes.ts`), die Masken `ctx.masks.<biom> = 0…1` setzt –
   weich überblendet, sonst entstehen Stufen an Biom-Grenzen.
3. Schicht-Typ in `layers/index.ts` und `types.ts` eintragen, Preset in `presets.ts`.
4. Golden-Value-Test anlegen (`tests/generateHeights.test.ts` als Vorlage).

### Variante B: vorhandene Höhenfunktion übernehmen
Wenn das Zielprojekt schon `height(x, z)` hat: als **eine** Schicht verpacken (`layers/external.ts`, `apply(ctx) { ctx.height += theirHeight(ctx.x, ctx.z) }`).
Voraussetzungen (sonst Risse/Flackern/Abweichung Physik ↔ Optik):
- **rein und deterministisch**: keine Zufallszahlen ohne Seed, kein Zustand, keine Abhängigkeit von geladenen Chunks
- **unendlich**: liefert für jede Koordinate einen Wert (nicht nur innerhalb der 9 Chunks)
- **in Workern lauffähig**: kein DOM, kein three.js-Szenenzugriff (die Funktion läuft im Physik- und in den Kachel-Workern)
- **bitgleiche Mathe**: nur `+ − × ÷`, `floor`, `sqrt`, `Math.imul`/Bit-Ops. `Math.pow/sin/cos/exp` können je Browser
  minimal abweichen → für Physik meist egal, für exakte Golden-Tests nicht.

## 3. Konventionen, die im Zielprojekt passen müssen
| Thema | Hier | Prüfen im Zielprojekt |
|---|---|---|
| Achsen | Y oben, Höhe = y; Sea Level y = 0 | gleiche Höhenreferenz wie das Meer-Projekt |
| Einheit | 1 = 1 m | – |
| Raster | Zelle 0,5 m (LOD 0 = Physik), Render-Kachel 32 m, Physik-Kachel 64 m, Wurzel 32 768 m | Objekt-Platzierung (Bäume …) am besten an 64-m-Kacheln koppeln |
| Dreiecks-Diagonale | (x1,z0)–(x0,z1) wie Rapier-Heightfield | eigene Meshes, die exakt auf dem Boden liegen müssen |
| Koordinaten | Szene + Physik **lokal**, absolut = lokal + `ORIGIN` | alles mit Weltposition muss beim Shift mitverschoben werden (`origin.on(...)`) |
| Tiefe | Reversed-Z (`reversedDepthBuffer: true`), near 0,3 m, far 36 km | Post-Processing/Shader, die Tiefe lesen |

## 4. Einbau Schritt für Schritt
1. **Generator** kopieren (`shared/terrain/`, `shared/config.ts`, `shared/terrainHeight.ts`, `shared/tileGeometry.ts`),
   Höhenquelle nach Variante A oder B einhängen. Test: Golden Values + Wertebereich.
2. **Aktives Terrain je Thread**: im Haupt-Thread `setTerrain(config)` **vor** allem anderen; dieselbe `config` an jeden
   Worker schicken (Physik-Worker: Init-Nachricht; Kachel-Worker: macht `LodTerrain` selbst).
3. **Optik**: `render/terrain/` kopieren. `const lod = new LodTerrain(); scene.add(lod.root);`
   Pro Frame **nach** dem Kamera-Update: `lod.update(camera.position.x, camera.position.y, camera.position.z)`.
   Die 9 Chunk-Meshes entfernen.
4. **Physik**: `physics/terrainColliders.ts` – `new PhysicsTiles(R, world)`, pro Physik-Schritt
   `tiles.update(fahrzeug.x, fahrzeug.z, 2500)` (Kachel unter dem Fahrzeug sofort, Nachbarn stückweise).
   Mehrere Fahrzeuge/Objekte: je Fokus eine Instanz oder `update` für jeden Fokus erweitern.
5. **Floating Origin**: eine `OriginShifter`-Instanz je Thread. Physik: Listener verschiebt alle Rapier-Körper
   (siehe `physics/Simulation.ts`); Haupt-Thread: Kamera, `lod.onOriginShift()`, alle eigenen Objekte.
6. **Startpunkt**: `terrain().findLand(x, z)` – nächster ebener Landpunkt.
7. **Einfärbung nach Biom** (hier noch nicht umgesetzt): Biom-Gewichte in `buildTileArrays` als zusätzliches
   Vertex-Attribut schreiben (wie `morph`), im Material (`terrainMaterial()` in `LodTerrain.ts`) mischen.
   Neue Attribute müssen auch in `geometryFrom()` und im Kachel-Worker-Transfer ergänzt werden.

## 5. Stolpersteine (alle hier schon einmal aufgetreten)
| Symptom | Ursache | Lösung / Ort |
|---|---|---|
| Terrain flackert beim Fahren | Verfeinerung wartet auf den ganzen Teilbaum → Rückfall auf grobe Kachel | Ebene für Ebene verfeinern (`select()` in `LodTerrain.ts`) |
| Licht springt bei LOD-Wechsel | nur Höhe gemorpht | Höhe **und** Normale morphen (`morphNormal`) |
| Sprung trotz Morph | grobe Kacheln lassen feine Oktaven weg | Morph-Ziel aus der echten Elternstufe abtasten (`buildTileArrays`) |
| Kacheln pendeln an Grenzen | festes Fenster / Schwellen ohne Hysterese | Hysterese bei Teilung und Sichtweite |
| Risse an Steilhängen | Skirts zu flach | Skirt-Tiefe aus größtem Morph-Ausschlag |
| Physik-Worker hängt | ganze 64-m-Kachel in einem Schritt (~20 ms bei 1 µs/Punkt) | stückweise mit Budget |
| Schatten springt bei Shift | Texel-Raster in lokalen Koordinaten | in absoluten Koordinaten rastern (`SunRig`) |

## 6. Zahlen zum Abgleich
~120–160 sichtbare Kacheln, 1 Draw Call, ~1,3 Mio. Dreiecke; Höhenfunktion ~1 µs/Punkt (Welt-Preset);
Erstaufbau ~1,3 s Rechenzeit verteilt auf ≤ 4 Kachel-Worker; Physik 0,2–0,3 ms pro 120-Hz-Schritt.
