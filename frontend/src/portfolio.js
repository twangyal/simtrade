import { absoluteDecimal, addDecimal, decimalFromNumber, multiplyDecimal, roundDecimalMoney, subtractDecimal } from './decimal';

// Keep each signed gain exact until its displayed row or portfolio total is rounded.
function gainDecimal(position) {
  const { quantity, avg_price: basis, current_price: mark } = position;
  if (![quantity, basis, mark].every((value) => typeof value === 'number' && Number.isFinite(value)) || basis <= 0 || mark <= 0) {
    return null;
  }
  return multiplyDecimal(decimalFromNumber(quantity), subtractDecimal(decimalFromNumber(mark), decimalFromNumber(basis)));
}

export function positionGain(position) {
  return roundDecimalMoney(gainDecimal(position));
}

export function portfolioGain(positions) {
  let total = decimalFromNumber(0);
  for (const position of positions) {
    const gain = gainDecimal(position);
    if (gain === null) return null;
    total = addDecimal(total, gain);
  }
  return roundDecimalMoney(total);
}

function valueDecimal(quantity, price) {
  if (![quantity, price].every((value) => typeof value === 'number' && Number.isFinite(value)) || price <= 0) return null;
  return multiplyDecimal(decimalFromNumber(quantity), decimalFromNumber(price));
}

// A short has a negative marked value; unavailable marks remain unavailable.
export function positionValue(position) {
  return roundDecimalMoney(valueDecimal(position.quantity, position.current_price));
}

// Notional is distinct from the API's conservative buy/sell cash settlement.
export function tradeNotional(quantity, price) {
  const value = valueDecimal(quantity, price);
  return value === null ? null : roundDecimalMoney(absoluteDecimal(value));
}
