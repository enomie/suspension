import type { Vec3, VehicleSpec, WheelSpec } from './vehicleSpec';

/**
 * Was die Optik über ein Fahrzeug wissen muss – reine Daten, vom Physik-Worker erzeugt
 * (`physics/vehicle/layout.ts`) und an den Haupt-Thread geschickt. Körper werden über ihren
 * Index im Snapshot adressiert (Reihenfolge = `poseBodies`).
 */
export interface BodyPoint {
  body: number;
  /** Punkt im Körper-System */
  local: Vec3;
}

export interface VehicleLayout {
  spec: VehicleSpec;
  /** Anzahl Körper im Snapshot */
  bodyCount: number;
  chassis: number;
  corners: {
    id: string;
    wheel: number;
    wheelSpec: WheelSpec;
    /** Körper, an dem der Achsschenkel sitzt (Knuckle oder Radträger) */
    knuckle: number;
  }[];
  links: { kind: 'rod' | 'beam' | 'spring' | 'damper'; a: BodyPoint; b: BodyPoint }[];
  /** Joint markers: spherical = ball, revolute = cylinder along `axis` (body-local) */
  joints: { kind: 'spherical' | 'revolute'; at: BodyPoint; axis: Vec3 }[];
  /** Anlenkpunkte am Chassis (Chassis-lokal) → Rahmen-Konsolen */
  mounts: Vec3[];
}
