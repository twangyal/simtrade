import { describe, expect, it } from 'vitest';
import { formatQuotePrice } from '../quoteFormat';

describe('received quote price formatting', () => {
  it.each([
    [0, '0.00'], [1, '1.00'], [1234.5, '1,234.50'], [1_000_000, '1,000,000.00'],
    [0.01234, '0.01234'], [1.234567, '1.23457'], [-1.234567, '-1.23457'],
    [0.000005, '0.00001'], [-0.000005, '-0.00001'],
  ])('preserves ordinary quote formatting for %s', (value, formatted) => {
    expect(formatQuotePrice(value)).toBe(formatted);
  });

  it('keeps distinct tiny received prices visible instead of displaying zero', () => {
    expect(formatQuotePrice(1.2e-6)).toBe('1.2e-6');
    expect(formatQuotePrice(1.3e-6)).toBe('1.3e-6');
  });

  it.each([4.999999e-6, 1e-8, Number.MIN_VALUE, -1.2e-6, -Number.MIN_VALUE])(
    'preserves a nonzero value and sign when five decimals would erase %s', (value) => {
      const formatted = formatQuotePrice(value);
      expect(formatted).toMatch(/e-/i);
      expect(Number(formatted)).toBe(value);
      expect(Number(formatted)).not.toBe(0);
    },
  );
});
