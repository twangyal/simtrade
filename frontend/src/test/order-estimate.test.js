import { describe, expect, it } from 'vitest';
import { getOrderEstimate } from '../orderEstimate';

const now = 100_000;
const quote = { symbol: 'AAPL', price: 100, receivedAt: now };
const estimate = (quantity, changes = {}, currentTime = now) =>
  getOrderEstimate(quantity, 'AAPL', { ...quote, ...changes }, currentTime);

describe('order estimate inputs and quote freshness', () => {
  it.each(['', ' ', 'invalid', 'Infinity', 0, -1, Infinity, NaN, null, undefined, true, [], {}].map((quantity) => [quantity]))(
    'requires a finite positive quantity: %j', (quantity) => {
      expect(estimate(quantity)).toEqual({ status: 'quantity' });
    },
  );

  it('accepts numeric and numeric-string fractional quantities', () => {
    for (const quantity of [0.125, ' 0.125 ']) {
      expect(estimate(quantity)).toEqual({ status: 'ready', buyValue: 12.5, sellValue: 12.5, pricing: 'last', ageSeconds: 0 });
    }
  });

  it('requires a quote for the selected symbol', () => {
    expect(getOrderEstimate(1, 'AAPL', null, now)).toEqual({ status: 'missing' });
    expect(getOrderEstimate(1, 'AAPL', undefined, now)).toEqual({ status: 'missing' });
    expect(estimate(1, { symbol: 'QQQ' })).toEqual({ status: 'missing' });
    expect(estimate(1, { symbol: undefined })).toEqual({ status: 'missing' });
  });

  it.each([undefined, null, '', '100000', NaN, Infinity, -1])('rejects an invalid receipt time: %j', (receivedAt) => {
    expect(estimate(1, { receivedAt })).toEqual({ status: 'invalid' });
  });

  it.each([undefined, null, '100000', NaN, Infinity, -1])('rejects an invalid current time: %j', (currentTime) => {
    expect(getOrderEstimate(1, 'AAPL', quote, currentTime)).toEqual({ status: 'invalid' });
  });

  it('rejects future receipts and treats the sixty-second boundary as stale', () => {
    expect(estimate(1, { receivedAt: now + 1 })).toEqual({ status: 'invalid' });
    expect(estimate(1, { receivedAt: now - 60_000 })).toEqual({ status: 'stale' });
    expect(estimate(1, { receivedAt: now - 60_001 })).toEqual({ status: 'stale' });
    expect(estimate(1, { receivedAt: now - 59_999 })).toEqual({
      status: 'ready', buyValue: 100, sellValue: 100, pricing: 'last', ageSeconds: 59,
    });
  });

  it('accepts zero as a receipt time and reports whole elapsed seconds', () => {
    expect(estimate(1, { receivedAt: 0 }, 1500)).toEqual({
      status: 'ready', buyValue: 100, sellValue: 100, pricing: 'last', ageSeconds: 1,
    });
  });
});

describe('execution price selection', () => {
  it('uses the ask for a buy and the bid for a sell when a complete spread is valid', () => {
    expect(estimate('2.5', { price: 100, bid: 99.99, ask: 100.01 })).toEqual({
      status: 'ready', buyValue: 250.03, sellValue: 249.97, pricing: 'spread', ageSeconds: 0,
    });
  });

  it('accepts a zero-width spread and the inclusive maximum quote price', () => {
    expect(estimate(0.5, { price: 1, bid: 1_000_000, ask: 1_000_000 })).toEqual({
      status: 'ready', buyValue: 500_000, sellValue: 500_000, pricing: 'spread', ageSeconds: 0,
    });
  });

  it.each([
    { bid: 99 }, { ask: 101 }, { bid: 101, ask: 99 }, { bid: 0, ask: 101 },
    { bid: 99, ask: Infinity }, { bid: '99', ask: 101 }, { bid: false, ask: 101 },
    { bid: 99, ask: 1_000_000.01 }, { bid: 1_000_000.01, ask: 1_000_001 },
  ])('falls back to last price for an unusable spread: %j', (spread) => {
    expect(estimate(1, spread)).toEqual({ status: 'ready', buyValue: 100, sellValue: 100, pricing: 'last', ageSeconds: 0 });
  });

  it.each([undefined, null, false, '100', 0, -1, Infinity, NaN, 1_000_000.01, 1e308])(
    'rejects an unusable last price when no spread is available: %j', (price) => {
      expect(estimate(1, { price })).toEqual({ status: 'invalid' });
    },
  );

  it('uses a valid spread without requiring an unused last price', () => {
    expect(estimate(1, { price: undefined, bid: 99, ask: 101 })).toEqual({
      status: 'ready', buyValue: 101, sellValue: 99, pricing: 'spread', ageSeconds: 0,
    });
  });
});

describe('decimal cent settlement', () => {
  it.each([[1, 0.07, 0.07], [1, 0.29, 0.29], [0.07, 3, 0.21], ['0.10', 0.3, 0.03]])(
    'keeps exact-cent products exact for quantity %j and price %j', (quantity, price, value) => {
      expect(estimate(quantity, { price })).toEqual({ status: 'ready', buyValue: value, sellValue: value, pricing: 'last', ageSeconds: 0 });
    },
  );

  it('rounds subcent remainders up for buys and down for sells', () => {
    expect(estimate(1, { price: 1.005 })).toEqual({
      status: 'ready', buyValue: 1.01, sellValue: 1, pricing: 'last', ageSeconds: 0,
    });
  });

  it('keeps a tiny fractional estimate at one cent to buy and zero cents to sell', () => {
    expect(estimate('1e-8', { price: 0.07 })).toEqual({
      status: 'ready', buyValue: 0.01, sellValue: 0, pricing: 'last', ageSeconds: 0,
    });
  });

  it('supports scientific notation in both canonical number strings', () => {
    expect(estimate(1e6, { price: 1e-7 })).toEqual({
      status: 'ready', buyValue: 0.1, sellValue: 0.1, pricing: 'last', ageSeconds: 0,
    });
    expect(estimate('1e+3', { price: 2.5e-7 })).toEqual({
      status: 'ready', buyValue: 0.01, sellValue: 0, pricing: 'last', ageSeconds: 0,
    });
  });

  it('does not lose a positive product when binary multiplication underflows', () => {
    expect(estimate(Number.MIN_VALUE, { price: Number.MIN_VALUE })).toEqual({
      status: 'ready', buyValue: 0.01, sellValue: 0, pricing: 'last', ageSeconds: 0,
    });
  });

  it('accepts the inclusive one-billion-dollar notional limit', () => {
    expect(estimate(1000, { price: 1_000_000 })).toEqual({
      status: 'ready', buyValue: 1_000_000_000, sellValue: 1_000_000_000, pricing: 'last', ageSeconds: 0,
    });
  });

  it('rejects exact notionals over the backend limit before cent rounding', () => {
    expect(estimate('1000.000000001', { price: 1_000_000 })).toEqual({ status: 'invalid' });
    expect(estimate(1e308, { price: 1_000_000 })).toEqual({ status: 'invalid' });
    expect(estimate(1000.1, { bid: 1, ask: 1_000_000 })).toEqual({ status: 'invalid' });
  });

  it('normalizes the quantity to the Number value sent by the order form', () => {
    expect(estimate('0.1000000000000000001', { price: 0.7 })).toEqual({
      status: 'ready', buyValue: 0.07, sellValue: 0.07, pricing: 'last', ageSeconds: 0,
    });
  });
});
