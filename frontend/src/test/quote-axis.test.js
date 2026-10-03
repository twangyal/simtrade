import { expect, it } from 'vitest';
import { quoteAxis, formatAxisPrice } from '../quoteAxis';

it('uses round reference levels around a narrow Bitcoin range without changing observations', () => {
  const axis = quoteAxis(60158.29, 60170.42);
  expect(axis.ticks).toEqual([60155, 60160, 60165, 60170, 60175]);
  expect(formatAxisPrice(axis.ticks[1], axis.step)).toBe('60,160');
});

it.each([[1.10125, 1.10139], [150.42, 150.51], [100, 100], [0.0000012, 0.0000013], [Number.MIN_VALUE, Number.MIN_VALUE], [999999.99, 1000000]])('contains observations %s to %s in a finite nonzero chart scale', (low, high) => {
  const axis = quoteAxis(low, high);
  expect(axis.low).toBeLessThanOrEqual(low);
  expect(axis.high).toBeGreaterThanOrEqual(high);
  expect(axis.high).toBeGreaterThan(axis.low);
  expect(axis.low).toBeGreaterThanOrEqual(0);
  expect(axis.ticks.every(Number.isFinite)).toBe(true);
  expect(axis.ticks.length).toBeLessThanOrEqual(9);
  const labels = axis.ticks.map((value) => formatAxisPrice(value, axis.step));
  expect(new Set(labels).size).toBe(axis.ticks.length);
});

it('keeps fractional reference levels distinct without binary floating point tails', () => {
  expect(formatAxisPrice(1.1025000000001, 0.000025)).toBe('1.102500');
  expect(formatAxisPrice(1.102525, 0.000025)).toBe('1.102525');
});

it.each([
  [Number.MIN_VALUE, 9 * Number.MIN_VALUE],
  [4.5e-308, 4.500000000000001e-308],
  [4.6e-308, 4.600000000000001e-308],
  [770 * Number.MIN_VALUE, 830 * Number.MIN_VALUE],
  [4.6e-282, 4.6000000000000005e-282],
  [4.5e-287, 4.5000000000000013e-287],
])('contains extreme observations %s to %s with distinct ticks and labels', (low, high) => {
  const axis = quoteAxis(low, high);
  expect(axis.low).toBeLessThanOrEqual(low);
  expect(axis.high).toBeGreaterThanOrEqual(high);
  expect(axis.low).toBeGreaterThanOrEqual(0);
  expect(axis.ticks.length).toBeLessThanOrEqual(9);
  expect(axis.ticks.every(Number.isFinite)).toBe(true);
  for (let index = 1; index < axis.ticks.length; index += 1) {
    expect(axis.ticks[index]).toBeGreaterThan(axis.ticks[index - 1]);
  }
  const labels = axis.ticks.map((value) => formatAxisPrice(value, axis.step));
  expect(new Set(labels).size).toBe(axis.ticks.length);
  // Values outside these bounds would draw above or below the chart plot.
  for (const price of [low, high]) {
    const position = (price - axis.low) / (axis.high - axis.low);
    expect(position).toBeGreaterThanOrEqual(0);
    expect(position).toBeLessThanOrEqual(1);
  }
});

it.each([
  [1.101250001, 1.101250002],
  [60000, 60000.00000001],
  [1e-8, 1.0001e-8],
  [1e-320, 1.001e-320],
])('keeps narrow-range axis labels distinct at %s to %s', (low, high) => {
  const axis = quoteAxis(low, high);
  const labels = axis.ticks.map((value) => formatAxisPrice(value, axis.step));
  expect(new Set(labels).size).toBe(axis.ticks.length);
  for (let index = 0; index < labels.length; index += 1) {
    const displayed = Number(labels[index].replaceAll(',', ''));
    expect(Number.isFinite(displayed)).toBe(true);
    expect(Math.abs(displayed - axis.ticks[index])).toBeLessThanOrEqual(axis.step / 2);
  }
});
