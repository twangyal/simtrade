import { expect, it } from 'vitest';
import { quoteTimeLabels } from '../quoteTimeAxis';

const labelsAt = (xs, times = xs.map((_, index) => (index + 1) * 1_000)) => quoteTimeLabels(
  times.map((time) => Object.freeze({ time, price: 100 })),
  xs.map((x) => ({ x, y: 100 })),
);

it('has no labels without observed points', () => {
  expect(quoteTimeLabels([], [])).toEqual([]);
});

it('centers a single actual receipt timestamp', () => {
  expect(labelsAt([200])).toMatchObject([{ time: 1_000, x: 200, anchor: 'middle' }]);
});

it('keeps separated endpoints instead of overlapping the early label after a gap', () => {
  const labels = labelsAt([14, 25.63, 712], [1_000, 2_000, 61_000]);
  expect(labels.map(({ time }) => time)).toEqual([1_000, 61_000]);
  expect(labels.map(({ anchor }) => anchor)).toEqual(['start', 'end']);
});

it('chooses a real middle tick by horizontal position instead of array index', () => {
  const labels = labelsAt([14, 20, 25, 350, 712]);
  expect(labels.map(({ time }) => time)).toEqual([1_000, 4_000, 5_000]);
});

it('shows only the latest timestamp when endpoint labels cannot fit', () => {
  expect(labelsAt([14, 40, 80])).toMatchObject([{ time: 3_000, x: 80, anchor: 'end' }]);
});

it('does not repeat the same displayed second for a burst of distinct observations', () => {
  const labels = labelsAt([14, 350, 712], [1_000, 1_100, 1_200]);
  expect(labels).toHaveLength(1);
  expect(labels[0].time).toBe(1_200);
});

it('selects at most three actual timestamps with room between their labels', () => {
  const labels = labelsAt([14, 150, 300, 450, 600, 712]);
  expect(labels.map(({ time }) => time)).toEqual([1_000, 3_000, 6_000]);
  expect(labels[1].x - labels[0].x).toBeGreaterThan(100);
  expect(labels[2].x - labels[1].x).toBeGreaterThan(100);
});
