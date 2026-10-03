// Unrealized gains use the latest available mark and signed position quantity.
export function positionGain(position) {
  const { quantity, avg_price: basis, current_price: mark } = position;
  if (![quantity, basis, mark].every((value) => typeof value === 'number' && Number.isFinite(value)) || basis <= 0 || mark <= 0) {
    return null;
  }
  const gain = quantity * (mark - basis);
  if (!Number.isFinite(gain)) return null;
  return gain === 0 ? 0 : gain;
}

export function portfolioGain(positions) {
  let total = 0;
  for (const position of positions) {
    const gain = positionGain(position);
    if (gain === null) return null;
    total += gain;
  }
  return Number.isFinite(total) ? total : null;
}
