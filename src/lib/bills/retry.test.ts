import { describe, expect, it, vi } from "vitest";
import { isNetworkFetchError, withNetworkRetry } from "./retry";

describe("isNetworkFetchError", () => {
  it("matches postgrest-js's network-error wrapping", () => {
    expect(isNetworkFetchError(new Error("toggleTick (tick): TypeError: Failed to fetch"))).toBe(true);
  });
  it("does not match a real Postgres/RLS error", () => {
    expect(isNetworkFetchError(new Error("toggleTick (tick): new row violates row-level security policy"))).toBe(false);
  });
  it("does not match a non-Error throw", () => {
    expect(isNetworkFetchError("Failed to fetch")).toBe(false);
  });
});

describe("withNetworkRetry", () => {
  it("returns the result on first success without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withNetworkRetry(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries a network-only error and succeeds within the retry budget", async () => {
    vi.useFakeTimers();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("x: TypeError: Failed to fetch"))
      .mockResolvedValueOnce("ok");
    const promise = withNetworkRetry(fn);
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("throws after exhausting retries on a persistent network error", async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockRejectedValue(new Error("x: TypeError: Failed to fetch"));
    const promise = withNetworkRetry(fn, 2);
    promise.catch(() => {}); // avoid unhandled-rejection noise before the assertion below
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow("TypeError: Failed to fetch");
    expect(fn).toHaveBeenCalledTimes(3); // 1 original + 2 retries
    vi.useRealTimers();
  });

  it("never retries a non-network error", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("x: new row violates row-level security policy"));
    await expect(withNetworkRetry(fn)).rejects.toThrow("row-level security");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
