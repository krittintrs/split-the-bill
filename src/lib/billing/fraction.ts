/** Exact rational arithmetic on BigInt. Internal to the billing engine. */
export interface Fraction {
  numerator: bigint; // top number — the value being divided (เศษ)
  denominator: bigint; // bottom number — how many parts it is divided into (ส่วน); always > 0
}

export function fraction(numerator: bigint, denominator: bigint = 1n): Fraction {
  if (denominator <= 0n) throw new Error("denominator must be positive");
  return { numerator, denominator };
}

export const ZERO: Fraction = { numerator: 0n, denominator: 1n };

export function multiply(a: Fraction, b: Fraction): Fraction {
  return {
    numerator: a.numerator * b.numerator,
    denominator: a.denominator * b.denominator,
  };
}

export function add(a: Fraction, b: Fraction): Fraction {
  return {
    numerator: a.numerator * b.denominator + b.numerator * a.denominator,
    denominator: a.denominator * b.denominator,
  };
}

/** The engine's only rounding operation (ADR-0001): round UP to integer satang. */
export function ceilToSatang(value: Fraction): number {
  if (value.numerator < 0n) throw new Error("cannot round a negative amount");
  return Number((value.numerator + value.denominator - 1n) / value.denominator);
}
