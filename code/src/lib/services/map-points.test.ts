import { describe, expect, it } from "vitest";
import {
  buildMapPoints,
  countUnmappablePlaces,
  filterMapPoints,
  routeForDay,
} from "@/lib/services/map-points";
import type { Activity, City, Hotel, TripDay } from "@/types/itinerary";
import type { Trip } from "@/types/trip";

function activity(overrides: Partial<Activity> & { id: string }): Activity {
  return {
    name: "Activity",
    category: "sightseeing",
    time: "10:00",
    durationMinutes: 60,
    description: "",
    estimatedCost: 100,
    currency: "INR",
    referenceUrl: null,
    isDemoData: true,
    ...overrides,
  };
}

function hotel(overrides: Partial<Hotel> = {}): Hotel {
  return {
    name: "Hotel",
    pricePerNight: 3000,
    currency: "INR",
    nights: 2,
    referenceUrl: null,
    isDemoData: true,
    ...overrides,
  };
}

function makeTrip(): Trip {
  const cities: City[] = [
    {
      id: "city-a",
      name: "Bangkok",
      country: "Thailand",
      order: 0,
      startDate: "2027-06-12",
      endDate: "2027-06-13",
      dayCount: 2,
      hotel: hotel({ location: { lat: 13.75, lng: 100.5 } }),
      imageQuery: "",
    },
    {
      id: "city-b",
      name: "Phuket",
      country: "Thailand",
      order: 1,
      startDate: "2027-06-14",
      endDate: "2027-06-14",
      dayCount: 1,
      hotel: hotel(),
      imageQuery: "",
    },
  ];

  const days: TripDay[] = [
    {
      id: "day-1",
      dayNumber: 1,
      date: "2027-06-12",
      cityId: "city-a",
      activities: [
        activity({ id: "a1", location: { lat: 13.75, lng: 100.49 } }),
        activity({ id: "a2" }), // no coordinates — must not be mapped
        activity({ id: "a3", location: { lat: 13.74, lng: 100.49 } }),
      ],
    },
    {
      id: "day-2",
      dayNumber: 2,
      date: "2027-06-13",
      cityId: "city-a",
      activities: [activity({ id: "b1", location: { lat: 13.8, lng: 100.55 } })],
    },
    {
      id: "day-3",
      dayNumber: 3,
      date: "2027-06-14",
      cityId: "city-b",
      activities: [activity({ id: "c1", location: { lat: 7.89, lng: 98.29 } })],
    },
  ];

  return {
    id: "trip-1",
    ownerId: "user-1",
    status: "ready",
    destination: "Thailand",
    title: "Thailand Adventure",
    startDate: "2027-06-12",
    endDate: "2027-06-14",
    dayCount: 3,
    currency: "INR",
    travelers: 2,
    travelerType: "couple",
    preferences: ["culture"],
    cities,
    days,
    budget: {
      currency: "INR",
      total: 100000,
      estimatedTotal: 50000,
      categories: {
        flights: 0,
        hotels: 0,
        food: 0,
        activities: 0,
        transport: 0,
        shopping: 0,
        misc: 0,
        buffer: 0,
      },
    },
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

describe("buildMapPoints", () => {
  it("maps only places that have real coordinates", () => {
    const points = buildMapPoints(makeTrip());
    const ids = points.map((p) => p.id);
    expect(ids).toContain("a1");
    expect(ids).toContain("a3");
    // No coordinates on this activity, and none invented for it.
    expect(ids).not.toContain("a2");
  });

  it("includes a city hotel as its own point when it has a location", () => {
    const points = buildMapPoints(makeTrip());
    const hotelPoint = points.find((p) => p.id === "hotel:city-a");
    expect(hotelPoint).toBeDefined();
    expect(hotelPoint?.kind).toBe("hotel");
    // The second city's hotel has no coordinates, so it isn't mapped.
    expect(points.find((p) => p.id === "hotel:city-b")).toBeUndefined();
  });

  it("numbers activities by their position within the day", () => {
    const points = buildMapPoints(makeTrip());
    expect(points.find((p) => p.id === "a1")?.order).toBe(1);
    // a2 is skipped for the map but still occupies position 2 in the day.
    expect(points.find((p) => p.id === "a3")?.order).toBe(3);
  });
});

describe("filterMapPoints", () => {
  const points = buildMapPoints(makeTrip());

  it("returns everything in 'all' mode", () => {
    expect(filterMapPoints(points, { mode: "all", cityId: null, dayId: null })).toHaveLength(points.length);
  });

  it("keeps only the chosen city", () => {
    const filtered = filterMapPoints(points, { mode: "city", cityId: "city-b", dayId: null });
    expect(filtered.every((p) => p.cityId === "city-b")).toBe(true);
    expect(filtered).toHaveLength(1);
  });

  it("keeps a day plus its city's hotel", () => {
    const filtered = filterMapPoints(points, { mode: "day", cityId: "city-a", dayId: "day-2" });
    expect(filtered.map((p) => p.id).sort()).toEqual(["b1", "hotel:city-a"]);
  });
});

describe("routeForDay", () => {
  it("orders a day's points by their itinerary position", () => {
    const points = buildMapPoints(makeTrip());
    expect(routeForDay(points, "day-1").map((p) => p.id)).toEqual(["a1", "a3"]);
  });

  it("is empty without a day", () => {
    expect(routeForDay(buildMapPoints(makeTrip()), null)).toEqual([]);
  });
});

describe("countUnmappablePlaces", () => {
  it("counts activities and hotels with no coordinates", () => {
    // One activity (a2) and one hotel (city-b).
    expect(countUnmappablePlaces(makeTrip())).toBe(2);
  });
});
