import { expect, it } from 'vitest';
import { formatUnitPrice } from '../unitPrice';

it.each([
  [0, '$0.00'], [100, '$100.00'], [1000.5, '$1,000.50'], [1000000, '$1,000,000.00'],
  [1.10011, '$1.10011'], [1.105270001, '$1.105270001'], [1.105270002, '$1.105270002'],
  [1.1001100000000001, '$1.1001100000000001'], [0.000001, '$0.000001'],
  [1e-20, '$0.00000000000000000001'], [1e-25, '$1e-25'],
  [1.0000000000000002e-6, '$1.0000000000000002e-6'], [Number.MIN_VALUE, '$5e-324'],
  [-1.10011, '-$1.10011'], [-1e-25, '-$1e-25'],
])('preserves the unit-price digits for %s', (value, expected) => {
  expect(formatUnitPrice(value)).toBe(expected);
});

it.each([
  null, undefined, true, false, '', '1.10011', NaN, Infinity, -Infinity, [], {},
].map((value) => [value]))('does not invent a price for nonnumeric or unavailable data %j', (value) => {
  expect(formatUnitPrice(value)).toBe('N/A');
});

it.each([
  Number.MIN_VALUE, 1e-308, 9.999999999999998e-8, 0.0000010000000000000002,
  0.30000000000000004, 1.0000000000000002, 100.00000000000001,
  999999.9999999999, 1000000, -0,
])('round-trips the API Number without hiding a nonzero price: %s', (value) => {
  const label = formatUnitPrice(value);
  expect(Number(label.replace(/[$,]/g, ''))).toBe(value);
});
