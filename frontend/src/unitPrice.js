/** Format a stored unit price without applying the cent rounding used for cash. */
export function formatUnitPrice(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A';

  // Number's canonical decimal string is the shortest representation that round-trips.
  const [mantissa, exponent = '0'] = Math.abs(value).toString().split('e');
  const fraction = mantissa.split('.')[1] ?? '';
  const decimals = Math.max(2, fraction.length - Number(exponent));
  // Older Intl implementations support at most 20 fractional digits. Scientific
  // notation preserves smaller prices and precise bases without rounding to zero.
  if (decimals > 20) return `${value < 0 ? '-$' : '$'}${Math.abs(value).toExponential()}`;

  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: decimals,
  }).format(value);
}
