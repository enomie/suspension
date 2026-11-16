/** design formulas for spring/damper. SI units. */
export const G = 9.81;

/** spring rate from natural frequency: k = m·(2πf)² [N/m] */
export function springRate(massKg: number, frequencyHz: number): number {
  const w = 2 * Math.PI * frequencyHz;
  return massKg * w * w;
}

/** damping from damping ratio: c = 2ζ·√(k·m) [N·s/m] */
export function dampingCoeff(stiffness: number, massKg: number, ratio: number): number {
  return 2 * ratio * Math.sqrt(stiffness * massKg);
}

/**
 * static load per axle (share of sprung mass).
 * 2 axles: lever law over COM; else even split (tandem/bogie averages).
 */
export function axleLoadShares(axleZ: number[], comZ: number): number[] {
  if (axleZ.length === 1) return [1];
  if (axleZ.length === 2) {
    const [a, b] = axleZ;
    const L = b - a;
    if (Math.abs(L) < 1e-6) return [0.5, 0.5];
    const shareA = (b - comZ) / L;
    return [shareA, 1 - shareA];
  }
  return axleZ.map(() => 1 / axleZ.length);
}
