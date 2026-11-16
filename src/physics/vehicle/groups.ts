/** Collision-Groups: (membership << 16) | filter. */
/** terrain (heightfields) keeps Rapier default group; bit 0x0001 reserved for that. */
export const GROUP_TERRAIN = 0x0001;
export const GROUP_CHASSIS = 0x0002;
export const GROUP_WHEEL = 0x0004;
export const GROUP_ALL = 0xffff;

export function groups(membership: number, filter: number): number {
  return ((membership & 0xffff) << 16) | (filter & 0xffff);
}

/** chassis collides with everything except wheels (including others — simplified). */
export const CHASSIS_GROUPS = groups(GROUP_CHASSIS, GROUP_ALL & ~GROUP_WHEEL);
/** wheels collide with everything except chassis. */
export const WHEEL_GROUPS = groups(GROUP_WHEEL, GROUP_ALL & ~GROUP_CHASSIS);
