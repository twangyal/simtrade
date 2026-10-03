// Exposure uses absolute position market values. A short remains a liability;
// it contributes positive chart weight and never offsets a long's weight.
export function portfolioExposure(holdings = []) {
  let gross = 0;
  let long = 0;
  let short = 0;
  let openCount = 0;
  let excludedCount = 0;
  const positions = [];

  holdings.forEach((holding, index) => {
    const quantity = holding?.quantity;
    if (quantity === 0) return;
    openCount += 1;
    const mark = holding?.current_price;
    if (![quantity, mark].every((value) => typeof value === 'number' && Number.isFinite(value)) || mark <= 0) {
      excludedCount += 1;
      return;
    }
    const value = Math.abs(quantity) * mark;
    if (value <= 0 || !Number.isFinite(value) || !Number.isFinite(gross + value)) {
      excludedCount += 1;
      return;
    }
    const side = quantity < 0 ? 'Short' : 'Long';
    gross += value;
    if (quantity < 0) short += value;
    else long += value;
    positions.push({
      key: holding.id ?? `${holding.symbol}-${side}-${index}`,
      symbol: holding.symbol || 'Unnamed position',
      side,
      value,
    });
  });

  positions.sort((left, right) => right.value - left.value);
  let offset = 0;
  const segments = positions.map((position, index) => {
    // Clamp accumulated floating-point error so no arc acquires a negative dash.
    const remaining = Math.max(0, 100 - offset);
    const weight = index === positions.length - 1 ? remaining : Math.min(remaining, position.value / gross * 100);
    const segment = { ...position, weight, offset };
    offset = Math.min(100, offset + weight);
    return segment;
  });
  return { gross, long, short, openCount, excludedCount, positions: segments };
}
