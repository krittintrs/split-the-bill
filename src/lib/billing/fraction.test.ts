import { describe, expect, it } from "vitest";
import { add, ceilToSatang, floorToSatang, fraction, multiply, ZERO } from "./fraction";

describe("fraction", () => {
  it("defaults denominator to 1", () => {
    expect(fraction(5n)).toEqual({ numerator: 5n, denominator: 1n });
  });
  it("rejects non-positive denominator", () => {
    expect(() => fraction(1n, 0n)).toThrow("denominator must be positive");
  });
});

describe("multiply", () => {
  it("multiplies exactly", () => {
    // 3/2 × 4/5 = 12/10 (no reduction needed, BigInt never overflows)
    expect(multiply(fraction(3n, 2n), fraction(4n, 5n))).toEqual({
      numerator: 12n,
      denominator: 10n,
    });
  });
});

describe("add", () => {
  it("adds via cross multiplication", () => {
    // 1/2 + 1/3 = 5/6
    expect(add(fraction(1n, 2n), fraction(1n, 3n))).toEqual({
      numerator: 5n,
      denominator: 6n,
    });
  });
  it("adding ZERO keeps value", () => {
    expect(add(ZERO, fraction(7n, 3n))).toEqual({ numerator: 7n, denominator: 3n });
  });
});

describe("ceilToSatang", () => {
  it("rounds up a fractional amount", () => {
    expect(ceilToSatang(fraction(2500n, 3n))).toBe(834); // ADR-0001 example
  });
  it("keeps an exact amount unchanged", () => {
    expect(ceilToSatang(fraction(17910n, 1n))).toBe(17910);
  });
  it("rounds up fractions with large denominators exactly", () => {
    // 29425000/30000 = 980.8333… → 981 (no float drift)
    expect(ceilToSatang(fraction(29425000n, 30000n))).toBe(981);
  });
  it("rejects negative amounts", () => {
    expect(() => ceilToSatang(fraction(-1n, 2n))).toThrow("cannot round a negative amount");
  });
});

describe("floorToSatang", () => {
  it("rounds down a fractional amount", () => {
    expect(floorToSatang(fraction(2500n, 3n))).toBe(833); // ADR-0011 example
  });
  it("keeps an exact amount unchanged", () => {
    expect(floorToSatang(fraction(17910n, 1n))).toBe(17910);
  });
  it("rounds down fractions with large denominators exactly", () => {
    // 29425000/30000 = 980.8333… → 980 (no float drift)
    expect(floorToSatang(fraction(29425000n, 30000n))).toBe(980);
  });
  it("rejects negative amounts", () => {
    expect(() => floorToSatang(fraction(-1n, 2n))).toThrow("cannot round a negative amount");
  });
});
