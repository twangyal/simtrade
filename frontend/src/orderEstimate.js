const MAX_QUOTE_PRICE = 1_000_000;
const MAX_ORDER_CENTS = 100_000_000_000n;
const QUOTE_MAX_AGE_MS = 60_000;

function validPrice(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= MAX_QUOTE_PRICE;
}

function decimalParts(value) {
  const [mantissa, exponent = '0'] = String(value).split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  return { coefficient: BigInt(whole + fraction), exponent: Number(exponent) - fraction.length };
}

function settlementCents(quantity, price, roundUp) {
  const left = decimalParts(quantity);
  const right = decimalParts(price);
  const coefficient = left.coefficient * right.coefficient;
  const exponent = left.exponent + right.exponent + 2;
  const numerator = exponent >= 0 ? coefficient * (10n ** BigInt(exponent)) : coefficient;
  const denominator = exponent < 0 ? 10n ** BigInt(-exponent) : 1n;
  // Check the exact notional before rounding, as the API does.
  if (numerator > MAX_ORDER_CENTS * denominator) return null;
  return roundUp ? (numerator + denominator - 1n) / denominator : numerator / denominator;
}

/**
 * Estimate conservative cent settlement from a browser-received normalized quote.
 * Canonical Number strings match the values sent to the API; integer decimal
 * products avoid binary rounding artifacts at exact-cent boundaries. This does
 * not verify account balance, positions, quantity limits or server quote freshness.
 */
export function getOrderEstimate(quantity, symbol, quote, now) {
  if ((typeof quantity !== 'number' && typeof quantity !== 'string')
    || (typeof quantity === 'string' && quantity.trim() === '')) return { status: 'quantity' };
  const amount = Number(quantity);
  if (!Number.isFinite(amount) || amount <= 0) return { status: 'quantity' };
  if (!quote || typeof symbol !== 'string' || symbol.trim() === '' || quote.symbol !== symbol) return { status: 'missing' };
  if (!Number.isFinite(quote.receivedAt) || quote.receivedAt < 0 || !Number.isFinite(now) || now < 0) return { status: 'invalid' };
  const age = now - quote.receivedAt;
  if (age < 0) return { status: 'invalid' };
  if (age >= QUOTE_MAX_AGE_MS) return { status: 'stale' };

  const spread = validPrice(quote.bid) && validPrice(quote.ask) && quote.bid <= quote.ask;
  if (!spread && !validPrice(quote.price)) return { status: 'invalid' };
  const buyCents = settlementCents(amount, spread ? quote.ask : quote.price, true);
  const sellCents = settlementCents(amount, spread ? quote.bid : quote.price, false);
  if (buyCents === null || sellCents === null) return { status: 'invalid' };
  return {
    status: 'ready',
    buyValue: Number(buyCents) / 100,
    sellValue: Number(sellCents) / 100,
    pricing: spread ? 'spread' : 'last',
    ageSeconds: Math.floor(age / 1000),
  };
}
