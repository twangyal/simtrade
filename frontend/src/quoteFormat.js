export function formatQuotePrice(value) {
  // Preserve tiny received prices and signed changes that five decimals would erase.
  if (Number.isFinite(value) && value !== 0 && Math.abs(value) < 0.000005) return value.toExponential();
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 5,
  }).format(value);
}

export function formatReceiptTime(time) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(time);
}
