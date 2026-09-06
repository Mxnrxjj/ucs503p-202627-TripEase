import { describe, expect, it } from "vitest";
import { clusterByDay, nearestNeighbourOrder } from "@/lib/services/feasibility/ordering";
import type { LatLng, Place } from "@/types/place";

function place(id: string, location: LatLng | null): Place {
  return {
    id,
    type: "attraction",
    name: id,
    description: "",
    category: "sightseeing",
    styleTags: [],
    location,
    address: null,
    city: null,
    country: null,
    imageUrl: null,
    rating: null,
    price: null,
    durationMinutes: null,
    mealTypes: null,
    source: { provider: "mock", sourceUrl: null, sourceName: null },
    isDemoData: true,
  };
}

const ids = (places: Place[]) => places.map((p) => p.id);

describe("nearestNeighbourOrder", () => {
  it("visits the closest place first", () => {
    const start = { lat: 13.75, lng: 100.5 };
    const ordered = nearestNeighbourOrder(
      [
        place("far", { lat: 13.9, lng: 100.7 }),
        place("near", { lat: 13.755, lng: 100.505 }),
        place("middle", { lat: 13.8, lng: 100.56 }),
      ],
      start,
    );
    expect(ids(ordered)).toEqual(["near", "middle", "far"]);
  });

  it("chains onwards from each stop, not from the hotel", () => {
    // B is closest to the start; C is far from the start but next to B, so a
    // sensible route is A-adjacent hopping rather than repeated out-and-back.
    const ordered = nearestNeighbourOrder(
      [
        place("east", { lat: 0, lng: 0.6 }),
        place("east-neighbour", { lat: 0, lng: 0.65 }),
        place("west", { lat: 0, lng: -0.4 }),
      ],
      { lat: 0, lng: 0.5 },
    );
    expect(ids(ordered)).toEqual(["east", "east-neighbour", "west"]);
  });

  it("shortens the total route compared with a bad ordering", () => {
    const start = { lat: 10, lng: 20 };
    const points = [
      place("a", { lat: 10, lng: 20.9 }),
      place("b", { lat: 10, lng: 20.1 }),
      place("c", { lat: 10, lng: 20.5 }),
    ];
    expect(ids(nearestNeighbourOrder(points, start))).toEqual(["b", "c", "a"]);
  });

  it("treats a (0,0) starting point as unknown rather than as the Atlantic", () => {
    // Null island is a missing-value default, not a hotel. Ordering from it
    // would drag every route towards west Africa.
    const points = [place("a", { lat: 10, lng: 20.9 }), place("b", { lat: 10, lng: 20.1 })];
    expect(ids(nearestNeighbourOrder(points, { lat: 0, lng: 0 }))).toEqual(["a", "b"]);
  });

  it("keeps unmapped places at the end instead of dropping or guessing them", () => {
    const ordered = nearestNeighbourOrder(
      [place("unmapped", null), place("mapped", { lat: 0, lng: 0.1 })],
      { lat: 0, lng: 0 },
    );
    expect(ids(ordered)).toEqual(["mapped", "unmapped"]);
    expect(ordered).toHaveLength(2);
  });

  it("preserves the given order when nothing is mapped", () => {
    const ordered = nearestNeighbourOrder([place("a", null), place("b", null)], null);
    expect(ids(ordered)).toEqual(["a", "b"]);
  });

  it("still orders places when the starting point is unknown", () => {
    const ordered = nearestNeighbourOrder(
      [place("a", { lat: 0, lng: 0.5 }), place("b", { lat: 0, lng: 0.6 })],
      null,
    );
    expect(ordered).toHaveLength(2);
  });

  it("handles an empty list", () => {
    expect(nearestNeighbourOrder([], { lat: 0, lng: 0 })).toEqual([]);
  });
});

describe("clusterByDay", () => {
  it("keeps geographically close places on the same day", () => {
    // Two tight clusters ~100km apart: one day should be all north, the other
    // all south, rather than each day containing half of both.
    const north = [
      place("n1", { lat: 10.0, lng: 20.0 }),
      place("n2", { lat: 10.01, lng: 20.01 }),
    ];
    const south = [
      place("s1", { lat: 9.0, lng: 20.0 }),
      place("s2", { lat: 9.01, lng: 20.01 }),
    ];
    const clusters = clusterByDay([north[0], south[0], north[1], south[1]], 2, 2);

    expect(clusters).toHaveLength(2);
    for (const cluster of clusters) {
      const prefixes = new Set(cluster.map((p) => p.id[0]));
      expect(prefixes.size).toBe(1);
    }
  });

  it("uses every place exactly once", () => {
    const places = Array.from({ length: 7 }, (_, i) =>
      place(`p${i}`, { lat: 10 + i * 0.1, lng: 20 + i * 0.1 }),
    );
    const clusters = clusterByDay(places, 3, 2);
    const flat = clusters.flat();
    expect(flat).toHaveLength(7);
    expect(new Set(ids(flat)).size).toBe(7);
  });

  it("returns one group per day, even when there aren't enough places", () => {
    const clusters = clusterByDay([place("only", { lat: 10, lng: 20 })], 3, 2);
    expect(clusters).toHaveLength(3);
    expect(clusters.flat()).toHaveLength(1);
  });

  it("returns empty days rather than failing when there are no places", () => {
    expect(clusterByDay([], 2, 2)).toEqual([[], []]);
  });

  it("still distributes places that have no coordinates", () => {
    const clusters = clusterByDay([place("a", null), place("b", null), place("c", null)], 2, 2);
    expect(clusters).toHaveLength(2);
    expect(clusters.flat()).toHaveLength(3);
  });

  it("mixes mapped and unmapped places without losing any", () => {
    const clusters = clusterByDay(
      [place("a", { lat: 10, lng: 20 }), place("b", null), place("c", { lat: 10.1, lng: 20.1 })],
      2,
      2,
    );
    expect(new Set(ids(clusters.flat()))).toEqual(new Set(["a", "b", "c"]));
  });

  it("returns nothing for a zero-day city", () => {
    expect(clusterByDay([place("a", { lat: 10, lng: 20 })], 0, 2)).toEqual([]);
  });
});
