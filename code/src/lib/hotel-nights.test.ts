import { describe, expect, it } from "vitest";
import { maxNightsOf, nightsInCity } from "@/lib/hotel-nights";

describe("nightsInCity", () => {
  it("sleeps every night in a city the trip carries on from", () => {
    expect(nightsInCity(1, false)).toBe(1);
    expect(nightsInCity(4, false)).toBe(4);
  });

  it("sleeps one night fewer in the city the trip ends in", () => {
    expect(nightsInCity(4, true)).toBe(3);
    expect(nightsInCity(2, true)).toBe(1);
  });

  it("sleeps none when the trip ends the day it reaches the city", () => {
    expect(nightsInCity(1, true)).toBe(0);
  });

  it("never goes below none", () => {
    expect(nightsInCity(0, true)).toBe(0);
  });
});

describe("maxNightsOf", () => {
  const city = (id: string, order: number, dayCount: number) => ({ id, order, dayCount });

  it("lets a one-city trip have one night fewer than its days", () => {
    const only = city("a", 0, 3);
    expect(maxNightsOf(only, [only])).toBe(2);
  });

  it("gives every city but the last all its days, and the last one fewer", () => {
    const cities = [city("a", 0, 3), city("b", 1, 2), city("c", 2, 4)];
    expect(cities.map((c) => maxNightsOf(c, cities))).toEqual([3, 2, 3]);
  });

  it("goes by the order of the cities, not by where they are in the list", () => {
    const cities = [city("c", 2, 4), city("a", 0, 3), city("b", 1, 2)];
    expect(cities.map((c) => maxNightsOf(c, cities))).toEqual([3, 3, 2]);
  });

  it("adds up to one night fewer than the trip has days", () => {
    const cities = [city("a", 0, 3), city("b", 1, 2), city("c", 2, 4)];
    const total = cities.reduce((sum, c) => sum + maxNightsOf(c, cities), 0);
    expect(total).toBe(3 + 2 + 4 - 1);
  });

  it("allows none in a last city of one day", () => {
    const cities = [city("a", 0, 2), city("b", 1, 1)];
    expect(maxNightsOf(cities[1], cities)).toBe(0);
  });

  it("falls back to all its days for a city that is not in the list", () => {
    expect(maxNightsOf(city("x", 0, 3), [])).toBe(3);
    expect(maxNightsOf(city("x", 0, 3), [city("a", 0, 2)])).toBe(3);
  });
});
