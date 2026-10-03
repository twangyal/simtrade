import { describe, expect, it } from 'vitest';
import { appendQuote, normalizeQuote, quoteRangeStats, selectQuoteRange } from '../quotes';

describe('quote normalization', () => {
  it.each([
    [123, 123],
    ['123.45', 123.45],
    [' 1.25e2 ', 125],
    [[123], 123],
    [['123.45'], 123.45],
  ])('accepts the supported price representation %j', (price, expected) => {
    expect(normalizeQuote({ symbol: 'AAPL', price }, 'AAPL')).toEqual({ symbol: 'AAPL', price: expected });
  });

  it.each([
    undefined, null, true, false, 0, -1, NaN, Infinity, -Infinity,
    '', '   ', 'not-a-price', '12 dollars', {}, [], [1, 2], [[1]], [true], [' '], [0],
  ].map((price) => [price]))('rejects invalid prices instead of coercing them into a quote: %j', (price) => {
    expect(normalizeQuote({ symbol: 'AAPL', price }, 'AAPL')).toBeNull();
  });

  it.each([null, undefined, [], 'AAPL', 123, true].map((payload) => [payload]))('rejects a non-object quote payload: %j', (payload) => {
    expect(normalizeQuote(payload, 'AAPL')).toBeNull();
  });

  it('ignores another symbol and an absent symbol', () => {
    expect(normalizeQuote({ symbol: 'QQQ', price: 100 }, 'AAPL')).toBeNull();
    expect(normalizeQuote({ price: 100 }, 'AAPL')).toBeNull();
  });

  it('normalizes optional bid/ask and keeps provenance without copying unrelated fields', () => {
    const payload = Object.freeze({ symbol: 'AAPL', price: '100', bid: '99.5', ask: 100.5, source: 'demo', secret: 'discard' });
    expect(normalizeQuote(payload, 'AAPL')).toEqual({ symbol: 'AAPL', price: 100, bid: 99.5, ask: 100.5, source: 'demo' });
    expect(payload.price).toBe('100');
  });

  it('preserves the inclusive backend price limit for price, bid and ask', () => {
    expect(normalizeQuote({ symbol: 'AAPL', price: ['1000000'], bid: 1_000_000, ask: '1000000' }, 'AAPL'))
      .toEqual({ symbol: 'AAPL', price: 1_000_000, bid: 1_000_000, ask: 1_000_000 });
  });

  it.each([1_000_000.01, '1000000.01', [1_000_000.01], 1e308, '1e308'].map((price) => [price]))(
    'rejects a last price above the backend limit: %j', (price) => {
      expect(normalizeQuote({ symbol: 'AAPL', price }, 'AAPL')).toBeNull();
    },
  );

  it.each([1_000_000.01, '1000000.01', 1e308, '1e308'])(
    'omits bid and ask above the backend limit: %j', (value) => {
      expect(normalizeQuote({ symbol: 'AAPL', price: 100, bid: value, ask: value }, 'AAPL'))
        .toEqual({ symbol: 'AAPL', price: 100 });
    },
  );

  it.each([undefined, null, false, true, 0, -1, Infinity, '', ' ', 'invalid', {}, [100]].map((value) => [value]))(
    'omits invalid optional bid/ask values while retaining a valid last price: %j', (value) => {
      expect(normalizeQuote({ symbol: 'AAPL', price: 100, bid: value, ask: value }, 'AAPL'))
        .toEqual({ symbol: 'AAPL', price: 100 });
    },
  );

  it.each([null, 1, {}, '', '   '])('does not manufacture a provenance label from %j', (source) => {
    expect(normalizeQuote({ symbol: 'AAPL', price: 100, source }, 'AAPL')).toEqual({ symbol: 'AAPL', price: 100 });
  });
});

describe('received quote history', () => {
  it('starts with the actual received tick without inventing earlier points', () => {
    expect(appendQuote([], { symbol: 'AAPL', price: 100 }, 5000)).toEqual([{ time: 5000, price: 100 }]);
  });

  it('preserves the same price at a later receipt time without changing existing points', () => {
    const previous = Object.freeze([Object.freeze({ time: 1000, price: 100 })]);
    expect(appendQuote(previous, { price: 100 }, 2000)).toEqual([
      { time: 1000, price: 100 }, { time: 2000, price: 100 },
    ]);
    expect(previous).toEqual([{ time: 1000, price: 100 }]);
  });

  it('ignores an exact duplicate of the last received tick', () => {
    const points = [{ time: 1000, price: 100 }];
    expect(appendQuote(points, { price: 100 }, 1000)).toBe(points);
  });

  it('replaces a changed price at the same receipt time instead of making duplicate timestamps', () => {
    const previous = Object.freeze([
      Object.freeze({ time: 1000, price: 100 }), Object.freeze({ time: 2000, price: 101 }),
    ]);
    expect(appendQuote(previous, { price: 102 }, 2000)).toEqual([
      { time: 1000, price: 100 }, { time: 2000, price: 102 },
    ]);
    expect(previous[1].price).toBe(101);
  });

  it('ignores an older receipt rather than moving chart time backwards', () => {
    const points = [{ time: 1000, price: 100 }, { time: 2000, price: 101 }];
    expect(appendQuote(points, { price: 999 }, 1500)).toBe(points);
  });

  it.each([undefined, null, '', '2000', NaN, Infinity, -1])('ignores invalid receipt time %j', (time) => {
    const points = [{ time: 1000, price: 100 }];
    expect(appendQuote(points, { price: 101 }, time)).toBe(points);
  });

  it.each([null, {}, { price: 0 }, { price: false }, { price: '100' }, { price: Infinity }])(
    'requires an already normalized price when appending %j', (quote) => {
      const points = [{ time: 1000, price: 100 }];
      expect(appendQuote(points, quote, 2000)).toBe(points);
    },
  );

  it('keeps at most the 1800 most recent actual ticks', () => {
    const points = Array.from({ length: 1800 }, (_, time) => ({ time, price: 100 + time }));
    const result = appendQuote(points, { price: 1900 }, 1800);
    expect(result).toHaveLength(1800);
    expect(result[0]).toEqual({ time: 1, price: 101 });
    expect(result.at(-1)).toEqual({ time: 1800, price: 1900 });
    expect(points[0]).toEqual({ time: 0, price: 100 });
  });
});

describe('quote range selection', () => {
  const points = Object.freeze([0, 29999, 30000, 269999, 270000, 300000, 330000]
    .map((time, index) => Object.freeze({ time, price: 100 + index })));

  it('selects one minute inclusively, anchored to the latest received tick', () => {
    expect(selectQuoteRange(points, '1m')).toEqual(points.slice(4));
  });

  it('selects five minutes inclusively without including an older boundary tick', () => {
    expect(selectQuoteRange(points, '5m')).toEqual(points.slice(2));
  });

  it('returns all retained ticks for All', () => {
    expect(selectQuoteRange(points, 'All')).toEqual(points);
  });

  it('does not manufacture a boundary point across a gap in observations', () => {
    const sparse = [{ time: 0, price: 100 }, { time: 120000, price: 120 }];
    expect(selectQuoteRange(sparse, '1m')).toEqual([{ time: 120000, price: 120 }]);
  });

  it.each(['1m', '5m', 'All'])('handles an empty or single-tick %s range', (range) => {
    expect(selectQuoteRange([], range)).toEqual([]);
    expect(selectQuoteRange([{ time: 5000, price: 100 }], range)).toEqual([{ time: 5000, price: 100 }]);
  });

  it('does not silently reinterpret an unknown range as All', () => {
    expect(selectQuoteRange(points, '1h')).toEqual([]);
  });
});

describe('observed range statistics', () => {
  it('returns no statistics without received ticks', () => {
    expect(quoteRangeStats([])).toBeNull();
  });

  it('uses one actual price for a one-tick range with zero change', () => {
    expect(quoteRangeStats([{ time: 1000, price: 100 }]))
      .toEqual({ first: 100, last: 100, low: 100, high: 100, change: 0, percent: 0 });
  });

  it('calculates endpoints, extrema and signed change from received observations', () => {
    const points = [100, 90, 150, 120].map((price, time) => ({ time, price }));
    expect(quoteRangeStats(points)).toEqual({ first: 100, last: 120, low: 90, high: 150, change: 20, percent: 20 });
  });

  it('calculates a negative percentage from the first observation', () => {
    expect(quoteRangeStats([{ time: 1, price: 120 }, { time: 2, price: 90 }]))
      .toEqual({ first: 120, last: 90, low: 90, high: 120, change: -30, percent: -25 });
  });

  it('supports fractional prices and reports no movement for an unchanged endpoint', () => {
    expect(quoteRangeStats([{ time: 1, price: 0.25 }, { time: 2, price: 0.375 }]))
      .toEqual({ first: 0.25, last: 0.375, low: 0.25, high: 0.375, change: 0.125, percent: 50 });
    expect(quoteRangeStats([100, 110, 100].map((price, time) => ({ time, price }))))
      .toEqual({ first: 100, last: 100, low: 100, high: 110, change: 0, percent: 0 });
  });

  it('rejects invalid observations instead of manufacturing statistics', () => {
    expect(quoteRangeStats([{ time: 1, price: 0 }, { time: 2, price: 100 }])).toBeNull();
    expect(quoteRangeStats([{ time: 1, price: 100 }, { time: 2, price: Infinity }])).toBeNull();
    expect(quoteRangeStats([{ time: 1, price: NaN }, { time: 2, price: 100 }])).toBeNull();
  });

  it.each([[1e-310, 1], [Number.MIN_VALUE, 1_000_000]])(
    'preserves real prices and change from %s to %s when only percentage overflows', (first, last) => {
      expect(quoteRangeStats([{ time: 1, price: first }, { time: 2, price: last }]))
        .toEqual({ first, last, low: first, high: last, change: last, percent: null });
    },
  );

  it('still calculates finite percentage changes for tiny prices', () => {
    expect(quoteRangeStats([{ time: 1, price: Number.MIN_VALUE }, { time: 2, price: Number.MIN_VALUE * 2 }]))
      .toEqual({ first: Number.MIN_VALUE, last: Number.MIN_VALUE * 2, low: Number.MIN_VALUE,
        high: Number.MIN_VALUE * 2, change: Number.MIN_VALUE, percent: 100 });
  });
});
