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
  if (step < 1e-8) return value === 0 ? '0' : value.toExponential(2);
  const exponent = Math.floor(Math.log10(step));
  const fraction = step / 10 ** exponent;
  const digits = Math.min(10, Math.max(0, -exponent + (Math.abs(fraction - 2.5) < 1e-8 ? 1 : 0)));
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}
