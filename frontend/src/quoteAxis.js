// Round reference levels make narrow observed price ranges easier to read.
// These levels are chart guides, never additional price observations.
export function quoteAxis(low, high) {
  const padding = high > low ? (high - low) * 0.18 : Math.max(high * 0.001, Number.MIN_VALUE);
  const lower = Math.max(0, low - padding);
  const upper = high + padding;
  const rawStep = Math.max((upper - lower) / 4, Number.EPSILON * high, Number.MIN_VALUE);
  // Build the rounded step directly: 10 ** -324 underflows even when a
  // multiple of that magnitude is a usable, nonzero subnormal number.
  const [fraction, exponent] = rawStep.toExponential().split('e').map(Number);
  const multiple = [1, 2, 2.5, 5, 10].find((value) => value >= fraction) ?? 10;
  const step = Number(`${multiple}e${exponent}`);
  const start = Math.floor(lower / step) * step;
  const count = Math.max(1, Math.min(8, Math.ceil((upper - start) / step)));
  const ticks = Array.from({ length: count + 1 }, (_, index) => start + index * step);
  // At adjacent floating-point values, aligning a grid can round inward or
  // repeat a tick. The padded endpoints still form a valid two-level scale.
  const valid = ticks[0] <= low && ticks.at(-1) >= high
    && ticks.every((value, index) => Number.isFinite(value) && (index === 0 || value > ticks[index - 1]));
  if (!valid) return { low: lower, high: upper, step: upper - lower, ticks: [lower, upper] };
  return { low: ticks[0], high: ticks.at(-1), step, ticks };
}

export function formatAxisPrice(value, step) {
  // Scientific components also work for subnormal steps where 10 ** exponent underflows.
  const [stepFraction, stepExponent] = step.toExponential().split('e').map(Number);
  // Subnormal steps can differ materially from their short decimal form;
  // another digit prevents adjacent guide labels from rounding together.
  const extraDigit = step < 2 ** -1022 || Math.abs(stepFraction - 2.5) < 1e-8 ? 1 : 0;
  const digits = Math.max(0, -stepExponent + extraDigit);
  const valueExponent = value === 0 ? 0 : Number(value.toExponential().split('e')[1]);
  const precision = Math.min(16, Math.max(0, valueExponent - stepExponent + extraDigit));
  // Close to the precision limit, only round-trip text reliably distinguishes
  // neighboring representable values (including a two-endpoint fallback).
  if (value !== 0 && precision >= 14) return value.toExponential();

  if (digits <= 10 && valueExponent + digits <= 16) {
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  }
  if (value === 0) return '0';
  // Keep neighboring reference levels distinct without asking a Number for more than 17 significant digits.
  return value.toExponential(precision);
}
