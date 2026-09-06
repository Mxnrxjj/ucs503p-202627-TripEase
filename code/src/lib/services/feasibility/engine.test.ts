import { describe, expect, it } from "vitest";
import {
  analyzeTrip,
  AVAILABLE_MINUTES,
  buildDaySegments,
  cityAnchor,
  evaluateDay,
} from "@/lib/services/feasibility/engine";
import { HeuristicTravelTimeProvider } from "@/lib/services/feasibility/travel-time";
import type { Activity, City, Hotel, TripDay } from "@/types/itinerary";
import type { LatLng } from "@/types/place";
import type { Trip } from "@/types/trip";

const provider = new HeuristicTravelTimeProvider();

const BANGKOK_HOTEL: LatLng = { lat: 13.7563, lng: 100.5018 };
const PHUKET_HOTEL: LatLng = { lat: 7.8804, lng: 98.3923 };

function activity(overrides: Partial<Activity> & { id: string }): Activity {
  return {
    name: overrides.id,
    category: "sightseeing",
    time: "10:00",
    durationMinutes: 90,
    description: "",
    estimatedCost: 500,
    currency: "INR",
    referenceUrl: null,
    isDemoData: false,
    ...overrides,
  };
}

function hotel(overrides: Partial<Hotel> = {}): Hotel {
  return {
    name: "Hotel",
    pricePerNight: 4000,
    currency: "INR",
    nights: 2,
    referenceUrl: null,
    isDemoData: false,
    ...overrides,
  };
}

function city(overrides: Partial<City> & { id: string; name: string }): City {
  return {
    country: "Thailand",
    order: 0,
    startDate: "2027-06-12",
    endDate: "2027-06-13",
    dayCount: 2,
    hotel: hotel(),
    imageQuery: "",
    ...overrides,
  };
}

function day(overrides: Partial<TripDay> & { id: string; cityId: string }): TripDay {
  return {
    dayNumber: 1,
    date: "2027-06-12",
    activities: [],
    ...overrides,
  };
}

function makeTrip(cities: City[], days: TripDay[]): Trip {
  return {
    id: "trip-1",
    ownerId: "user-1",
    status: "ready",
    destination: "Thailand",
    title: "Thailand trip",
    startDate: "2027-06-12",
    endDate: "2027-06-16",
    dayCount: days.length,
    currency: "INR",
    travelers: 2,
    travelerType: "couple",
    preferences: ["beaches"],
    cities,
    days,
    budget: {
      currency: "INR",
      total: 150000,
      estimatedTotal: 150000,
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
    createdAt: new Date("2027-01-01"),
    updatedAt: new Date("2027-01-01"),
  };
}

describe("cityAnchor", () => {
  it("uses the hotel when it has coordinates", () => {
    const bangkok = city({ id: "c1", name: "Bangkok", hotel: hotel({ location: BANGKOK_HOTEL }) });
    expect(cityAnchor(bangkok, [])).toEqual(BANGKOK_HOTEL);
  });

  it("falls back to the centre of the city's mapped places", () => {
    const bangkok = city({ id: "c1", name: "Bangkok" });
    const days = [
      day({
        id: "d1",
        cityId: "c1",
        activities: [
          activity({ id: "a", location: { lat: 10, lng: 20 } }),
          activity({ id: "b", location: { lat: 20, lng: 40 } }),
        ],
      }),
    ];
    expect(cityAnchor(bangkok, days)).toEqual({ lat: 15, lng: 30 });
  });

  it("returns null rather than inventing a city centre", () => {
    expect(cityAnchor(city({ id: "c1", name: "Nowhere" }), [])).toBeNull();
  });
});

describe("buildDaySegments", () => {
  const bangkok = city({ id: "c1", name: "Bangkok", hotel: hotel({ location: BANGKOK_HOTEL }) });
  const anchors = new Map<string, LatLng | null>([
    ["c1", BANGKOK_HOTEL],
    ["c2", PHUKET_HOTEL],
  ]);

  it("travels from the hotel to the first stop and back at the end", () => {
    const today = day({
      id: "d1",
      cityId: "c1",
      activities: [
        activity({ id: "a1", location: { lat: 13.7466, lng: 100.493 } }),
        activity({ id: "a2", location: { lat: 13.7649, lng: 100.5383 } }),
      ],
    });

    const segments = buildDaySegments(
      { day: today, city: bangkok, previousCity: null, isFirstDayOfCity: true, cityAnchors: anchors },
      provider,
    );

    expect(segments.map((s) => s.type)).toEqual(["local-transfer", "local-transfer", "local-transfer"]);
    expect(segments[0].fromPlaceId).toBe("hotel:c1");
    expect(segments[0].toPlaceId).toBe("a1");
    expect(segments[1].fromPlaceId).toBe("a1");
    expect(segments[1].toPlaceId).toBe("a2");
    expect(segments[2].toPlaceId).toBe("hotel:c1");
    expect(segments.every((s) => s.estimatedDurationMinutes > 0)).toBe(true);
  });

  it("creates an explicit city transfer on the first day in a new city", () => {
    const phuket = city({
      id: "c2",
      name: "Phuket",
      order: 1,
      hotel: hotel({ location: PHUKET_HOTEL }),
    });
    const arrival = day({
      id: "d3",
      dayNumber: 3,
      cityId: "c2",
      activities: [
        activity({
          id: "t1",
          category: "transport",
          name: "Bangkok to Phuket",
          durationMinutes: 0,
          estimatedCost: 11000,
        }),
        activity({ id: "a3", location: { lat: 7.8, lng: 98.3 } }),
      ],
    });

    const segments = buildDaySegments(
      { day: arrival, city: phuket, previousCity: bangkok, isFirstDayOfCity: true, cityAnchors: anchors },
      provider,
    );

    const transfer = segments.find((s) => s.type === "city-transfer");
    expect(transfer).toBeDefined();
    expect(transfer!.fromCity).toBe("Bangkok");
    expect(transfer!.toCity).toBe("Phuket");
    expect(transfer!.mode).toBe("flight");
    expect(transfer!.distanceKm!).toBeGreaterThan(600);
    expect(transfer!.estimatedDurationMinutes).toBeGreaterThan(180);
    expect(transfer!.isEstimated).toBe(true);
  });

  it("reuses the transport activity's cost instead of inventing a second one", () => {
    const phuket = city({ id: "c2", name: "Phuket", order: 1, hotel: hotel({ location: PHUKET_HOTEL }) });
    const arrival = day({
      id: "d3",
      cityId: "c2",
      activities: [
        activity({ id: "t1", category: "transport", estimatedCost: 11000, currency: "INR", durationMinutes: 0 }),
      ],
    });

    const [transfer] = buildDaySegments(
      { day: arrival, city: phuket, previousCity: bangkok, isFirstDayOfCity: true, cityAnchors: anchors },
      provider,
    );
    expect(transfer.estimatedCost).toBe(11000);
    expect(transfer.currency).toBe("INR");
  });

  it("does not repeat the transfer on later days in the same city", () => {
    const phuket = city({ id: "c2", name: "Phuket", order: 1, hotel: hotel({ location: PHUKET_HOTEL }) });
    const secondDay = day({
      id: "d4",
      dayNumber: 4,
      cityId: "c2",
      activities: [activity({ id: "a4", location: { lat: 7.8, lng: 98.3 } })],
    });

    const segments = buildDaySegments(
      { day: secondDay, city: phuket, previousCity: bangkok, isFirstDayOfCity: false, cityAnchors: anchors },
      provider,
    );
    expect(segments.some((s) => s.type === "city-transfer")).toBe(false);
  });

  it("skips travel to places with no coordinates rather than guessing it", () => {
    const today = day({
      id: "d1",
      cityId: "c1",
      activities: [
        activity({ id: "mapped", location: { lat: 13.7466, lng: 100.493 } }),
        activity({ id: "unmapped" }),
      ],
    });

    const segments = buildDaySegments(
      { day: today, city: bangkok, previousCity: null, isFirstDayOfCity: false, cityAnchors: anchors },
      provider,
    );
    expect(segments.some((s) => s.toPlaceId === "unmapped")).toBe(false);
    expect(segments.every((s) => s.distanceKm !== null)).toBe(true);
  });

  it("produces no local travel when nothing in the day is mapped", () => {
    const today = day({
      id: "d1",
      cityId: "c1",
      activities: [activity({ id: "a1" }), activity({ id: "a2" })],
    });

    const segments = buildDaySegments(
      {
        day: today,
        city: city({ id: "c1", name: "Bangkok" }),
        previousCity: null,
        isFirstDayOfCity: false,
        cityAnchors: new Map(),
      },
      provider,
    );
    expect(segments).toEqual([]);
  });
});

describe("evaluateDay", () => {
  it("accepts a normal sightseeing day", () => {
    const today = day({
      id: "d1",
      cityId: "c1",
      activities: [
        activity({ id: "a1", category: "food", durationMinutes: 60 }),
        activity({ id: "a2", durationMinutes: 120 }),
        activity({ id: "a3", category: "food", durationMinutes: 90 }),
      ],
    });

    const result = evaluateDay(today, []);
    expect(result.feasible).toBe(true);
    expect(result.activityMinutes).toBe(270);
    expect(result.bufferMinutes).toBe(60);
    expect(result.totalMinutes).toBe(330);
    expect(result.availableMinutes).toBe(AVAILABLE_MINUTES);
    expect(result.warnings.some((w) => w.severity === "problem")).toBe(false);
  });

  it("flags a day that cannot physically happen", () => {
    const today = day({
      id: "d1",
      cityId: "c1",
      activities: Array.from({ length: 6 }, (_, i) =>
        activity({ id: `a${i}`, category: "adventure", durationMinutes: 180 }),
      ),
    });

    const result = evaluateDay(today, []);
    expect(result.feasible).toBe(false);
    expect(result.totalMinutes).toBeGreaterThan(result.availableMinutes);
    const problem = result.warnings.find((w) => w.severity === "problem");
    expect(problem?.code).toBe("over-capacity");
  });

  it("counts travel against the day, not just time spent at places", () => {
    const today = day({
      id: "d1",
      cityId: "c1",
      activities: [activity({ id: "a1", durationMinutes: 300 })],
    });

    const withoutTravel = evaluateDay(today, []);
    const withTravel = evaluateDay(today, [
      {
        id: "s1",
        type: "city-transfer",
        fromPlaceId: null,
        toPlaceId: null,
        fromCity: "Bangkok",
        toCity: "Phuket",
        distanceKm: 690,
        estimatedDurationMinutes: 420,
        mode: "flight",
        estimatedCost: null,
        currency: null,
        isEstimated: true,
      },
    ]);

    expect(withoutTravel.feasible).toBe(true);
    expect(withTravel.feasible).toBe(false);
    expect(withTravel.travelMinutes).toBe(420);
  });

  it("mentions a city transfer and a long travel day", () => {
    const today = day({
      id: "d1",
      cityId: "c2",
      activities: [activity({ id: "a1", durationMinutes: 60 })],
    });

    const result = evaluateDay(today, [
      {
        id: "s1",
        type: "city-transfer",
        fromPlaceId: null,
        toPlaceId: null,
        fromCity: "Bangkok",
        toCity: "Phuket",
        distanceKm: 690,
        estimatedDurationMinutes: 240,
        mode: "flight",
        estimatedCost: 11000,
        currency: "INR",
        isEstimated: true,
      },
    ]);

    const codes = result.warnings.map((w) => w.code);
    expect(codes).toContain("city-transfer");
    expect(codes).toContain("long-travel");
    expect(result.feasible).toBe(true);
    // The wording must not imply a routed journey.
    expect(result.warnings.find((w) => w.code === "city-transfer")!.message).toContain("estimated");
  });

  it("warns when a day only just fits", () => {
    const today = day({
      id: "d1",
      cityId: "c1",
      // 640 activity + 40 buffer = 680, leaving 40 minutes of the 720.
      activities: [
        activity({ id: "a1", durationMinutes: 640 }),
      ],
    });

    const result = evaluateDay(today, []);
    expect(result.feasible).toBe(true);
    expect(result.warnings.map((w) => w.code)).toContain("tight-schedule");
  });

  it("says when places are missing locations, without treating it as a failure", () => {
    const today = day({
      id: "d1",
      cityId: "c1",
      activities: [activity({ id: "a1" }), activity({ id: "a2", location: { lat: 13.75, lng: 100.5 } })],
    });

    const result = evaluateDay(today, []);
    const warning = result.warnings.find((w) => w.code === "missing-coordinates");
    expect(warning?.severity).toBe("info");
    expect(result.feasible).toBe(true);
  });

  it("flags a stop that isn't plausibly in the city it's filed under", () => {
    // A live place search for "beaches in Bangkok" really does return beaches
    // hundreds of kilometres down the coast. Nothing else in the day can catch
    // that when it's the only stop with coordinates.
    const today = day({
      id: "d1",
      cityId: "c1",
      activities: [activity({ id: "a1", name: "Shark Bay", location: { lat: 10.064, lng: 99.832 } })],
    });

    const result = evaluateDay(today, [], { cityAnchor: BANGKOK_HOTEL, cityName: "Bangkok" });
    const warning = result.warnings.find((w) => w.code === "far-from-city");
    expect(warning?.severity).toBe("warning");
    expect(warning?.message).toContain("Shark Bay");
    expect(warning?.message).toContain("Bangkok");
    // Still possible in principle — it's the traveller's call, not an error.
    expect(result.feasible).toBe(true);
  });

  it("does not flag a genuine day trip out of the city", () => {
    // Ayutthaya is ~80 km from Bangkok and a completely normal excursion.
    const today = day({
      id: "d1",
      cityId: "c1",
      activities: [activity({ id: "a1", name: "Ayutthaya", location: { lat: 14.3532, lng: 100.5689 } })],
    });

    const result = evaluateDay(today, [], { cityAnchor: BANGKOK_HOTEL, cityName: "Bangkok" });
    expect(result.warnings.some((w) => w.code === "far-from-city")).toBe(false);
  });

  it("says nothing about distance from a city it can't locate", () => {
    const today = day({
      id: "d1",
      cityId: "c1",
      activities: [activity({ id: "a1", location: { lat: 10.064, lng: 99.832 } })],
    });
    expect(evaluateDay(today, [], { cityAnchor: null }).warnings.some((w) => w.code === "far-from-city")).toBe(
      false,
    );
  });

  it("treats an empty day as feasible with no buffer", () => {
    const result = evaluateDay(day({ id: "d1", cityId: "c1" }), []);
    expect(result.feasible).toBe(true);
    expect(result.bufferMinutes).toBe(0);
    expect(result.totalMinutes).toBe(0);
  });

  it("honours a custom available window", () => {
    const today = day({
      id: "d1",
      cityId: "c1",
      activities: [activity({ id: "a1", durationMinutes: 200 })],
    });
    expect(evaluateDay(today, [], { availableMinutes: 600 }).feasible).toBe(true);
    expect(evaluateDay(today, [], { availableMinutes: 120 }).feasible).toBe(false);
  });
});

describe("analyzeTrip", () => {
  function thailandTrip(): Trip {
    const cities = [
      city({
        id: "c1",
        name: "Bangkok",
        order: 0,
        dayCount: 2,
        hotel: hotel({ location: BANGKOK_HOTEL }),
      }),
      city({
        id: "c2",
        name: "Phuket",
        order: 1,
        dayCount: 2,
        startDate: "2027-06-14",
        endDate: "2027-06-15",
        hotel: hotel({ location: PHUKET_HOTEL }),
      }),
    ];

    const days = [
      day({
        id: "d1",
        dayNumber: 1,
        cityId: "c1",
        activities: [
          activity({ id: "a1", category: "food", durationMinutes: 60, location: { lat: 13.7466, lng: 100.493 } }),
          activity({ id: "a2", durationMinutes: 120, location: { lat: 13.7649, lng: 100.5383 } }),
        ],
      }),
      day({
        id: "d2",
        dayNumber: 2,
        date: "2027-06-13",
        cityId: "c1",
        activities: [activity({ id: "a3", durationMinutes: 90, location: { lat: 13.7998, lng: 100.5501 } })],
      }),
      day({
        id: "d3",
        dayNumber: 3,
        date: "2027-06-14",
        cityId: "c2",
        activities: [
          activity({
            id: "t1",
            category: "transport",
            name: "Bangkok to Phuket",
            durationMinutes: 0,
            estimatedCost: 11000,
          }),
          activity({ id: "a4", category: "beach", durationMinutes: 150, location: { lat: 7.8804, lng: 98.2969 } }),
        ],
      }),
      day({
        id: "d4",
        dayNumber: 4,
        date: "2027-06-15",
        cityId: "c2",
        activities: [activity({ id: "a5", category: "beach", durationMinutes: 150, location: { lat: 7.9, lng: 98.3 } })],
      }),
    ];

    return makeTrip(cities, days);
  }

  it("plans every day of the trip", () => {
    const result = analyzeTrip(thailandTrip());
    expect(Object.keys(result.days).sort()).toEqual(["d1", "d2", "d3", "d4"]);
  });

  it("puts the Bangkok → Phuket transfer on the arrival day only", () => {
    const result = analyzeTrip(thailandTrip());

    const transferDays = Object.values(result.days).filter((plan) =>
      plan.segments.some((s) => s.type === "city-transfer"),
    );
    expect(transferDays).toHaveLength(1);
    expect(transferDays[0].dayId).toBe("d3");

    const transfer = transferDays[0].segments.find((s) => s.type === "city-transfer")!;
    expect(transfer.fromCity).toBe("Bangkok");
    expect(transfer.toCity).toBe("Phuket");
    expect(transfer.mode).toBe("flight");
  });

  it("keeps a realistic itinerary feasible", () => {
    const result = analyzeTrip(thailandTrip());
    expect(result.infeasibleDayNumbers).toEqual([]);
    expect(result.totalTravelMinutes).toBeGreaterThan(0);
  });

  it("reports which day numbers are impossible", () => {
    const trip = thailandTrip();
    trip.days[1].activities = Array.from({ length: 5 }, (_, i) =>
      activity({ id: `x${i}`, category: "adventure", durationMinutes: 180, location: { lat: 13.75, lng: 100.5 } }),
    );

    const result = analyzeTrip(trip);
    expect(result.infeasibleDayNumbers).toEqual([2]);
    expect(result.days.d2.feasibility.feasible).toBe(false);
  });

  it("uses the trip's city order, not the order days happen to be listed in", () => {
    const trip = thailandTrip();
    trip.days = [...trip.days].reverse();

    const result = analyzeTrip(trip);
    const transfer = result.days.d3.segments.find((s) => s.type === "city-transfer");
    expect(transfer?.fromCity).toBe("Bangkok");
    expect(transfer?.toCity).toBe("Phuket");
  });

  it("marks every travel estimate as an estimate", () => {
    const result = analyzeTrip(thailandTrip());
    const segments = Object.values(result.days).flatMap((plan) => plan.segments);
    expect(segments.length).toBeGreaterThan(0);
    expect(segments.every((s) => s.isEstimated)).toBe(true);
  });
});

describe("backward compatibility with trips saved before this engine existed", () => {
  /**
   * Iteration 1 trips have no coordinates anywhere: no hotel location, no
   * activity location, no `planning` block. They must still analyse cleanly —
   * nothing here is persisted, so there is no migration to fall back on.
   */
  function legacyTrip(): Trip {
    const cities = [
      city({ id: "c1", name: "Bangkok", order: 0 }),
      city({ id: "c2", name: "Phuket", order: 1 }),
    ];
    const days = [
      day({
        id: "d1",
        dayNumber: 1,
        cityId: "c1",
        activities: [activity({ id: "a1", durationMinutes: 120 }), activity({ id: "a2", durationMinutes: 90 })],
      }),
      day({
        id: "d2",
        dayNumber: 2,
        date: "2027-06-13",
        cityId: "c2",
        activities: [activity({ id: "a3", durationMinutes: 120 })],
      }),
    ];
    return makeTrip(cities, days);
  }

  it("analyses without throwing", () => {
    expect(() => analyzeTrip(legacyTrip())).not.toThrow();
  });

  it("still recognises the city change, with an unknown mode and no distance", () => {
    const result = analyzeTrip(legacyTrip());
    const transfer = result.days.d2.segments.find((s) => s.type === "city-transfer");
    expect(transfer).toBeDefined();
    expect(transfer!.mode).toBe("unknown");
    expect(transfer!.distanceKm).toBeNull();
    expect(transfer!.estimatedDurationMinutes).toBeGreaterThan(0);
  });

  it("produces no invented local travel", () => {
    const result = analyzeTrip(legacyTrip());
    expect(result.days.d1.segments).toEqual([]);
  });

  it("explains that locations are missing", () => {
    const result = analyzeTrip(legacyTrip());
    expect(result.days.d1.feasibility.warnings.map((w) => w.code)).toContain("missing-coordinates");
  });

  it("keeps a light legacy day feasible", () => {
    const result = analyzeTrip(legacyTrip());
    expect(result.days.d1.feasibility.feasible).toBe(true);
  });

  it("handles a trip whose days reference a city that no longer exists", () => {
    const trip = legacyTrip();
    trip.days.push(day({ id: "d3", dayNumber: 3, cityId: "deleted-city" }));
    expect(() => analyzeTrip(trip)).not.toThrow();
    expect(analyzeTrip(trip).days.d3.feasibility.feasible).toBe(true);
  });

  it("handles a trip with no days at all", () => {
    const result = analyzeTrip(makeTrip([], []));
    expect(result.days).toEqual({});
    expect(result.infeasibleDayNumbers).toEqual([]);
    expect(result.totalTravelMinutes).toBe(0);
  });
});
