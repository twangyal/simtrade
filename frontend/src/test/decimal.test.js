import { expect, it } from 'vitest';
import { absoluteDecimal, addDecimal, decimalFromNumber, decimalToNumber, multiplyDecimal, roundDecimalMoney, subtractDecimal } from '../decimal';

it.each([null, undefined, true, '0.1', NaN, Infinity, -Infinity])('rejects a nonfinite or nonnumeric source %s', (value) => {
  expect(decimalFromNumber(value)).toBeNull();
});

it('supports signed decimal and scientific notation without binary intermediate arithmetic', () => {
  expect(decimalFromNumber(-12.34)).toEqual({ coefficient: -1234n, exponent: -2 });
  expect(decimalFromNumber(1e21)).toEqual({ coefficient: 1n, exponent: 21 });
  expect(decimalFromNumber(Number.MIN_VALUE)).toEqual({ coefficient: 5n, exponent: -324 });
  expect(decimalToNumber(multiplyDecimal(decimalFromNumber(0.3), decimalFromNumber(100.05)))).toBe(30.015);
  const difference = subtractDecimal(decimalFromNumber(100.05), decimalFromNumber(100));
  expect(roundDecimalMoney(multiplyDecimal(decimalFromNumber(0.3), difference))).toBe(0.02);
  expect(decimalToNumber(absoluteDecimal(decimalFromNumber(-0.1)))).toBe(0.1);
});

it.each([
  [1.0049, 1], [1.005, 1], [1.0051, 1.01], [1.015, 1.02], [1.025, 1.02],
  [-1.0049, -1], [-1.005, -1], [-1.0051, -1.01], [-1.015, -1.02], [-1.025, -1.02],
  [0.005, 0], [-0.005, 0], [-0, 0], [1e-308, 0], [Number.MIN_VALUE, 0],
])('rounds %s to %s with symmetric half-even cents', (value, expected) => {
  expect(roundDecimalMoney(decimalFromNumber(value))).toBe(expected);
});

it('rounds before Number conversion even at supported trillion-dollar totals', () => {
  const base = decimalFromNumber(8000000000000);
  for (const [fraction, expected] of [[0.0049, 8000000000000], [0.005, 8000000000000], [0.0051, 8000000000000.01]]) {
    const value = addDecimal(base, decimalFromNumber(fraction));
    expect(roundDecimalMoney(value)).toBe(expected);
    expect(roundDecimalMoney(subtractDecimal(decimalFromNumber(0), value))).toBe(-expected);
  }
});

it('preserves an unavailable value and rejects money too large for reliable numeric cents', () => {
  expect(roundDecimalMoney(null)).toBeNull();
  expect(roundDecimalMoney(decimalFromNumber(1e20))).toBeNull();
});

it('rejects safe-integer cents when the dollar Number would lose a cent', () => {
  // The previous integer-only guard allowed this amount and displayed .90, not .91.
  expect(roundDecimalMoney({ coefficient: 9007199254740991n, exponent: -2 })).toBeNull();
  expect(roundDecimalMoney({ coefficient: -9007199254740991n, exponent: -2 })).toBeNull();
});

it('rejects the dollar-spacing boundary, including a value that rounds up to it', () => {
  const limitCents = 100n * (2n ** 46n);
  for (const sign of [1n, -1n]) {
    expect(roundDecimalMoney({ coefficient: sign * limitCents, exponent: -2 })).toBeNull();
    expect(roundDecimalMoney({ coefficient: sign * (limitCents + 1n), exponent: -2 })).toBeNull();
    expect(roundDecimalMoney({ coefficient: sign * (limitCents * 10n - 5n), exponent: -3 })).toBeNull();
  }
});

it('retains the final supported cent immediately below the conversion boundary', () => {
  const cents = 100n * (2n ** 46n) - 1n;
  const format = (value) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  expect(format(roundDecimalMoney({ coefficient: cents, exponent: -2 }))).toBe('$70,368,744,177,663.99');
  expect(format(roundDecimalMoney({ coefficient: -cents, exponent: -2 }))).toBe('-$70,368,744,177,663.99');
});
