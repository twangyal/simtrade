import { absoluteDecimal, addDecimal, decimalFromNumber, decimalToNumber, multiplyDecimal, roundDecimalMoney } from './decimal';

// Exposure uses absolute position market values. A short remains a liability;
// it contributes positive chart weight and never offsets a long's weight.
export function portfolioExposure(holdings = []) {
  let gross = 0;
  let long = 0;
  let short = 0;
  let exactGross = decimalFromNumber(0);
  let exactLong = decimalFromNumber(0);
  let exactShort = decimalFromNumber(0);
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
    const exactValue = absoluteDecimal(multiplyDecimal(decimalFromNumber(quantity), decimalFromNumber(mark)));
    const value = decimalToNumber(exactValue);
    const nextGross = addDecimal(exactGross, exactValue);
    if (value <= 0 || !Number.isFinite(value) || !Number.isFinite(decimalToNumber(nextGross))) {
      excludedCount += 1;
      return;
    }
    const side = quantity < 0 ? 'Short' : 'Long';
    exactGross = nextGross;
    gross = decimalToNumber(exactGross);
    if (quantity < 0) {
      exactShort = addDecimal(exactShort, exactValue);
      short = decimalToNumber(exactShort);
    } else {
      exactLong = addDecimal(exactLong, exactValue);
      long = decimalToNumber(exactLong);
    }
    positions.push({
      key: holding.id ?? `${holding.symbol}-${side}-${index}`,
      symbol: holding.symbol || 'Unnamed position',
      side,
      value,
      moneyValue: roundDecimalMoney(exactValue),
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
  return {
    gross, long, short, openCount, excludedCount, positions: segments,
    money: { gross: roundDecimalMoney(exactGross), long: roundDecimalMoney(exactLong), short: roundDecimalMoney(exactShort) },
  };
}
