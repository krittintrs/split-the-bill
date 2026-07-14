import { describe, expect, it } from "vitest";
import { formatSatang } from "./money";

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
