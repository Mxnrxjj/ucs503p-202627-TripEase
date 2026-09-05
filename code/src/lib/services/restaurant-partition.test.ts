import { describe, expect, it } from "vitest";
import { partitionRestaurants } from "@/lib/services/itinerary-generator";
import type { Place } from "@/types/place";

function place(name: string, mealTypes: Place["mealTypes"] = null): Place {
  return {
    id: `test:${name}`,
    type: "restaurant",
    name,
    description: "",
    category: "food",
    styleTags: [],
    location: { lat: 41.9, lng: 12.5 },
    address: null,
    city: "Rome",
    country: "Italy",
    imageUrl: null,
    rating: { value: 4.5, count: 100 },
    price: { amount: 800, currency: "INR", isEstimate: true },
    durationMinutes: 60,
    mealTypes,
    source: { provider: "google", providerPlaceId: `pid-${name}`, sourceUrl: null, sourceName: "Google Maps" },
    isDemoData: false,
  };
}

describe("partitionRestaurants", () => {
  it("honours meal tags when the provider supplies them", () => {
    // Curated mock content is tagged, so the demo itinerary is unchanged.
    const pools = partitionRestaurants([
      place("Hotel breakfast", ["breakfast"]),
      place("Trattoria", ["lunch"]),
      place("Osteria", ["dinner"]),
      place("Rooftop", ["dinner"]),
    ]);

    expect(pools.breakfast.map((p) => p.name)).toEqual(["Hotel breakfast"]);
    expect(pools.lunch.map((p) => p.name)).toEqual(["Trattoria"]);
    expect(pools.dinner.map((p) => p.name)).toEqual(["Osteria", "Rooftop"]);
  });

  it("deals untagged live results into disjoint pools", () => {
    const pools = partitionRestaurants(
      ["a", "b", "c", "d", "e", "f"].map((n) => place(n)),
    );

    expect(pools.breakfast.map((p) => p.name)).toEqual(["a", "d"]);
    expect(pools.lunch.map((p) => p.name)).toEqual(["b", "e"]);
    expect(pools.dinner.map((p) => p.name)).toEqual(["c", "f"]);

    // Disjointness is what stops one restaurant being all three meals in a day.
    const all = [...pools.breakfast, ...pools.lunch, ...pools.dinner].map((p) => p.name);
    expect(new Set(all).size).toBe(all.length);
  });

  it("keeps real place identity intact", () => {
    const pools = partitionRestaurants([place("Tonnarello")]);
    const picked = pools.lunch[0];
    expect(picked.source.providerPlaceId).toBe("pid-Tonnarello");
    expect(picked.location).toEqual({ lat: 41.9, lng: 12.5 });
    expect(picked.rating?.value).toBe(4.5);
    expect(picked.isDemoData).toBe(false);
  });

  it("falls back to the full list rather than leaving a meal with nothing", () => {
    // Only two results: one pool would otherwise be empty.
    const pools = partitionRestaurants([place("only-a"), place("only-b")]);
    expect(pools.breakfast.length).toBeGreaterThan(0);
    expect(pools.lunch.length).toBeGreaterThan(0);
    expect(pools.dinner.length).toBeGreaterThan(0);
  });

  it("survives an empty result set without throwing", () => {
    const pools = partitionRestaurants([]);
    expect(pools).toEqual({ breakfast: [], lunch: [], dinner: [] });
  });

  it("mixes tagged and untagged results without losing either", () => {
    const pools = partitionRestaurants([
      place("Tagged breakfast", ["breakfast"]),
      place("live-1"),
      place("live-2"),
      place("live-3"),
    ]);
    expect(pools.breakfast.map((p) => p.name)).toContain("Tagged breakfast");
    const everything = [...pools.breakfast, ...pools.lunch, ...pools.dinner].map((p) => p.name);
    for (const name of ["Tagged breakfast", "live-1", "live-2", "live-3"]) {
      expect(everything).toContain(name);
    }
  });
});
