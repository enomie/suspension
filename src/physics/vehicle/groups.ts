/** Collision-Groups: (membership << 16) | filter. */
/** Terrain (Heightfields) behält Rapiers Standard-Gruppe; Bit 0x0001 ist dafür reserviert. */
export const GROUP_TERRAIN = 0x0001;
export const GROUP_CHASSIS = 0x0002;
export const GROUP_WHEEL = 0x0004;
export const GROUP_ALL = 0xffff;

export function groups(membership: number, filter: number): number {
  return ((membership & 0xffff) << 16) | (filter & 0xffff);
}

/** Chassis kollidiert mit allem außer Rädern (auch fremden – vereinfachend). */
export const CHASSIS_GROUPS = groups(GROUP_CHASSIS, GROUP_ALL & ~GROUP_WHEEL);
/** Räder kollidieren mit allem außer Chassis. */
export const WHEEL_GROUPS = groups(GROUP_WHEEL, GROUP_ALL & ~GROUP_CHASSIS);
