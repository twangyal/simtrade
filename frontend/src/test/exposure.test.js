import { describe, expect, it } from 'vitest';
import { portfolioExposure } from '../exposure';

describe('marked position exposure', () => {
  it('weights long and short positions by absolute marked value without netting them', () => {
    const result = portfolioExposure([
      { symbol: 'AAPL', quantity: 3, current_price: 100 },
      { symbol: 'TRP', quantity: -2, current_price: 50 },
    ]);
    expect(result.gross).toBe(400);
    expect(result.long).toBe(300);
    expect(result.short).toBe(100);
    expect(result.positions.map(({ symbol, side, value, weight, offset }) => ({ symbol, side, value, weight, offset }))).toEqual([
      { symbol: 'AAPL', side: 'Long', value: 300, weight: 75, offset: 0 },
      { symbol: 'TRP', side: 'Short', value: 100, weight: 25, offset: 75 },
    ]);
  });

  it('excludes unavailable marks without estimating them from entry price', () => {
    const result = portfolioExposure([
      { symbol: 'AAPL', quantity: 2, current_price: 100 },
      { symbol: 'QQQ', quantity: -4, current_price: null, avg_price: 500 },
      { symbol: 'TRP', quantity: 0, current_price: null },
    ]);
    expect(result.gross).toBe(200);
    expect(result.openCount).toBe(2);
    expect(result.excludedCount).toBe(1);
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0].weight).toBe(100);
  });

  it('distinguishes an empty portfolio from entirely unknown position values', () => {
    expect(portfolioExposure([])).toMatchObject({ gross: 0, openCount: 0, excludedCount: 0 });
    expect(portfolioExposure([{ quantity: 0, current_price: 100 }])).toMatchObject({ openCount: 0, excludedCount: 0 });
    expect(portfolioExposure([{ symbol: 'AAPL', quantity: 1, current_price: null }])).toMatchObject({ gross: 0, openCount: 1, excludedCount: 1 });
  });

  it('never creates invalid geometry from nonfinite or invalid market values', () => {
    const result = portfolioExposure([
      { symbol: 'AAPL', quantity: 2, current_price: 100 },
      { symbol: 'QQQ', quantity: 1, current_price: Number.NaN },
      { symbol: 'TRP', quantity: -2, current_price: 0 },
      { symbol: 'INFY', quantity: Number.POSITIVE_INFINITY, current_price: 20 },
      { symbol: 'IXIC', quantity: 1e308, current_price: 1e308 },
    ]);
    expect(result.excludedCount).toBe(4);
    expect(result.gross).toBe(200);
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0]).toMatchObject({ weight: 100, offset: 0 });
  });

  it('fills one complete circle with nonoverlapping arcs for fractional holdings', () => {
    const result = portfolioExposure([
      { symbol: 'AAPL', quantity: 0.1, current_price: 1 },
      { symbol: 'QQQ', quantity: -0.2, current_price: 1 },
      { symbol: 'TRP', quantity: 0.3, current_price: 1 },
    ]);
    let edge = 0;
    for (const position of result.positions) {
      expect(position.offset).toBeCloseTo(edge, 10);
      expect(position.weight).toBeGreaterThan(0);
      edge += position.weight;
    }
    expect(edge).toBeCloseTo(100, 10);
    expect(result.positions.map(({ value }) => value)).toEqual([0.3, 0.2, 0.1]);
  });

  it('keeps arc lengths nonnegative when tiny positions follow very large holdings', () => {
    const result = portfolioExposure([
      { symbol: 'AAPL', quantity: 1000000, current_price: 100000 },
      { symbol: 'QQQ', quantity: 1000000, current_price: 250000 },
      { symbol: 'TRP', quantity: 1000000, current_price: 500000 },
      { symbol: 'SMALL', quantity: 0.00000001, current_price: 100 },
    ]);
    expect(result.positions).toHaveLength(4);
    for (const { weight, offset } of result.positions) {
      expect(weight).toBeGreaterThanOrEqual(0);
      expect(offset).toBeLessThanOrEqual(100);
      expect(offset + weight).toBeLessThanOrEqual(100);
    }
  });
});
