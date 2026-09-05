import { describe, expect, it, vi } from "vitest";
import { TtlCache } from "@/lib/services/places/cache";

describe("TtlCache", () => {
  it("returns a cached value within its TTL", () => {
    const cache = new TtlCache<string>(1000);
    cache.set("k", "v");
    expect(cache.get("k")).toBe("v");
  });

  it("drops a value once its TTL has passed", () => {
    vi.useFakeTimers();
    try {
      const cache = new TtlCache<string>(1000);
      cache.set("k", "v");
      vi.advanceTimersByTime(1001);
      expect(cache.get("k")).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("only calls the loader on a miss", async () => {
    const cache = new TtlCache<number>(1000);
    const load = vi.fn().mockResolvedValue(42);

    expect(await cache.wrap("k", load)).toBe(42);
    expect(await cache.wrap("k", load)).toBe(42);
    // The second call is what saves a billable upstream request.
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("evicts the least recently used entry at capacity", () => {
    const cache = new TtlCache<string>(10_000, 2);
    cache.set("a", "1");
    cache.set("b", "2");
    cache.get("a"); // refreshes "a", making "b" the oldest
    cache.set("c", "3");

    expect(cache.get("a")).toBe("1");
    expect(cache.get("c")).toBe("3");
    expect(cache.get("b")).toBeUndefined();
    expect(cache.size).toBe(2);
  });
});
