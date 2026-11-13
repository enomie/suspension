import type { Vehicle } from '../vehicle/Vehicle';

/** HUD: Geschwindigkeit + pro Corner Federweg, Federkraft, Raddrehzahl, Lenkwinkel. */
export class TelemetryHud {
  private el: HTMLPreElement;
  private acc = 0;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('pre');
    this.el.id = 'telemetry';
    parent.appendChild(this.el);
  }

  update(v: Vehicle, dt: number, fps: number): void {
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
    lines.push('', '1–0 Aufhängung · W/S Gas/Bremse · A/D Lenken · Space Handbremse · R Reset');
    this.el.textContent = lines.join('\n');
  }
}
