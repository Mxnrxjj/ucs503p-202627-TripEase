import { maxNightsOf } from "@/lib/hotel-nights";
import { describe, expect, it } from "vitest";
import { quoteFlights } from "@/lib/flights/quote";
import { fromInr } from "@/lib/fx";
import { parseTimeToMinutes } from "@/lib/services/feasibility";
import { getTravelTimeProvider } from "@/lib/services/feasibility/travel-time";
import { generateItinerary, searchPlaces } from "@/lib/services/itinerary-generator";
import { PlaceNotFoundError } from "@/lib/services/places/errors";
import { PlacesProviderError } from "@/lib/services/places/errors";
import type { CityPlan } from "@/types/planning";
import type { TripDraftInput } from "@/types/trip";
import { ratedPlace, RatedPlacesProvider, type RatedResults } from "@/test-support/places/rated-provider";

/**
 * The generator builds a trip from real places only. These tests use a provider
 * that returns rated places the way Google does, and check three things: the best
 * places are the ones chosen, a failing or empty provider is reported and never
 * filled with invented content, and nothing in a generated trip is flagged demo.
 */

const draft: TripDraftInput = {
  destination: "Testland",
  startDate: "2027-03-01",
  endDate: "2027-03-04",
  budget: 100_000,
  currency: "INR",
  travelers: 2,
  travelerType: "couple",
  preferences: ["culture"],
};

const plan = (cities: { name: string; days: number }[]): CityPlan => ({
  destination: "Testland",
  cities: cities.map((c) => ({ ...c, reason: "test" })),
  source: "ai",
  plannerVersion: "test",
  fallbackReason: null,
});

const oneCity = plan([{ name: "Testville", days: 4 }]);

const attractions = () => [
  ratedPlace("Hidden Gem Museum", 5.0, 12),
  ratedPlace("Old Fort", 4.4, 5_000),
  ratedPlace("Grand Temple", 4.8, 40_000),
  ratedPlace("Riverside Park", 4.5, 9_000),
  ratedPlace("City Market", 4.2, 3_000),
  ratedPlace("Art Gallery", 4.6, 7_000),
  ratedPlace("Lookout Hill", 4.7, 15_000),
  ratedPlace("Old Quarter Walk", 4.3, 2_000),
];

const hotels = () => [ratedPlace("Fine Hotel", 4.6, 4_000, { type: "hotel" })];
const restaurants = () => Array.from({ length: 9 }, (_, i) => ratedPlace(`Restaurant ${i}`, 4.0 + i / 20, 800 + i * 100, { type: "restaurant", category: "food" }));
const results = (over: RatedResults = {}): RatedResults => ({
  attraction: attractions(),
  hotel: hotels(),
  restaurant: restaurants(),
  nightlife: [ratedPlace("Jazz Bar", 4.4, 600, { type: "nightlife", category: "nightlife" })],
  ...over,
});

const allActivities = (itinerary: Awaited<ReturnType<typeof generateItinerary>>) => itinerary.days.flatMap((d) => d.activities);

describe("a trip built from real places", () => {
  it("is made of the places the provider returned, with their real data", async () => {
    const itinerary = await generateItinerary(draft, oneCity, undefined, new RatedPlacesProvider(results()));
    const sights = allActivities(itinerary).filter((a) => a.name === "Grand Temple");
    expect(sights.length).toBeGreaterThan(0);
    expect(sights[0].rating).toEqual({ value: 4.8, count: 40_000 });
    expect(sights[0].source?.provider).toBe("google");
    expect(sights[0].location).not.toBeNull();
  });

  it("flags nothing as demo, including the travel between cities", async () => {
    const itinerary = await generateItinerary(
      draft,
      plan([
        { name: "Testville", days: 2 },
        { name: "Otherton", days: 2 },
      ]),
      undefined,
      new RatedPlacesProvider(results()),
    );
    expect(allActivities(itinerary).some((a) => a.isDemoData)).toBe(false);
    expect(itinerary.cities.some((c) => c.hotel.isDemoData)).toBe(false);
    const transfer = allActivities(itinerary).find((a) => a.category === "transport");
    expect(transfer?.priceIsEstimate).toBe(true);
  });

  it("never names a hotel or place that the provider did not return", async () => {
    const provider = new RatedPlacesProvider(results());
    const itinerary = await generateItinerary(draft, oneCity, undefined, provider);
    const known = new Set(
      [...(results().attraction ?? []), ...(results().restaurant ?? []), ...(results().nightlife ?? []), ...(results().hotel ?? [])].map((p) => p.name),
    );
    for (const a of allActivities(itinerary)) {
      if (a.category === "transport") continue;
      expect(known.has(a.name), `${a.name} is not a place the provider returned`).toBe(true);
    }
    expect(known.has(itinerary.cities[0].hotel.name)).toBe(true);
    expect(JSON.stringify(itinerary)).not.toMatch(/\(demo\)|Central Hotel|Breakfast at the hotel/);
  });
});

describe("choosing the best", () => {
  it("builds the trip from the best-rated sights, and leaves the weaker ones out", async () => {
    // Four days have room for about eight sights. Twelve come back, four of them clearly worse
    // and one of them far from the rest, where a day's grouping would otherwise seed from it.
    const strong = attractions();
    const weak = ["Dull Square", "Empty Mall", "Closed Pier", "Roadside Stall"].map((name, i) =>
      ratedPlace(name, 3.0, 4_000, i === 0 ? { location: { lat: 14.5, lng: 101.5 } } : {}),
    );
    const itinerary = await generateItinerary(draft, oneCity, undefined, new RatedPlacesProvider(results({ attraction: [...weak, ...strong] })));
    const used = allActivities(itinerary).map((a) => a.name);
    for (const name of ["Dull Square", "Empty Mall", "Closed Pier", "Roadside Stall"]) expect(used).not.toContain(name);
    expect(used).toContain("Grand Temple");
    expect(used).toContain("Lookout Hill");
  });

  it("uses a sight at most once on a day", async () => {
    const itinerary = await generateItinerary(draft, oneCity, undefined, new RatedPlacesProvider(results()));
    for (const day of itinerary.days) {
      const names = day.activities.map((a) => a.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  // Delhi's typical prices are ₹2,700 / ₹3,600 / ₹15,000 for 3, 4 and 5 stars,
  // ₹2,835 / ₹3,780 / ₹17,700 with GST. 4 days is 3 nights.
  const delhi = plan([{ name: "Delhi", days: 4 }]);
  const india = { ...draft, destination: "India" };
  const hotels = () =>
    results({
      hotel: [
        ratedPlace("Palace Hotel", 4.9, 9_000, { type: "hotel", price: { amount: 60_000, currency: "INR", isEstimate: true } }),
        ratedPlace("Comfort Inn", 4.5, 3_000, { type: "hotel" }),
      ],
    });

  it("asks for the class of hotel the budget allows, takes the best-rated, and prices it at that class", async () => {
    // 40% of 1,00,000 over 3 nights is about ₹13,333 a room: 4-star fits, 5-star doesn't.
    const provider = new RatedPlacesProvider(hotels());
    const itinerary = await generateItinerary(india, delhi, undefined, provider);
    const hotel = itinerary.cities[0].hotel;
    expect(provider.searches.find((s) => s.type === "hotel")?.hotelClass).toBe(4);
    expect(hotel.name).toBe("Palace Hotel");
    expect(hotel.pricePerNight).toBe(3_780); // not the place's own 60,000
    expect(hotel.rateBasis).toEqual({ tier: "mid", basis: "city", from: "Delhi", includesTax: true });
    // Not even `kind: undefined`: Firestore refuses to save an undefined field.
    expect(Object.keys(hotel.rateBasis ?? {})).not.toContain("kind");
    expect(itinerary.budget.categories.hotels).toBe(3_780 * 3);
  });

  it("goes up a class when the budget allows it", async () => {
    // About ₹26,667 a room a night: 5-star (₹17,700) fits.
    const provider = new RatedPlacesProvider(hotels());
    const itinerary = await generateItinerary({ ...india, budget: 200_000 }, delhi, undefined, provider);
    expect(provider.searches.find((s) => s.type === "hotel")?.hotelClass).toBe(5);
    expect(itinerary.cities[0].hotel.pricePerNight).toBe(17_700);
    expect(itinerary.cities[0].hotel.rateBasis?.tier).toBe("upscale");
  });

  it("puts a bigger party, which books more rooms, in a cheaper class", async () => {
    // Two people: one room, ₹13,333 a night, 4-star. Eight: four rooms,
    // ₹3,333 each, so 3-star (₹2,835).
    const couple = await generateItinerary(india, delhi, undefined, new RatedPlacesProvider(hotels()));
    const group = await generateItinerary(
      { ...india, travelers: 8, travelerType: "friends" },
      delhi,
      undefined,
      new RatedPlacesProvider(hotels()),
    );
    expect(couple.cities[0].hotel.rateBasis?.tier).toBe("mid");
    expect(group.cities[0].hotel.rateBasis?.tier).toBe("budget");
    expect(couple.budget.categories.hotels).toBe(3_780 * 3);
    expect(group.budget.categories.hotels).toBe(2_835 * 3 * 4);
  });

  it("uses 3-star when even that is over the budget, so the budget shows as tight", async () => {
    const provider = new RatedPlacesProvider(hotels());
    const itinerary = await generateItinerary({ ...india, budget: 5_000 }, delhi, undefined, provider);
    expect(itinerary.cities[0].hotel.rateBasis?.tier).toBe("budget");
    expect(itinerary.cities[0].hotel.pricePerNight).toBe(2_835);
  });

  it("converts the price into the trip's currency and compares the budget in rupees", async () => {
    // $1,500 is ₹1,24,500 (₹83 a dollar): about ₹16,600 a room a night, 4-star.
    const itinerary = await generateItinerary(
      { ...india, budget: 1_500, currency: "USD" },
      delhi,
      undefined,
      new RatedPlacesProvider(hotels()),
    );
    const hotel = itinerary.cities[0].hotel;
    expect(hotel.rateBasis?.tier).toBe("mid");
    expect(hotel.currency).toBe("USD");
    expect(hotel.pricePerNight).toBe(46); // 3,780 / 83 = 45.5, in whole dollars
  });

  it("prices a city with no figures of its own from the closest figures, and says so", async () => {
    const itinerary = await generateItinerary(
      india,
      plan([{ name: "Kochi", days: 4 }]),
      undefined,
      new RatedPlacesProvider(hotels()),
    );
    expect(itinerary.cities[0].hotel.rateBasis).toEqual({ tier: "mid", basis: "country", from: "Delhi", includesTax: true });
  });

  it("models a city with no figures from its country's main city, and saves what it was scaled for", async () => {
    // Santorini: Athens's prices times the beach ratio, ₹12,200 / ₹20,400 / ₹42,800.
    // ₹13,333 a room a night fits 3-star, not 4-star.
    const itinerary = await generateItinerary(
      { ...draft, destination: "Greece" },
      plan([{ name: "Santorini", days: 4 }]),
      undefined,
      new RatedPlacesProvider(hotels()),
    );
    const hotel = itinerary.cities[0].hotel;
    expect(hotel.rateBasis).toEqual({ tier: "budget", basis: "modelled", from: "Athens", includesTax: false, kind: "beach" });
    expect(hotel.pricePerNight).toBe(12_200);
  });

  it("labels the hotel's price as an estimate, since Google gives only a price level", async () => {
    const itinerary = await generateItinerary(draft, oneCity, undefined, new RatedPlacesProvider(results()));
    expect(itinerary.cities[0].hotel.priceIsEstimate).toBe(true);
  });

  it("asks the provider for the full page of results, so the best can be picked from many", async () => {
    const provider = new RatedPlacesProvider(results());
    await generateItinerary(draft, oneCity, undefined, provider);
    const byType = Object.fromEntries(provider.searches.map((s) => [s.type, s.limit]));
    expect(byType.attraction).toBe(20);
    expect(byType.restaurant).toBe(20);
    expect(byType.hotel).toBeGreaterThanOrEqual(10);
  });
});

describe("when the places service cannot help", () => {
  it.each(["quota-exceeded", "network", "invalid-key", "provider-error", "malformed-response"] as const)(
    "reports a %s failure instead of building a trip from anything else",
    async (code) => {
      await expect(generateItinerary(draft, oneCity, undefined, new RatedPlacesProvider(results(), code))).rejects.toMatchObject({
        name: "PlacesProviderError",
        code,
      });
    },
  );

  it("reports a city with no hotels", async () => {
    const error = await generateItinerary(draft, oneCity, undefined, new RatedPlacesProvider(results({ hotel: [] }))).catch((e) => e);
    expect(error).toBeInstanceOf(PlacesProviderError);
    expect(error.code).toBe("no-results");
    expect(error.message).toMatch(/No hotels were found in Testville/);
  });

  it("reports a city with nothing to see, which is almost always a name the service does not know", async () => {
    const error = await generateItinerary(draft, oneCity, undefined, new RatedPlacesProvider(results({ attraction: [] }))).catch((e) => e);
    expect(error).toBeInstanceOf(PlacesProviderError);
    expect(error.code).toBe("no-results");
    expect(error.message).toMatch(/Nothing to see was found in Testville/);
  });

  it("is happy with no restaurants or nightlife: the days are lighter, not filled with invented meals", async () => {
    const itinerary = await generateItinerary(draft, oneCity, undefined, new RatedPlacesProvider(results({ restaurant: [], nightlife: [] })));
    expect(allActivities(itinerary).some((a) => a.category === "food")).toBe(false);
    expect(allActivities(itinerary).filter((a) => a.category !== "transport").length).toBeGreaterThan(0);
    expect(JSON.stringify(itinerary)).not.toMatch(/Local lunch|Dinner in the city centre/);
  });
});

describe("hotel nights", () => {
  const nightsOf = async (input: TripDraftInput, cityPlan: CityPlan) => {
    const itinerary = await generateItinerary(input, cityPlan, undefined, new RatedPlacesProvider(results()));
    return itinerary.cities.map((c) => c.hotel.nights);
  };

  it("charges no night in the last city when the trip ends there the same day it arrives", async () => {
    const threeDays = { ...draft, endDate: "2027-03-03" };
    const twoCities = plan([
      { name: "Testville", days: 2 },
      { name: "Otherton", days: 1 },
    ]);
    expect(await nightsOf(threeDays, twoCities)).toEqual([2, 0]);
  });

  it("charges no night for a one-day trip", async () => {
    const oneDay = { ...draft, endDate: "2027-03-01" };
    expect(await nightsOf(oneDay, plan([{ name: "Testville", days: 1 }]))).toEqual([0]);
  });

  it("books exactly what the hotel editor allows, city by city, and one night fewer than the days in all", async () => {
    const fiveDays = { ...draft, endDate: "2027-03-05" };
    const itinerary = await generateItinerary(
      fiveDays,
      plan([
        { name: "Testville", days: 2 },
        { name: "Otherton", days: 2 },
        { name: "Lastburg", days: 1 },
      ]),
      undefined,
      new RatedPlacesProvider(results()),
    );
    const nights = itinerary.cities.map((c) => c.hotel.nights);
    expect(nights).toEqual([2, 2, 0]);
    expect(nights).toEqual(itinerary.cities.map((c) => maxNightsOf(c, itinerary.cities)));
    expect(nights.reduce((a, b) => a + b, 0)).toBe(5 - 1);
  });

  it("charges one night fewer than the days in total", async () => {
    const threeDays = { ...draft, endDate: "2027-03-03" };
    const nights = await nightsOf(threeDays, plan([{ name: "Testville", days: 3 }]));
    expect(nights).toEqual([2]);
  });
});

describe("flights in the budget", () => {
  // Quoted as of a fixed day, so the fare doesn't depend on when the tests run.
  const thailand: TripDraftInput = { ...draft, destination: "Thailand", origin: "BOM", quotedOn: "2026-11-13" };
  const build = (input: TripDraftInput, cities = oneCity) =>
    generateItinerary(input, cities, undefined, new RatedPlacesProvider(results()));

  it("budgets the quoted fare for every traveller, and keeps the quote", async () => {
    const itinerary = await build(thailand);
    const expected = quoteFlights({
      origin: "BOM",
      destination: "Thailand",
      firstCity: "Testville",
      startDate: draft.startDate,
      travelers: 2,
      now: new Date("2026-11-13T12:00:00Z"),
    })!;
    expect(itinerary.flights).toEqual(expected);
    expect(itinerary.flights?.quotedOn).toBe("2026-11-13");
    expect(itinerary.budget.categories.flights).toBe(expected.totalInr);
    expect(expected.totalInr).toBe(expected.perTravelerInr.typical * 2);
  });

  it("flies into the airport of the first city", async () => {
    const itinerary = await build(
      { ...thailand, destination: "Japan" },
      plan([{ name: "Kyoto", days: 2 }, { name: "Tokyo", days: 2 }]),
    );
    expect(itinerary.flights?.arrival?.code).toBe("KIX");
  });

  it("prices a trip inside India as a domestic flight, or nothing when it starts at home", async () => {
    const goa = await build({ ...thailand, destination: "India" }, plan([{ name: "Goa", days: 4 }]));
    expect(goa.flights?.arrival?.code).toBe("GOI");
    expect(goa.budget.categories.flights).toBeGreaterThan(10_000);

    const home = await build({ ...thailand, destination: "India", origin: "DEL" }, plan([{ name: "Delhi", days: 4 }]));
    expect(home.budget.categories.flights).toBe(0);
    expect(home.flights?.basis).toMatch(/no flight/);
  });

  it("converts the fare into the trip's currency", async () => {
    const inr = await build(thailand);
    const usd = await build({ ...thailand, currency: "USD", budget: 1_200 });
    expect(usd.budget.categories.flights).toBe(fromInr(inr.flights!.totalInr, "USD"));
  });

  it("charges nothing for flights when the traveller leaves them out", async () => {
    const itinerary = await build({ ...thailand, includeFlights: false });
    expect(itinerary.budget.categories.flights).toBe(0);
    expect(itinerary.flights).toBeNull();
  });

  it("still includes flights when the choice was never made, as for trips saved earlier", async () => {
    const itinerary = await build({ ...thailand, includeFlights: undefined, origin: undefined });
    expect(itinerary.flights?.originAssumed).toBe(true);
    expect(itinerary.budget.categories.flights).toBeGreaterThan(0);
  });
});

describe("the clock times of a generated day", () => {
  // Places spread over a few kilometres, so getting between them takes real time.
  const spot = (i: number) => ({ lat: 13.7 + (i % 5) * 0.05, lng: 100.5 + Math.floor(i / 5) * 0.06 });
  const spread = () =>
    results({
      attraction: Array.from({ length: 14 }, (_, i) =>
        ratedPlace(`Sight ${i}`, 4.8 - i / 40, 5_000, { location: spot(i * 7 + 3), durationMinutes: [90, 180, 240, 120][i % 4] }),
      ),
      hotel: [ratedPlace("Spread Hotel", 4.6, 4_000, { type: "hotel", location: spot(11) })],
      restaurant: Array.from({ length: 12 }, (_, i) =>
        ratedPlace(`Spread Restaurant ${i}`, 4.5, 900, { type: "restaurant", category: "food", location: spot(i * 3 + 1) }),
      ),
      nightlife: [ratedPlace("Spread Bar", 4.4, 600, { type: "nightlife", category: "nightlife", location: spot(17) })],
    });
  const twoCities = plan([
    { name: "Testville", days: 3 },
    { name: "Otherton", days: 3 },
  ]);

  it("lists each day in clock order, with a valid time on every stop", async () => {
    const itinerary = await generateItinerary(draft, twoCities, undefined, new RatedPlacesProvider(spread()));
    for (const day of itinerary.days) {
      const minutes = day.activities.map((a) => parseTimeToMinutes(a.time));
      expect(minutes.every((m) => m !== null)).toBe(true);
      expect(minutes).toEqual([...minutes].sort((a, b) => a! - b!));
    }
  });

  it("never starts a stop before the traveller can have got there from the one before", async () => {
    const itinerary = await generateItinerary(draft, twoCities, undefined, new RatedPlacesProvider(spread()));
    const travel = getTravelTimeProvider();
    let hops = 0;
    for (const day of itinerary.days) {
      const stops = day.activities.filter((a) => a.category !== "transport");
      for (let i = 1; i < stops.length; i++) {
        const before = stops[i - 1];
        const gap = parseTimeToMinutes(stops[i].time)! - (parseTimeToMinutes(before.time)! + before.durationMinutes);
        expect(gap, `${before.name} -> ${stops[i].name} on day ${day.dayNumber}`).toBeGreaterThanOrEqual(
          travel.estimate(before.location ?? null, stops[i].location ?? null, { sameCity: true }).minutes,
        );
        hops += 1;
      }
    }
    expect(hops).toBeGreaterThan(5);
  });

  it("keeps breakfast at nine: a stop chosen late is not pushed past the ones chosen first", async () => {
    const itinerary = await generateItinerary(draft, twoCities, undefined, new RatedPlacesProvider(spread()));
    for (const day of [itinerary.days[1], itinerary.days[2]]) {
      expect(day.activities[0].category).toBe("food");
      expect(day.activities[0].time).toBe("09:00");
    }
  });

  it("keeps the transfer between cities at 09:00 and every stop after it", async () => {
    const itinerary = await generateItinerary(draft, twoCities, undefined, new RatedPlacesProvider(spread()));
    const transferDay = itinerary.days[3];
    const transfer = transferDay.activities.find((a) => a.category === "transport")!;
    expect(transfer.time).toBe("09:00");
    expect(transferDay.activities[0]).toBe(transfer);
    const end = parseTimeToMinutes(transfer.time)! + transfer.durationMinutes;
    for (const stop of transferDay.activities.filter((a) => a.category !== "transport")) {
      expect(parseTimeToMinutes(stop.time)!).toBeGreaterThanOrEqual(end);
    }
  });
});

describe("a trip about one place in the country", () => {
  const india = { ...draft, destination: "India" };
  const goa = plan([{ name: "Goa", days: 4 }]);

  it("is named after the place, and remembers it", async () => {
    const itinerary = await generateItinerary({ ...india, focus: "Goa" }, goa, undefined, new RatedPlacesProvider(results()));
    expect(itinerary.title).toBe("Goa Adventure");
    expect(itinerary.focus).toBe("Goa");
    expect(itinerary.destination).toBe("India");
  });

  it("is named after the country when no usable place was given", async () => {
    for (const focus of [undefined, "", "India", "  "]) {
      const itinerary = await generateItinerary({ ...india, focus }, goa, undefined, new RatedPlacesProvider(results()));
      expect(itinerary.title, String(focus)).toBe("India Adventure");
      expect(itinerary.focus).toBeNull();
    }
  });

  it("searches each city with the country, so the place is looked up in the right country", async () => {
    const provider = new RatedPlacesProvider(results());
    await generateItinerary({ ...india, focus: "Goa" }, goa, undefined, provider);
    expect(provider.searches.length).toBeGreaterThan(0);
    expect(provider.searches.every((s) => s.destination === "Goa" && s.country === "India")).toBe(true);
  });
});

describe("places the service puts in another country", () => {
  const inIndia = (name: string, extra = {}) => ratedPlace(name, 4.5, 2_000, { countryCode: "IN", ...extra });
  const inFrance = (name: string, extra = {}) => ratedPlace(name, 4.9, 90_000, { countryCode: "FR", ...extra });

  it("are dropped from a search, and places it says nothing about are kept", async () => {
    const provider = new RatedPlacesProvider({
      attraction: [inFrance("Eiffel Tower"), inIndia("Fort Aguada"), ratedPlace("Unknown Beach", 4.2, 300), inIndia("Basilica", { countryCode: "in" })],
    });
    const found = await searchPlaces(provider, { destination: "Goa", country: "India", type: "attraction" });
    expect(found.map((p) => p.name)).toEqual(["Fort Aguada", "Unknown Beach", "Basilica"]);
  });

  it("are kept when the trip's country isn't one TripEase knows, or none is given", async () => {
    const provider = new RatedPlacesProvider({ attraction: [inFrance("Eiffel Tower"), inIndia("Fort Aguada")] });
    expect(await searchPlaces(provider, { destination: "Somewhere", country: "Narnia", type: "attraction" })).toHaveLength(2);
    expect(await searchPlaces(provider, { destination: "Somewhere", type: "attraction" })).toHaveLength(2);
  });

  it("follow an older trip's free-text destination to its country", async () => {
    const provider = new RatedPlacesProvider({ attraction: [inFrance("Eiffel Tower"), inIndia("Fort Aguada")] });
    const found = await searchPlaces(provider, { destination: "Goa", country: "Goa, India", type: "attraction" });
    expect(found.map((p) => p.name)).toEqual(["Fort Aguada"]);
  });

  it("never end up in the trip: the best-rated foreign place loses to a local one", async () => {
    const provider = new RatedPlacesProvider(
      results({
        hotel: [inFrance("Paris Grand Hotel", { type: "hotel" }), inIndia("Goa Beach Resort", { type: "hotel" })],
        attraction: [inFrance("Louvre"), ...attractions().map((p) => ({ ...p, countryCode: "IN" }))],
      }),
    );
    const itinerary = await generateItinerary({ ...draft, destination: "India" }, plan([{ name: "Goa", days: 4 }]), undefined, provider);
    expect(itinerary.cities[0].hotel.name).toBe("Goa Beach Resort");
    expect(allActivities(itinerary).some((a) => a.name === "Louvre")).toBe(false);
  });

  it("leave a city with no hotel in this country, and the trip is refused, naming the place", async () => {
    const provider = new RatedPlacesProvider(
      results({ hotel: [inFrance("Paris Grand Hotel", { type: "hotel" })], attraction: attractions() }),
    );
    const error = await generateItinerary({ ...draft, destination: "India", focus: "Paris" }, plan([{ name: "Paris", days: 4 }]), undefined, provider).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PlaceNotFoundError);
    expect(error).toMatchObject({ code: "no-results", place: "Paris", missing: "hotels" });
  });

  it("leave a city with nothing to see in this country, and the trip is refused, naming the place", async () => {
    const provider = new RatedPlacesProvider(results({ attraction: [inFrance("Louvre")] }));
    const error = await generateItinerary({ ...draft, destination: "India" }, plan([{ name: "Paris", days: 4 }]), undefined, provider).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "no-results", place: "Paris", missing: "sights" });
  });
});
