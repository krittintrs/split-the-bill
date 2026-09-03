import { describe, expect, it } from "vitest";
import { formatAmount, formatMinorUnits, formatSatang } from "./money";

describe("formatSatang", () => {
  it("formats satang as baht with two decimals", () => {
    expect(formatSatang(18720)).toBe("฿187.20");
  });
  it("groups thousands", () => {
    expect(formatSatang(123456789)).toBe("฿1,234,567.89");
  });
  it("formats zero", () => {
    expect(formatSatang(0)).toBe("฿0.00");
  });
  it("rejects non-integer input", () => {
    expect(() => formatSatang(1.5)).toThrow("satang must be an integer");
  });
});

describe("formatMinorUnits", () => {
  it("formats with the given currency code and 2 decimal places", () => {
    expect(formatMinorUnits(22000, "TWD")).toBe("TWD 220.00");
    expect(formatMinorUnits(5, "TWD")).toBe("TWD 0.05");
    expect(formatMinorUnits(0, "USD")).toBe("USD 0.00");
  });
  it("throws on a non-integer amount", () => {
    expect(() => formatMinorUnits(100.5, "TWD")).toThrow("integer");
  });
});

describe("formatAmount", () => {
  it("formats the same as formatSatang/formatMinorUnits, without a currency prefix", () => {
    expect(formatAmount(18720)).toBe("187.20");
    expect(formatAmount(46292)).toBe("462.92");
    expect(formatAmount(0)).toBe("0.00");
  });
  it("throws on a non-integer amount", () => {
    expect(() => formatAmount(100.5)).toThrow("integer");
  });
});
