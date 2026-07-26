import { describe, it, expect } from "vitest";
import { buildPromptPayPayload } from "./promptpay";

describe("buildPromptPayPayload", () => {
  it("phone number, ฿179.10", () => {
    expect(buildPromptPayPayload("0942490949", 17910)).toBe(
      "00020101021229370016A000000677010111011300669424909495802TH53037645406179.1063044786",
    );
  });
  it("phone number, ฿100.00", () => {
    expect(buildPromptPayPayload("0812345678", 10000)).toBe(
      "00020101021229370016A000000677010111011300668123456785802TH53037645406100.006304BB8A",
    );
  });
  it("national ID (13 digits), ฿214.20", () => {
    expect(buildPromptPayPayload("1234567890123", 21420)).toBe(
      "00020101021229370016A000000677010111021312345678901235802TH53037645406214.20630465AD",
    );
  });
  it("sub-baht amount ฿0.50 keeps two decimals", () => {
    expect(buildPromptPayPayload("0954539553", 50)).toBe(
      "00020101021229370016A000000677010111011300669545395535802TH530376454040.5063042DFF",
    );
  });
  it("static QR (no amount) for the profile preview — POI 11, no amount tag", () => {
    expect(buildPromptPayPayload("0942490949")).toBe(
      "00020101021129370016A000000677010111011300669424909495802TH530376463040850",
    );
  });
  it("rejects invalid id length", () => {
    expect(() => buildPromptPayPayload("12345", 100)).toThrow();
  });
  it("rejects non-positive amount", () => {
    expect(() => buildPromptPayPayload("0812345678", 0)).toThrow();
  });
});
