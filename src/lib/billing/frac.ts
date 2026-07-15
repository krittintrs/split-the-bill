/** Exact rational arithmetic on BigInt. Internal to the billing engine. */
export interface Frac {
  num: bigint;
  den: bigint; // always > 0
}

export function frac(num: bigint, den: bigint = 1n): Frac {
  if (den <= 0n) throw new Error("denominator must be positive");
  return { num, den };
}

export const ZERO: Frac = { num: 0n, den: 1n };

export function mul(a: Frac, b: Frac): Frac {
  return { num: a.num * b.num, den: a.den * b.den };
}

export function add(a: Frac, b: Frac): Frac {
  return { num: a.num * b.den + b.num * a.den, den: a.den * b.den };
}

/** The engine's only rounding operation (ADR-0001): round UP to integer satang. */
export function ceilToSatang(a: Frac): number {
  if (a.num < 0n) throw new Error("cannot round a negative amount");
  return Number((a.num + a.den - 1n) / a.den);
}
