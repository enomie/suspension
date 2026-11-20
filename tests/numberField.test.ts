import { describe, expect, it } from 'vitest';
import { clampTo, formatNumber, parseDecimal } from '../src/app/numberField';
import { CUSTOM_LIMITS } from '../src/shared/customVehicle';

describe('parseDecimal', () => {
  it('accepts dot and comma as the decimal separator', () => {
    expect(parseDecimal('0.25')).toBe(0.25);
    expect(parseDecimal('0,25')).toBe(0.25);
    expect(parseDecimal(' 1,5 ')).toBe(1.5);
    expect(parseDecimal('.5')).toBe(0.5);
    expect(parseDecimal('3.')).toBe(3);
    expect(parseDecimal('-0,3')).toBe(-0.3);
  });
  it('accepts zero', () => {
    expect(parseDecimal('0')).toBe(0);
    expect(parseDecimal('0,0')).toBe(0);
    expect(parseDecimal('-0')).toBe(-0);
  });
  it('rejects everything that is not a plain number', () => {
    for (const bad of ['', ' ', 'abc', '1.2.3', '1,2,3', '--1', '1e3', '0x10', ',']) expect(parseDecimal(bad)).toBeNull();
  });
});

describe('ranges that include 0', () => {
  it('keep 0 instead of snapping to the minimum', () => {
    for (const r of [CUSTOM_LIMITS.comOffset.x, CUSTOM_LIMITS.comOffset.y, CUSTOM_LIMITS.comOffset.z, CUSTOM_LIMITS.handbrakeTorque])
      expect(clampTo(0, r)).toBe(0);
  });
  it('still clamp values outside', () => {
    expect(clampTo(-9, CUSTOM_LIMITS.comOffset.x)).toBe(-0.5);
    expect(clampTo(99, CUSTOM_LIMITS.comOffset.x)).toBe(0.5);
  });
});

describe('formatNumber', () => {
  it('drops floating-point noise', () => {
    expect(formatNumber(0.1 + 0.2)).toBe('0.3');
    expect(formatNumber(1280)).toBe('1280');
    expect(formatNumber(-0.05)).toBe('-0.05');
  });
});
