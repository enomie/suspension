import { describe, expect, it } from 'vitest';
import { neutralInput, type DriverInput } from '../src/shared/driverInput';
import { HANDBRAKE_FACTOR, IDLE_HOLD_SHARE, trackCommand, type TrackDriveParams } from '../src/shared/trackDrive';

const P: TrackDriveParams = { reverseSpeed: 5, slipSpeed: 2.5, turnSpeed: 2 };
const input = (o: Partial<DriverInput>): DriverInput => ({ ...neutralInput(), ...o });

describe('trackCommand', () => {
  it('throttle drives both tracks forward at the same speed', () => {
    const l = trackCommand('L', input({ throttle: 1 }), 0, P);
    const r = trackCommand('R', input({ throttle: 1 }), 0, P);
    expect(l).toEqual(r);
    expect(l.mode).toBe('drive');
    expect(l.speed).toBeCloseTo(2.5, 9);
    expect(l.amount).toBe(1);
  });

  it('the motor target stays slip speed above the vehicle speed', () => {
    expect(trackCommand('L', input({ throttle: 0.5 }), 8, P).speed).toBeCloseTo(10.5, 9);
    expect(trackCommand('L', input({ throttle: 0.5 }), 8, P).amount).toBe(0.5);
  });

  it('steer +1 (left) slows the left track and speeds up the right one, around the vehicle speed', () => {
    const l = trackCommand('L', input({ throttle: 1, steer: 1 }), 4, P);
    const r = trackCommand('R', input({ throttle: 1, steer: 1 }), 4, P);
    expect(l.speed).toBeCloseTo(4 - 2, 9);
    expect(r.speed).toBeCloseTo(4 + 2, 9);
  });

  it('half steer keeps half of the slip allowance', () => {
    const l = trackCommand('L', input({ throttle: 1, steer: 0.5 }), 4, P);
    const r = trackCommand('R', input({ throttle: 1, steer: 0.5 }), 4, P);
    expect(l.speed).toBeCloseTo(4 + 1.25 - 1, 9);
    expect(r.speed).toBeCloseTo(4 + 1.25 + 1, 9);
  });

  it('steer −1 (right) is the mirror image', () => {
    const left = trackCommand('L', input({ throttle: 1, steer: 1 }), 3, P);
    const right = trackCommand('R', input({ throttle: 1, steer: -1 }), 3, P);
    expect(left.speed).toBeLessThan(trackCommand('R', input({ throttle: 1, steer: 1 }), 3, P).speed);
    expect(right.speed).toBeCloseTo(left.speed, 9);
  });

  it('without throttle the tracks run in opposite directions: turn on the spot', () => {
    const l = trackCommand('L', input({ steer: 1 }), 0, P);
    const r = trackCommand('R', input({ steer: 1 }), 0, P);
    expect(l).toMatchObject({ mode: 'drive', speed: -2, amount: 1 });
    expect(r).toMatchObject({ mode: 'drive', speed: 2, amount: 1 });
  });

  it('partial steer scales the turn', () => {
    expect(trackCommand('R', input({ steer: 0.5 }), 0, P)).toMatchObject({ speed: 1, amount: 0.5 });
  });

  it('brake at standstill reverses, both tracks backwards', () => {
    const l = trackCommand('L', input({ brake: 1 }), 0, P);
    expect(l).toMatchObject({ mode: 'drive', speed: -2.5 });
    expect(trackCommand('R', input({ brake: 1 }), 0, P)).toEqual(l);
  });

  it('reverse speed is capped', () => {
    expect(trackCommand('L', input({ brake: 1 }), -10, P).speed).toBe(-5);
  });

  it('brake while moving forward brakes, as does throttle while moving backward', () => {
    expect(trackCommand('L', input({ brake: 0.7 }), 5, P)).toEqual({ mode: 'brake', speed: 0, amount: 0.7 });
    expect(trackCommand('R', input({ throttle: 0.4 }), -3, P)).toEqual({ mode: 'brake', speed: 0, amount: 0.4 });
  });

  it('no input holds the vehicle with the idle share of the brake', () => {
    expect(trackCommand('L', neutralInput(), 0, P)).toEqual({ mode: 'hold', speed: 0, amount: IDLE_HOLD_SHARE });
  });

  it('handbrake wins over everything', () => {
    expect(trackCommand('L', input({ throttle: 1, steer: 1, handbrake: true }), 3, P)).toEqual({ mode: 'park', speed: 0, amount: 1 });
    expect(HANDBRAKE_FACTOR).toBeGreaterThan(1);
  });

  it('steer outside −1…1 is clamped', () => {
    expect(trackCommand('R', input({ steer: 5 }), 0, P).speed).toBe(2);
  });
});
