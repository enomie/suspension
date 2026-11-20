import { describe, expect, it } from 'vitest';
import { Keyboard } from '../src/app/keyboard';
import { DIFF_LOCK_LEVELS } from '../src/shared/vehicleSpec';

// the keyboard only needs these browser classes for its `instanceof` checks on the event target
Object.assign(globalThis, { HTMLInputElement: class {}, HTMLSelectElement: class {} });

function keyboard() {
  const handlers: Record<string, (e: unknown) => void> = {};
  const target = { addEventListener: (type: string, h: (e: unknown) => void) => (handlers[type] = h) } as unknown as Window;
  const kb = new Keyboard(target);
  const press = (code: string) => {
    handlers.keydown({ code, target: {}, preventDefault() {} });
    handlers.keyup({ code });
  };
  return { kb, press };
}

describe('diff lock key', () => {
  it('starts open and L cycles 25, 50, 75, 100 % and back to open', () => {
    const { kb, press } = keyboard();
    expect(kb.read().diffLock).toBe(0);
    const seen: number[] = [];
    for (let i = 0; i < DIFF_LOCK_LEVELS.length; i++) {
      press('KeyL');
      seen.push(kb.read().diffLock!);
    }
    expect(seen).toEqual([0.25, 0.5, 0.75, 1, 0]);
  });
  it('resets to open for a new vehicle', () => {
    const { kb, press } = keyboard();
    press('KeyL');
    press('KeyL');
    kb.resetDiffLock();
    expect(kb.read().diffLock).toBe(0);
  });
});
