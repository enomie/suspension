/**
 * Parse a number typed by a person: "," and "." both work as the decimal separator, spaces are ignored.
 * Returns null for anything that is not a plain number (empty, text, "1.2.3").
 */
export function parseDecimal(text: string): number | null {
  const t = text.trim().replace(/\s+/g, '').replace(',', '.');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  return Number(t);
}

/** Keep a value inside [min, max] */
export function clampTo(v: number, [min, max]: readonly [number, number]): number {
  return Math.min(max, Math.max(min, v));
}

/** Show a value without floating-point noise (0.30000000000000004 → 0.3) */
export function formatNumber(v: number): string {
  return String(Number(v.toFixed(6)));
}

/**
 * Numeric text field. Accepts "," and "." as decimal separator, allows 0 and negative values wherever the range does,
 * clamps to the range on commit (blur or Enter), and puts the previous value back when the text is not a number.
 * ArrowUp/ArrowDown step by `step`.
 */
export interface NumberInput extends HTMLInputElement {
  setNumber(v: number): void;
}

export function numberInput(value: number, range: readonly [number, number], step: number, onChange: (v: number) => void): NumberInput {
  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'decimal';
  input.className = 'num';
  let current = clampTo(value, range);
  input.value = formatNumber(current);

  const commit = (next: number | null) => {
    if (next !== null) {
      current = clampTo(next, range);
      onChange(current);
    }
    input.value = formatNumber(current);
  };
  input.addEventListener('change', () => commit(parseDecimal(input.value)));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commit(parseDecimal(input.value));
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      commit((parseDecimal(input.value) ?? current) + (e.key === 'ArrowUp' ? step : -step));
    }
  });
  return Object.assign(input, {
    /** set from code (a preset is loaded): shows the value and makes it the one restored after bad input */
    setNumber(v: number) {
      current = clampTo(v, range);
      input.value = formatNumber(current);
    },
  });
}
