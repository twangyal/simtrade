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
