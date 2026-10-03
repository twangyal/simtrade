const MAX_QUOTE_POINTS = 1800;
const MAX_QUOTE_PRICE = 1_000_000;

function positiveNumber(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && number <= MAX_QUOTE_PRICE ? number : null;
}

/** Normalize one matching quote; only price supports the legacy one-element array. */
export function normalizeQuote(payload, symbol) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || typeof symbol !== 'string' || symbol.trim() === '' || payload.symbol !== symbol) return null;

  let rawPrice = payload.price;
  if (Array.isArray(rawPrice)) {
    if (rawPrice.length !== 1) return null;
    rawPrice = rawPrice[0];
  }
  const price = positiveNumber(rawPrice);
  if (price === null) return null;

  const quote = { symbol, price };
  for (const field of ['bid', 'ask']) {
    const value = positiveNumber(payload[field]);
    if (value !== null) quote[field] = value;
  }
  if (typeof payload.source === 'string' && payload.source.trim() !== '') quote.source = payload.source;
  return quote;
}

/** Retain actual observations in receipt-time order, without mutating existing points. */
export function appendQuote(points, quote, receivedAt) {
  if (!quote || typeof quote.price !== 'number' || !Number.isFinite(quote.price) || quote.price <= 0
    || typeof receivedAt !== 'number' || !Number.isFinite(receivedAt) || receivedAt < 0) return points;

  const last = points.at(-1);
  if (last && receivedAt < last.time) return points;
  if (last && receivedAt === last.time) {
    if (quote.price === last.price) return points;
    return [...points.slice(-(MAX_QUOTE_POINTS), -1), { time: receivedAt, price: quote.price }];
  }
  return [...points.slice(-(MAX_QUOTE_POINTS - 1)), { time: receivedAt, price: quote.price }];
}

/** Inclusive windows are anchored to the latest received tick, not the wall clock. */
export function selectQuoteRange(points, range) {
  if (range === 'All') return points;
  const duration = range === '1m' ? 60_000 : range === '5m' ? 300_000 : null;
  if (duration === null || points.length === 0) return [];
  const cutoff = points.at(-1).time - duration;
  return points.filter((point) => point.time >= cutoff);
}

/** Endpoints, extrema and movement use only the observations in the supplied range. */
export function quoteRangeStats(points) {
  if (points.length === 0) return null;
  let low = Infinity;
  let high = -Infinity;
  for (const point of points) {
    if (!point || typeof point.price !== 'number' || !Number.isFinite(point.price) || point.price <= 0) return null;
    low = Math.min(low, point.price);
    high = Math.max(high, point.price);
  }
  const first = points[0].price;
  const last = points.at(-1).price;
  const change = last - first;
  const percent = (change / first) * 100;
  if (!Number.isFinite(change) || !Number.isFinite(percent)) return null;
  return { first, last, low, high, change, percent };
}
