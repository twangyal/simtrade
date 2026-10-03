// Keep arithmetic exact for the canonical decimal values received from the API.
// A decimal is coefficient * 10 ** exponent; operations return new objects.
export function decimalFromNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const [mantissa, exponent = '0'] = String(value).split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  return { coefficient: BigInt(whole + fraction), exponent: Number(exponent) - fraction.length };
}

export function addDecimal(left, right) {
  const exponent = Math.min(left.exponent, right.exponent);
  return {
    coefficient: left.coefficient * 10n ** BigInt(left.exponent - exponent)
      + right.coefficient * 10n ** BigInt(right.exponent - exponent),
    exponent,
  };
}

export function subtractDecimal(left, right) {
  return addDecimal(left, { coefficient: -right.coefficient, exponent: right.exponent });
}

export function multiplyDecimal(left, right) {
  return { coefficient: left.coefficient * right.coefficient, exponent: left.exponent + right.exponent };
}

export function absoluteDecimal(value) {
  return { coefficient: value.coefficient < 0n ? -value.coefficient : value.coefficient, exponent: value.exponent };
}

// This conversion is for approximate chart geometry, never for money arithmetic.
export function decimalToNumber(value) {
  return Number(`${value.coefficient}e${value.exponent}`);
}

// Match backend Decimal.quantize(.01): nearest cent, ties to the even cent.
// Round only a final displayed value/total, not its individual aggregate terms.
export function roundDecimalMoney(value) {
  if (value === null) return null;
  const negative = value.coefficient < 0n;
  const coefficient = negative ? -value.coefficient : value.coefficient;
  const exponent = value.exponent + 2;
  let cents;
  if (exponent >= 0) {
    cents = coefficient * 10n ** BigInt(exponent);
  } else {
    const denominator = 10n ** BigInt(-exponent);
    cents = coefficient / denominator;
    const remainder = coefficient % denominator;
    if (remainder * 2n > denominator || (remainder * 2n === denominator && cents % 2n === 1n)) cents += 1n;
  }
  // Below $2**46, Number spacing is at most $0.0078125, so conversion error
  // stays below half a cent. At/above it, dividing safe integer cents by 100
  // can lose a cent. This limit still exceeds every supported $8T portfolio.
  if (cents >= 100n * (2n ** 46n)) return null;
  if (cents === 0n) return 0;
  return Number(negative ? -cents : cents) / 100;
}
