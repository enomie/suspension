import type { CornerTelemetry, VehicleSpec } from '../vehicle/types';

export interface TelemetrySource {
  spec: VehicleSpec;
  forwardSpeed: number;
  corners: { id: string; telemetry: CornerTelemetry }[];
  /** absolute Chassis-Position */
  absPos: { x: number; z: number };
}

/** HUD: Geschwindigkeit + pro Corner Federweg, Federkraft, Raddrehzahl, Lenkwinkel. */
export class TelemetryHud {
  private el: HTMLPreElement;
  private acc = 0;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('pre');
    this.el.id = 'telemetry';
    parent.appendChild(this.el);
  }

  update(
    v: TelemetrySource,
    dt: number,
    fps: number,
    terrain?: { visible: number; cached: number; queue: number },
    origin?: { x: number; z: number },
    physics?: { mode: string; stepMs: number; delayMs: number },
  ): void {
    this.acc += dt;
    if (this.acc < 0.1) return;
    this.acc = 0;
    const lines = [
      `${v.spec.label ?? v.spec.name}  ${(v.forwardSpeed * 3.6).toFixed(0).padStart(4)} km/h   ${fps.toFixed(0)} fps`,
      `corner   travel[mm]  F[kN]  ω[rad/s]  steer[°]`,
    ];
    for (const c of v.corners) {
      const t = c.telemetry;
      lines.push(
        `${c.id.split('.')[1].padEnd(7)}${(t.travel * 1000).toFixed(0).padStart(9)}${(t.springForce / 1000)
          .toFixed(1)
          .padStart(9)}${t.wheelOmega.toFixed(1).padStart(10)}${((t.steerAngle * 180) / Math.PI)
          .toFixed(1)
          .padStart(10)}`,
      );
    }
    if (terrain && origin) {
      lines.push(
        '',
        `pos abs  x ${v.absPos.x.toFixed(0)}  z ${v.absPos.z.toFixed(0)}   origin ${origin.x}, ${origin.z}`,
        `terrain  ${terrain.visible} Kacheln sichtbar · ${terrain.cached} im Cache · ${terrain.queue} in Warteschlange`,
      );
    }
    if (physics)
      lines.push(
        `physik   ${physics.mode === 'worker' ? 'Worker' : 'Haupt-Thread'} · ${physics.stepMs.toFixed(2)} ms/Schritt · Interp.-Verzögerung ${physics.delayMs.toFixed(1)} ms`,
      );
    lines.push('', '1–0 Aufhängung · W/S Gas/Bremse · A/D Lenken · Space Handbremse · R Reset');
    this.el.textContent = lines.join('\n');
  }
}
