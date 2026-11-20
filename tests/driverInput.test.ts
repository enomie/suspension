import { describe, expect, it } from 'vitest';
import { neutralInput } from '../src/shared/driverInput';

describe('neutralInput', () => {
  it('has everything released', () => {
    expect(neutralInput()).toEqual({ throttle: 0, brake: 0, steer: 0, handbrake: false });
  });

  it('returns a fresh object every call (no shared mutable state)', () => {
    const a = neutralInput();
    a.throttle = 1;
    expect(neutralInput().throttle).toBe(0);
  });
});
