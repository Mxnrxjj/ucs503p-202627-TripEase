import { describe, expect, it } from "vitest";
import { centroid, haversineKm, isValidCoordinate } from "@/lib/services/feasibility/geo";

describe("isValidCoordinate", () => {
  it("accepts real coordinates", () => {
    expect(isValidCoordinate({ lat: 13.75, lng: 100.49 })).toBe(true);
    expect(isValidCoordinate({ lat: -33.87, lng: 151.21 })).toBe(true);
  });

  it("rejects missing, non-finite and out-of-range values", () => {
    expect(isValidCoordinate(null)).toBe(false);
    expect(isValidCoordinate(undefined)).toBe(false);
    expect(isValidCoordinate({ lat: NaN, lng: 10 })).toBe(false);
    expect(isValidCoordinate({ lat: 91, lng: 0 })).toBe(false);
    expect(isValidCoordinate({ lat: 0, lng: 181 })).toBe(false);
  });

  it("rejects null island, which is almost always a missing value", () => {
    expect(isValidCoordinate({ lat: 0, lng: 0 })).toBe(false);
  });
});

describe("haversineKm", () => {
  it("measures a short city hop", () => {
    // Grand Palace → Chatuchak Market, Bangkok: roughly 7-8 km apart.
    const km = haversineKm({ lat: 13.75, lng: 100.4913 }, { lat: 13.7998, lng: 100.5501 });
    expect(km).toBeGreaterThan(6);
    expect(km).toBeLessThan(10);
  });

  it("measures a long intercity hop", () => {
    // Bangkok → Phuket is a little under 700 km.
    const km = haversineKm({ lat: 13.75, lng: 100.4913 }, { lat: 7.8964, lng: 98.2963 });
    expect(km).toBeGreaterThan(600);
    expect(km).toBeLessThan(750);
  });

  it("returns zero for identical points", () => {
    const point = { lat: 41.9, lng: 12.5 };
    expect(haversineKm(point, { ...point })).toBe(0);
  });

  it("returns null rather than guessing when a coordinate is missing", () => {
    expect(haversineKm(null, { lat: 41.9, lng: 12.5 })).toBeNull();
    expect(haversineKm({ lat: 41.9, lng: 12.5 }, undefined)).toBeNull();
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 41.9, lng: 12.5 })).toBeNull();
  });

  it("is symmetric", () => {
    const a = { lat: 35.68, lng: 139.69 };
    const b = { lat: 35.01, lng: 135.77 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a)!, 6);
  });
});

describe("centroid", () => {
  it("averages the valid points", () => {
    const middle = centroid([
      { lat: 10, lng: 20 },
      { lat: 20, lng: 40 },
    ]);
    expect(middle).toEqual({ lat: 15, lng: 30 });
  });

  it("ignores invalid points instead of skewing towards them", () => {
    const middle = centroid([{ lat: 10, lng: 20 }, null, { lat: 0, lng: 0 }, { lat: 20, lng: 40 }]);
    expect(middle).toEqual({ lat: 15, lng: 30 });
  });

  it("returns null when nothing is mapped", () => {
    expect(centroid([null, undefined])).toBeNull();
  });
});
