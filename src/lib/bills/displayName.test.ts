import { describe, expect, it } from "vitest";
import { resolveDisplayName } from "./displayName";

describe("resolveDisplayName", () => {
  it("prefers the stored display name", () => {
    expect(
      resolveDisplayName("ต้น", { fullName: "Krittin T", email: "k@example.com" }),
    ).toBe("ต้น");
  });

  it("falls back to the Google full name", () => {
    expect(resolveDisplayName("", { fullName: "Krittin T", email: "k@example.com" })).toBe(
      "Krittin T",
    );
  });

  it("falls back to name when full_name is absent", () => {
    expect(resolveDisplayName(null, { name: "Krittin", email: "k@example.com" })).toBe("Krittin");
  });

  it("falls back to the email local part", () => {
    expect(resolveDisplayName(undefined, { email: "krittin@example.com" })).toBe("krittin");
  });

  it("never returns empty", () => {
    expect(resolveDisplayName("", {})).toBe("ฉัน");
    expect(resolveDisplayName("   ", { fullName: "  ", email: "  " })).toBe("ฉัน");
  });

  it("trims, because the name feeds a unique (organizer_id, name) index", () => {
    expect(resolveDisplayName("  ต้น  ", {})).toBe("ต้น");
  });
});
