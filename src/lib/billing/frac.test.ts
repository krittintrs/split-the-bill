import { describe, expect, it } from "vitest";
import { add, ceilToSatang, frac, mul, ZERO } from "./frac";

describe("frac", () => {
  it("defaults denominator to 1", () => {
    expect(frac(5n)).toEqual({ num: 5n, den: 1n });
  });
  it("rejects non-positive denominator", () => {
    expect(() => frac(1n, 0n)).toThrow("denominator must be positive");
  });
});

describe("mul", () => {
  it("multiplies exactly", () => {
    // 3/2 × 4/5 = 12/10 (no reduction needed, BigInt never overflows)
    expect(mul(frac(3n, 2n), frac(4n, 5n))).toEqual({ num: 12n, den: 10n });
  });
});

describe("add", () => {
  it("adds via cross multiplication", () => {
    // 1/2 + 1/3 = 5/6
    expect(add(frac(1n, 2n), frac(1n, 3n))).toEqual({ num: 5n, den: 6n });
  });
  it("adding ZERO keeps value", () => {
    expect(add(ZERO, frac(7n, 3n))).toEqual({ num: 7n, den: 3n });
  });
});

describe("ceilToSatang", () => {
  it("rounds up a fractional amount", () => {
    expect(ceilToSatang(frac(2500n, 3n))).toBe(834); // ADR-0001 example
  });
  it("keeps an exact amount unchanged", () => {
    expect(ceilToSatang(frac(17910n, 1n))).toBe(17910);
  });
  it("rounds up fractions with large denominators exactly", () => {
    // 29425000/30000 = 980.8333… → 981 (no float drift)
    expect(ceilToSatang(frac(29425000n, 30000n))).toBe(981);
  });
  it("rejects negative amounts", () => {
    expect(() => ceilToSatang(frac(-1n, 2n))).toThrow("cannot round a negative amount");
  });
});
