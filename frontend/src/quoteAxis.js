// Round reference levels make narrow observed price ranges easier to read.
// These levels are chart guides, never additional price observations.
export function quoteAxis(low, high) {
  const padding = high > low ? (high - low) * 0.18 : Math.max(high * 0.001, Number.MIN_VALUE);
  const lower = Math.max(0, low - padding);
  const upper = high + padding;
  const rawStep = Math.max((upper - lower) / 4, Number.EPSILON * high, Number.MIN_VALUE);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const fraction = rawStep / magnitude;
  const multiple = [1, 2, 2.5, 5, 10].find((value) => value >= fraction) ?? 10;
  const step = magnitude > 0 ? multiple * magnitude : Number.MIN_VALUE;
  const start = Math.floor(lower / step) * step;
  const count = Math.max(1, Math.min(8, Math.ceil((upper - start) / step)));
  const ticks = Array.from({ length: count + 1 }, (_, index) => start + index * step);
  return { low: ticks[0], high: ticks.at(-1), step, ticks };
}

export function formatAxisPrice(value, step) {
  // Scientific components also work for subnormal steps where 10 ** exponent underflows.
  const [stepFraction, stepExponent] = step.toExponential().split('e').map(Number);
  const extraDigit = Math.abs(stepFraction - 2.5) < 1e-8 ? 1 : 0;
  const digits = Math.max(0, -stepExponent + extraDigit);
  const valueExponent = value === 0 ? 0 : Number(value.toExponential().split('e')[1]);

  if (digits <= 10 && valueExponent + digits <= 16) {
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  }
  if (value === 0) return '0';
  // Keep neighboring reference levels distinct without asking a Number for more than 17 significant digits.
  const precision = Math.min(16, Math.max(0, valueExponent - stepExponent + extraDigit));
  return value.toExponential(precision);
}
