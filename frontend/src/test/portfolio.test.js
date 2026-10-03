import { describe, expect, it } from 'vitest';
import { positionGain, portfolioGain } from '../portfolio';

describe('unrealized portfolio gains', () => {
  it.each([
    [10, 100, 120, 200],
    [10, 100, 80, -200],
    [-10, 100, 80, 200],
    [-10, 100, 120, -200],
    [0.5, 100, 110, 5],
  ])('values %s units with basis %s and mark %s', (quantity, avg_price, current_price, expected) => {
    expect(positionGain({ quantity, avg_price, current_price })).toBe(expected);
  });

  it('returns zero for unchanged long and short positions without negative zero', () => {
    expect(positionGain({ quantity: 10, avg_price: 100, current_price: 100 })).toBe(0);
    expect(positionGain({ quantity: -10, avg_price: 100, current_price: 100 })).toBe(0);
  });

  it.each([null, undefined, NaN, Infinity])('does not invent gains from an unavailable mark %s', (current_price) => {
    expect(positionGain({ quantity: 10, avg_price: 100, current_price })).toBeNull();
  });

  it('requires valid quantity and cost basis', () => {
    expect(positionGain({ quantity: null, avg_price: 100, current_price: 120 })).toBeNull();
    expect(positionGain({ quantity: 1, avg_price: null, current_price: 120 })).toBeNull();
    expect(positionGain({ quantity: 1, avg_price: 0, current_price: 120 })).toBeNull();
  });

  it('nets long losses and short gains without including cash or realized trades', () => {
    expect(portfolioGain([
      { quantity: 10, avg_price: 100, current_price: 95 },
      { quantity: -20, avg_price: 100, current_price: 95 },
    ])).toBe(50);
  });

  it('shows zero for an empty portfolio and unknown for a partially unpriced portfolio', () => {
    expect(portfolioGain([])).toBe(0);
    expect(portfolioGain([
      { quantity: 10, avg_price: 100, current_price: 120 },
      { quantity: 2, avg_price: 100, current_price: null },
    ])).toBeNull();
  });
});
