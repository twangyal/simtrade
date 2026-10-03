import { describe, expect, it } from 'vitest';
import { positionGain, portfolioGain, positionValue, tradeNotional } from '../portfolio';

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

  it('calculates fractional marked gains before rounding to cents', () => {
    expect(positionGain({ quantity: 0.3, avg_price: 100, current_price: 100.05 })).toBe(0.02);
    expect(positionGain({ quantity: -0.3, avg_price: 100, current_price: 100.05 })).toBe(-0.02);
  });

  it.each([
    [100.005, 0], [100.015, 0.02], [100.025, 0.02], [100.035, 0.04],
    [99.995, 0], [99.985, -0.02], [99.975, -0.02], [99.965, -0.04],
  ])('uses the backend half-even cent policy at a mark of %s', (current_price, expected) => {
    expect(positionGain({ quantity: 1, avg_price: 100, current_price })).toBe(expected);
  });

  it('rounds portfolio gains only after summing exact values', () => {
    const positions = [
      { quantity: 0.1, avg_price: 100, current_price: 100.05 },
      { quantity: 0.1, avg_price: 100, current_price: 100.05 },
    ];
    expect(positions.map(positionGain)).toEqual([0, 0]);
    expect(portfolioGain(positions)).toBe(0.01);
    expect(portfolioGain(positions.map((position) => ({ ...position, quantity: -position.quantity })))).toBe(-0.01);
  });

  it('preserves a small gain when large opposing positions cancel', () => {
    expect(portfolioGain([
      { quantity: 999999, avg_price: 1, current_price: 1000000 },
      { quantity: -999999, avg_price: 1, current_price: 1000000 },
      { quantity: 0.3, avg_price: 100, current_price: 100.05 },
    ])).toBe(0.02);
  });
});

describe('marked values and trade notionals', () => {
  it('uses exact signed market values and absolute execution notionals', () => {
    expect(positionValue({ quantity: 0.3, current_price: 100.05 })).toBe(30.02);
    expect(positionValue({ quantity: -0.3, current_price: 100.05 })).toBe(-30.02);
    expect(tradeNotional(0.3, 100.05)).toBe(30.02);
    expect(tradeNotional(-0.3, 100.05)).toBe(30.02);
  });

  it('keeps half-even notional display separate from conservative cash settlement', () => {
    expect(tradeNotional(1, 1.005)).toBe(1);
    expect(tradeNotional(-1, 1.015)).toBe(1.02);
  });

  it.each([null, undefined, NaN, Infinity, 0, -1])('does not invent marked or execution values from an invalid price %s', (price) => {
    expect(positionValue({ quantity: 1, current_price: price })).toBeNull();
    expect(tradeNotional(1, price)).toBeNull();
  });

  it.each([null, undefined, NaN, Infinity, '0.3'])('requires a finite numeric quantity %s', (quantity) => {
    expect(positionValue({ quantity, current_price: 100 })).toBeNull();
    expect(tradeNotional(quantity, 100)).toBeNull();
  });

  it('handles zero quantity and the largest supported marked position', () => {
    expect(positionValue({ quantity: 0, current_price: 100 })).toBe(0);
    expect(tradeNotional(0, 100)).toBe(0);
    expect(positionValue({ quantity: 1000000, current_price: 1000000 })).toBe(1000000000000);
    expect(positionValue({ quantity: -1000000, current_price: 1000000 })).toBe(-1000000000000);
  });
});
