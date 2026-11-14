import { beforeAll, describe, expect, it } from "vitest";
import { fromInr } from "@/lib/fx";
import { computeBudgetBreakdown } from "@/lib/services/budget-engine";
import { buildChangeSet, nextFreeTime, queryWords, statsOf } from "@/lib/services/trip-agent/apply";
import { tripVersion } from "@/lib/services/trip-agent/version";
import { buildThailandTrip } from "@/test-support/trip-fixture";
import { getMockPlacesProvider } from "@/test-support/places";
import type { TripDay } from "@/types/itinerary";
import type { AgentTrip, ChangeSet, EditOperation } from "@/types/trip-agent";

const places = getMockPlacesProvider();
let trip: AgentTrip;

beforeAll(async () => {
  trip = await buildThailandTrip();
});

const run = (operations: EditOperation[], base: AgentTrip = trip) => buildChangeSet(base, operations, { places });
const okChange = async (operations: EditOperation[], base: AgentTrip = trip): Promise<ChangeSet> => {
  const result = await run(operations, base);
  if (!result.ok) throw new Error(`expected a change set, got: ${result.problems.join(" | ")}`);
  return result.changeSet;
};
const problems = async (operations: EditOperation[], base: AgentTrip = trip) => {
  const result = await run(operations, base);
  if (result.ok) throw new Error("expected problems, got a change set");
  return result.problems;
};

const firstDay = () => trip.days[0];
const allActivities = (days: TripDay[]) => days.flatMap((d) => d.activities);

describe("the fixture", () => {
  it("is a real nine-day, two-city trip", () => {
    expect(trip.dayCount).toBe(9);
    expect(trip.cities.length).toBeGreaterThanOrEqual(2);
    expect(trip.days).toHaveLength(9);
    expect(allActivities(trip.days).length).toBeGreaterThan(20);
  });
});

describe("removing an activity", () => {
  it("takes it out, says so, and lowers the estimate", async () => {
    const target = firstDay().activities.find((a) => a.estimatedCost > 0)!;
    const change = await okChange([{ type: "remove_activity", activityId: target.id }]);

    expect(allActivities(change.patch.days).some((a) => a.id === target.id)).toBe(false);
    expect(change.lines).toEqual([`Remove ${target.name} (Day 1).`]);
    expect(change.after.estimatedTotal).toBeLessThan(change.before.estimatedTotal);
    expect(change.patch.days.find((d) => d.id === firstDay().id)!.activities).toHaveLength(firstDay().activities.length - 1);
  });

  it("does not touch the trip it was worked out from", async () => {
    const before = JSON.stringify(trip);
    await okChange([{ type: "remove_activity", activityId: firstDay().activities[0].id }]);
    expect(JSON.stringify(trip)).toBe(before);
  });

  it("refuses an id that is not in the trip", async () => {
    expect(await problems([{ type: "remove_activity", activityId: "act-made-up" }])).toEqual([
      'There\'s no activity "act-made-up" in this trip.',
    ]);
  });
});

describe("moving an activity", () => {
  it("puts it on the other day, in time order, and keeps everything else", async () => {
    const from = trip.days[0];
    const to = trip.days[2];
    const moved = from.activities[0];
    const change = await okChange([{ type: "move_activity", activityId: moved.id, toDayId: to.id }]);

    const newFrom = change.patch.days.find((d) => d.id === from.id)!;
    const newTo = change.patch.days.find((d) => d.id === to.id)!;
    expect(newFrom.activities.some((a) => a.id === moved.id)).toBe(false);
    expect(newTo.activities.some((a) => a.id === moved.id)).toBe(true);
    const times = newTo.activities.map((a) => a.time);
    expect(times).toEqual([...times].sort());
    expect(allActivities(change.patch.days)).toHaveLength(allActivities(trip.days).length);
    expect(change.lines[0]).toBe(`Move ${moved.name} from Day 1 to Day 3.`);
  });

  it("refuses to move it to the day it is already on", async () => {
    const day = trip.days[0];
    expect((await problems([{ type: "move_activity", activityId: day.activities[0].id, toDayId: day.id }]))[0]).toMatch(
      /already on Day 1/,
    );
  });

  it("refuses a day that does not exist", async () => {
    expect(
      (await problems([{ type: "move_activity", activityId: firstDay().activities[0].id, toDayId: "day-nope" }]))[0],
    ).toMatch(/no day "day-nope"/);
  });
});

describe("replacing an activity with a real place", () => {
  it("finds the place through the provider and keeps the time slot", async () => {
    const day = trip.days.find((d) => d.activities.some((a) => a.category !== "food" && a.category !== "nightlife"))!;
    const target = day.activities.find((a) => a.category !== "food" && a.category !== "nightlife")!;
    const city = trip.cities.find((c) => c.id === day.cityId)!;
    // A name the demo data holds for this city, that is not already on this day.
    const candidate = (await places.searchPlaces({ destination: city.name, country: "Thailand", type: "attraction", limit: 30 })).find(
      (p) => !day.activities.some((a) => a.name === p.name),
    )!;

    const change = await okChange([{ type: "replace_activity", activityId: target.id, query: candidate.name }]);
    const replaced = change.patch.days.find((d) => d.id === day.id)!.activities.find((a) => a.name === candidate.name)!;
    expect(replaced.time).toBe(target.time);
    expect(replaced.id).not.toBe(target.id);
    expect(change.lines[0]).toBe(`Replace ${target.name} with ${candidate.name} (Day ${day.dayNumber}).`);
  });

  it("says plainly when it cannot find what was asked for, rather than inventing it", async () => {
    const result = await problems([{ type: "replace_activity", activityId: firstDay().activities[0].id, query: "Zzyzx Galactic Observatory" }]);
    expect(result[0]).toMatch(/couldn't find "Zzyzx Galactic Observatory" in/);
  });
});

describe("adding an activity", () => {
  it("adds a real place after the last stop of the day", async () => {
    const day = trip.days[1];
    const city = trip.cities.find((c) => c.id === day.cityId)!;
    const candidate = (await places.searchPlaces({ destination: city.name, country: "Thailand", type: "attraction", limit: 30 })).find(
      (p) => !day.activities.some((a) => a.name === p.name),
    )!;

    const change = await okChange([{ type: "add_activity", dayId: day.id, query: candidate.name }]);
    const newDay = change.patch.days.find((d) => d.id === day.id)!;
    const added = newDay.activities.find((a) => a.name === candidate.name)!;
    expect(newDay.activities).toHaveLength(day.activities.length + 1);
    expect(added.time).toBe(nextFreeTime(day));
    expect(change.lines[0]).toBe(`Add ${candidate.name} to Day ${day.dayNumber} at ${added.time}.`);
  });

  it("will not add a place the day already has", async () => {
    const day = trip.days[0];
    const existing = day.activities.find((a) => a.category !== "food")!;
    expect((await problems([{ type: "add_activity", dayId: day.id, query: existing.name }]))[0]).toMatch(/couldn't find/);
  });
});

describe("finding the place that was asked for", () => {
  it("ignores filler words and plurals", () => {
    expect(queryWords("the best floating markets")).toEqual(["floating", "market"]);
    expect(queryWords("a")).toEqual([]);
  });

  it("does not turn a request for one thing into another", async () => {
    const day = trip.days[0];
    const city = trip.cities.find((c) => c.id === day.cityId)!;
    // The demo data returns its whole list when a query matches nothing. Asking for
    // something it does not hold must be reported, not answered with a different place.
    const result = await problems([{ type: "add_activity", dayId: day.id, query: "Quidditch stadium tour" }]);
    expect(result[0]).toBe(`I couldn't find "Quidditch stadium tour" in ${city.name}.`);
  });

  it("matches on a word of the request, so a description of a place works", async () => {
    const day = trip.days[1];
    const city = trip.cities.find((c) => c.id === day.cityId)!;
    const some = (await places.searchPlaces({ destination: city.name, country: "Thailand", type: "attraction", limit: 30 })).find(
      (p) => !day.activities.some((a) => a.name === p.name) && queryWords(p.name).length > 0,
    )!;
    const word = queryWords(some.name)[0];
    const change = await okChange([{ type: "add_activity", dayId: day.id, query: `a visit to ${word}` }]);
    expect(change.lines[0]).toMatch(/^Add .+ to Day 2 at \d\d:\d\d\.$/);
  });
});

describe("nextFreeTime", () => {
  const day = (activities: { time: string; durationMinutes: number }[]) => ({ activities }) as unknown as TripDay;

  it("starts an empty day at ten", () => {
    expect(nextFreeTime(day([]))).toBe("10:00");
  });

  it("leaves room to get there after the last stop", () => {
    expect(nextFreeTime(day([{ time: "09:00", durationMinutes: 120 }, { time: "13:00", durationMinutes: 60 }]))).toBe("14:30");
  });

  it("does not schedule a stop to start in the middle of the night", () => {
    expect(nextFreeTime(day([{ time: "19:00", durationMinutes: 240 }]))).toBe("20:00");
  });
});

describe("changing a hotel", () => {
  it("finds the hotel through the provider and keeps the nights", async () => {
    const city = trip.cities[0];
    const hotels = await places.searchPlaces({ destination: city.name, country: "Thailand", type: "hotel", limit: 10 });
    const other = hotels.find((h) => h.name !== city.hotel.name);
    if (!other) return; // this demo city has only one hotel: nothing to switch to
    const change = await okChange([{ type: "change_hotel", cityId: city.id, query: other.name }]);
    const updated = change.patch.cities.find((c) => c.id === city.id)!;
    expect(updated.hotel.name).toBe(other.name);
    expect(updated.hotel.nights).toBe(city.hotel.nights);
  });

  it("prices the new hotel as the same class as the one it replaces", async () => {
    // Bangkok: 4-star ₹5,700, 5-star ₹12,000 a night.
    const city = trip.cities[0];
    const upscale = {
      ...trip,
      cities: trip.cities.map((c) =>
        c.id === city.id
          ? { ...c, hotel: { ...c.hotel, name: "An Older Hotel", rateBasis: { ...c.hotel.rateBasis!, tier: "upscale" as const } } }
          : c,
      ),
    };
    const change = await okChange([{ type: "change_hotel", cityId: city.id, query: city.hotel.name }], upscale);
    const hotel = change.patch.cities.find((c) => c.id === city.id)!.hotel;
    expect(hotel.name).toBe(city.hotel.name);
    expect(hotel.rateBasis).toEqual({ tier: "upscale", basis: "city", from: "Bangkok", includesTax: false });
    expect(hotel.pricePerNight).toBe(12_000);
    expect(hotel.priceIsEstimate).toBe(true);
  });

  it("prices a hotel saved before classes existed as 4-star", async () => {
    const city = trip.cities[0];
    const { rateBasis: _dropped, ...oldHotel } = city.hotel;
    void _dropped;
    const old = {
      ...trip,
      cities: trip.cities.map((c) => (c.id === city.id ? { ...c, hotel: { ...oldHotel, name: "An Older Hotel" } } : c)),
    };
    const change = await okChange([{ type: "change_hotel", cityId: city.id, query: city.hotel.name }], old);
    const hotel = change.patch.cities.find((c) => c.id === city.id)!.hotel;
    expect(hotel.rateBasis?.tier).toBe("mid");
    expect(hotel.pricePerNight).toBe(5_700);
  });

  it("refuses a city that is not in the trip", async () => {
    expect((await problems([{ type: "change_hotel", cityId: "city-nope", query: "anything" }]))[0]).toMatch(/no city "city-nope"/);
  });

  describe("asking for a cheaper or dearer class", () => {
    // Bangkok: 3-star ₹4,500, 4-star ₹5,700, 5-star ₹12,000 a night.
    const city = () => trip.cities[0];
    const inClass = (tier: "budget" | "mid" | "upscale", withRateBasis = true): AgentTrip => ({
      ...trip,
      cities: trip.cities.map((c) => {
        if (c.id !== city().id) return c;
        const { rateBasis, ...rest } = c.hotel;
        return {
          ...c,
          hotel: { ...rest, name: "An Older Hotel", ...(withRateBasis ? { rateBasis: { ...rateBasis!, tier } } : {}) },
        };
      }),
    });
    const swap = async (base: AgentTrip, starClass?: "lower" | "higher") => {
      const change = await okChange(
        [{ type: "change_hotel", cityId: city().id, query: city().hotel.name, ...(starClass ? { starClass } : {}) }],
        base,
      );
      return { hotel: change.patch.cities.find((c) => c.id === city().id)!.hotel, lines: change.lines };
    };

    it("moves a 5-star hotel down to 4-star, and prices it so", async () => {
      const { hotel, lines } = await swap(inClass("upscale"), "lower");
      expect(hotel.rateBasis?.tier).toBe("mid");
      expect(hotel.pricePerNight).toBe(5_700);
      expect(lines[0]).toMatch(/\(4-star, one class cheaper\)\.$/);
    });

    it("moves a 4-star hotel down to 3-star, which is what the 'cheaper hotel' tip is for", async () => {
      const { hotel } = await swap(inClass("mid"), "lower");
      expect(hotel.rateBasis?.tier).toBe("budget");
      expect(hotel.pricePerNight).toBe(4_500);
      expect(hotel.pricePerNight).toBeLessThan(city().hotel.pricePerNight);
    });

    it("moves a 4-star hotel up to 5-star", async () => {
      const { hotel, lines } = await swap(inClass("mid"), "higher");
      expect(hotel.rateBasis?.tier).toBe("upscale");
      expect(hotel.pricePerNight).toBe(12_000);
      expect(lines[0]).toMatch(/\(5-star, one class dearer\)\.$/);
    });

    it("stays in the cheapest class when it is there already, and says so", async () => {
      const { hotel, lines } = await swap(inClass("budget"), "lower");
      expect(hotel.rateBasis?.tier).toBe("budget");
      expect(hotel.pricePerNight).toBe(4_500);
      expect(lines[0]).toMatch(/\(3-star: already the cheapest class\)\.$/);
    });

    it("stays in the dearest class when it is there already, and says so", async () => {
      const { hotel, lines } = await swap(inClass("upscale"), "higher");
      expect(hotel.rateBasis?.tier).toBe("upscale");
      expect(lines[0]).toMatch(/\(5-star: already the dearest class\)\.$/);
    });

    it("counts a hotel saved before classes existed as 4-star", async () => {
      const lower = await swap(inClass("mid", false), "lower");
      expect(lower.hotel.rateBasis?.tier).toBe("budget");
      const higher = await swap(inClass("mid", false), "higher");
      expect(higher.hotel.rateBasis?.tier).toBe("upscale");
    });

    it("says nothing about a class when none was asked for", async () => {
      const { hotel, lines } = await swap(inClass("upscale"));
      expect(hotel.rateBasis?.tier).toBe("upscale");
      expect(lines[0]).toBe(`Change the ${city().name} hotel from An Older Hotel to ${hotel.name}.`);
    });

    it("needs no matching word when the search was for a class: 'a well-rated hotel' names no hotel", async () => {
      const ask = (starClass?: "lower") =>
        run([{ type: "change_hotel", cityId: city().id, query: "well-rated hotel", ...(starClass ? { starClass } : {}) }], inClass("upscale"));
      const withClass = await ask("lower");
      expect(withClass.ok).toBe(true);
    });

    it("still refuses a request that matches nothing when no class was asked for", async () => {
      const result = await run([{ type: "change_hotel", cityId: city().id, query: "zzqx", }], inClass("upscale"));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.problems[0]).toBe(`I couldn't find a hotel matching "zzqx" in ${city().name}.`);
    });

    it("says which class it could not find another hotel in, when the city has none", async () => {
      // The demo catalogue has one hotel per city, and it is the one being replaced.
      const result = await run([{ type: "change_hotel", cityId: city().id, query: "well-rated hotel", starClass: "lower" }]);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.problems[0]).toBe(`I couldn't find another 3-star hotel in ${city().name}.`);
    });

    describe("when the hotels found say nothing the request does", () => {
      // Google's hotel names rarely include "hotel" or "well-rated", so nothing in them matches those words.
      const named = async (name: string): Promise<typeof places> => {
        const [real] = await places.searchPlaces({ destination: city().name, country: "Thailand", type: "hotel", limit: 1 });
        const stub = { ...real, name, description: "Rooms and a pool", address: "1 Some Road" };
        return {
          name: places.name,
          searchPlaces: async () => [stub],
          getPlaceDetails: async () => stub,
        } as unknown as typeof places;
      };
      const ask = async (query: string, starClass?: "lower") =>
        buildChangeSet(
          inClass("upscale"),
          [{ type: "change_hotel", cityId: city().id, query, ...(starClass ? { starClass } : {}) }],
          { places: await named("The Oriental") },
        );

      it("takes the hotel the class search returned", async () => {
        const result = await ask("well-rated hotel", "lower");
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.changeSet.patch.cities.find((c) => c.id === city().id)!.hotel.name).toBe("The Oriental");
      });

      it("does so when the request is only filler words", async () => {
        expect((await ask("some nice place", "lower")).ok).toBe(true);
      });

      it("is not so easy for a request with no class: the hotel has to match what was asked", async () => {
        expect((await ask("well-rated hotel")).ok).toBe(false);
        expect((await ask("some nice place")).ok).toBe(false);
      });
    });

    it("never puts back the hotel it is replacing", async () => {
      const base = inClass("upscale");
      const current = base.cities.find((c) => c.id === city().id)!.hotel.name;
      const change = await okChange([{ type: "change_hotel", cityId: city().id, query: "well-rated hotel", starClass: "lower" }], base);
      expect(change.patch.cities.find((c) => c.id === city().id)!.hotel.name.toLowerCase()).not.toBe(current.toLowerCase());
    });

    it("looks for hotels of the class it is moving to, and only then", async () => {
      const searches: unknown[] = [];
      const spy = { ...places, name: places.name, searchPlaces: async (p: Parameters<typeof places.searchPlaces>[0]) => (searches.push(p), places.searchPlaces(p)), getPlaceDetails: places.getPlaceDetails.bind(places) };
      const ask = (starClass?: "lower") =>
        buildChangeSet(inClass("upscale"), [{ type: "change_hotel", cityId: city().id, query: city().hotel.name, ...(starClass ? { starClass } : {}) }], { places: spy as typeof places });
      await ask("lower");
      expect(searches.at(-1)).toMatchObject({ type: "hotel", hotelClass: 4 });
      await ask();
      expect(searches.at(-1)).not.toHaveProperty("hotelClass");
    });
  });
});

describe("changing the trip length", () => {
  it("shortens it, moves the end date, and keeps the cities", async () => {
    const change = await okChange([{ type: "set_trip_length", dayCount: 7 }]);
    expect(change.patch.dayCount).toBe(7);
    expect(change.patch.endDate).toBe("2027-01-16");
    expect(change.patch.days).toHaveLength(7);
    expect(change.patch.cities.map((c) => c.name)).toEqual([...trip.cities].sort((a, b) => a.order - b.order).map((c) => c.name));
    expect(change.after.dayCount).toBe(7);
    expect(change.lines[0]).toMatch(/The trip becomes 7 days \(Jan 10 – Jan 16\), from 9\./);
  });

  it("numbers the days again from one", async () => {
    const change = await okChange([{ type: "set_trip_length", dayCount: 6 }]);
    expect(change.patch.days.map((d) => d.dayNumber)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("keeps the activities in the days that remain", async () => {
    const change = await okChange([{ type: "set_trip_length", dayCount: 7 }]);
    const keptIds = new Set(trip.days.map((d) => d.id));
    const survivors = change.patch.days.filter((d) => keptIds.has(d.id));
    expect(survivors.length).toBeGreaterThanOrEqual(5);
    for (const day of survivors) {
      expect(day.activities.map((a) => a.id)).toEqual(trip.days.find((d) => d.id === day.id)!.activities.map((a) => a.id));
    }
  });

  it("lengthens it too", async () => {
    const change = await okChange([{ type: "set_trip_length", dayCount: 11 }]);
    expect(change.patch.dayCount).toBe(11);
    expect(change.patch.endDate).toBe("2027-01-20");
    expect(change.patch.days).toHaveLength(11);
    expect(change.patch.days.every((d) => d.activities.length > 0)).toBe(true);
  });

  it("keeps the flight figure, since an edit does not change the flights", async () => {
    const change = await okChange([{ type: "set_trip_length", dayCount: 7 }]);
    expect(change.patch.budget.categories.flights).toBe(trip.budget.categories.flights);
  });

  it("will not squeeze more cities into a trip than it has days", async () => {
    const tooShort = trip.cities.length - 1;
    expect((await problems([{ type: "set_trip_length", dayCount: tooShort }]))[0]).toMatch(/can't include all/);
  });
});

describe("setting the cities", () => {
  it("adds a city, taking the days from the others", async () => {
    const change = await okChange([
      {
        type: "set_cities",
        cities: [
          { name: "Bangkok", days: 3 },
          { name: "Chiang Mai", days: 3 },
          { name: "Phuket", days: 3 },
        ],
      },
    ]);
    expect(change.patch.cities.map((c) => c.name)).toEqual(["Bangkok", "Chiang Mai", "Phuket"]);
    expect(change.patch.dayCount).toBe(9);
    expect(change.lines).toContain("Add Chiang Mai (3 days).");
    expect(change.lines.some((l) => /^Bangkok: \d+ days? → 3 days\.$/.test(l))).toBe(true);
  });

  it("removes a city and says so", async () => {
    const change = await okChange([{ type: "set_cities", cities: [{ name: "Bangkok", days: 9 }] }]);
    expect(change.patch.cities.map((c) => c.name)).toEqual(["Bangkok"]);
    expect(change.lines).toContain("Remove Phuket.");
  });

  it("changes the length when the new days add up to something else", async () => {
    const change = await okChange([
      {
        type: "set_cities",
        cities: [
          { name: "Bangkok", days: 5 },
          { name: "Phuket", days: 5 },
        ],
      },
    ]);
    expect(change.patch.dayCount).toBe(10);
    expect(change.patch.endDate).toBe("2027-01-19");
  });

  it("notes a new order when only the order changed", async () => {
    const [a, b] = [...trip.cities].sort((x, y) => x.order - y.order);
    const change = await okChange([
      {
        type: "set_cities",
        cities: [
          { name: b.name, days: b.dayCount },
          { name: a.name, days: a.dayCount },
        ],
      },
    ]);
    expect(change.lines).toContain(`New order: ${b.name} → ${a.name}.`);
  });

  it("applies the same checks as a list typed by hand", async () => {
    const result = await problems([
      {
        type: "set_cities",
        cities: [
          { name: "Bangkok", days: 4 },
          { name: "bangkok", days: 5 },
        ],
      },
    ]);
    expect(result.join(" ")).toMatch(/more than once/);
  });

  it("refuses more than the cities allowed", async () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ name: `Place ${i + 1}`, days: 3 }));
    expect((await problems([{ type: "set_cities", cities: many }])).join(" ")).toMatch(/at most/);
  });

  it("refuses a trip longer than the limit", async () => {
    expect((await problems([{ type: "set_cities", cities: [{ name: "Bangkok", days: 45 }] }]))[0]).toMatch(/1 to 30 days/);
  });

  it("does not offer a change that changes nothing", async () => {
    const same = [...trip.cities].sort((x, y) => x.order - y.order).map((c) => ({ name: c.name, days: c.dayCount }));
    expect(await problems([{ type: "set_cities", cities: same }])).toEqual(["That wouldn't change anything in the trip."]);
  });
});

describe("combining operations", () => {
  it("applies them in order against the restructured trip", async () => {
    const change = await okChange([
      { type: "set_trip_length", dayCount: 7 },
      { type: "remove_activity", activityId: firstDay().activities[0].id },
    ]);
    expect(change.patch.dayCount).toBe(7);
    expect(allActivities(change.patch.days).some((a) => a.id === firstDay().activities[0].id)).toBe(false);
  });

  it("reports an operation that points at a day the restructure removed", async () => {
    const lastDay = trip.days[trip.days.length - 1];
    const result = await problems([
      { type: "set_trip_length", dayCount: 5 },
      { type: "add_activity", dayId: lastDay.id, query: "Market" },
    ]);
    expect(result[0]).toMatch(/no day/);
  });

  it("refuses to change the cities and the length together", async () => {
    expect(
      await problems([
        { type: "set_trip_length", dayCount: 7 },
        { type: "set_cities", cities: [{ name: "Bangkok", days: 7 }] },
      ]),
    ).toEqual(["Change either the city list or the trip length in one go, not both."]);
  });

  it("refuses an empty list", async () => {
    expect(await problems([])).toEqual(["There was nothing to change."]);
  });
});

describe("what a change set tells the traveller", () => {
  it("compares before and after", async () => {
    const change = await okChange([{ type: "set_trip_length", dayCount: 7 }]);
    expect(change.before.dayCount).toBe(9);
    expect(change.after.dayCount).toBe(7);
    expect(change.before.cityDays.reduce((s, c) => s + c.days, 0)).toBe(9);
    expect(change.after.cityDays.reduce((s, c) => s + c.days, 0)).toBe(7);
  });

  it("warns when a change takes the plan over budget", async () => {
    // A plan sitting right at its limit: the buffer is 5% of the budget, so the
    // total that leaves almost no headroom is the spend divided by 0.95.
    const spend = trip.budget.estimatedTotal - trip.budget.categories.buffer;
    const total = Math.ceil(spend / 0.95) + 5;
    const atLimit = { ...trip, budget: computeBudgetBreakdown({ cities: trip.cities, days: trip.days, travelers: trip.travelers, currency: trip.currency, userBudget: total, flightCostTotal: trip.budget.categories.flights }) };
    expect(atLimit.budget.estimatedTotal).toBeLessThanOrEqual(atLimit.budget.total);

    const day = atLimit.days[1];
    const city = atLimit.cities.find((c) => c.id === day.cityId)!;
    const costly = (await places.searchPlaces({ destination: city.name, country: "Thailand", type: "attraction", limit: 30 })).find(
      (p) => (p.price?.amount ?? 0) >= 1000 && !day.activities.some((a) => a.name === p.name),
    );
    expect(costly, "the demo data has a costly attraction to add").toBeDefined();

    const change = await okChange([{ type: "add_activity", dayId: day.id, query: costly!.name }], atLimit);
    expect(change.warnings.some((w) => /over your budget/.test(w))).toBe(true);
  });

  it("does not warn about the budget when the change leaves room", async () => {
    const change = await okChange([{ type: "remove_activity", activityId: firstDay().activities[0].id }]);
    expect(change.warnings.some((w) => /over your budget/.test(w))).toBe(false);
  });

  it("warns when a place in the trip is not verified", async () => {
    const change = await okChange([{ type: "set_cities", cities: [{ name: "Bangkok", days: 9 }] }]);
    // The test double's places are flagged unverified (as typed-in places are): the warning must appear whenever one is used.
    const usedUnverified = allActivities(change.patch.days).some((a) => a.isDemoData);
    expect(change.warnings.some((w) => /not verified/.test(w))).toBe(usedUnverified);
  });

  it("only warns about days that became full because of this change", async () => {
    const change = await okChange([{ type: "remove_activity", activityId: firstDay().activities[0].id }]);
    expect(change.warnings.some((w) => /too full/.test(w))).toBe(false);
  });

  it("names the trip it was worked out against, and notices when the trip moves on", async () => {
    const change = await okChange([{ type: "remove_activity", activityId: firstDay().activities[0].id }]);
    expect(change.baseVersion).toBe(tripVersion(trip));
    const edited = { ...trip, days: trip.days.map((d, i) => (i === 0 ? { ...d, activities: d.activities.slice(1) } : d)) };
    expect(tripVersion(edited)).not.toBe(change.baseVersion);
  });
});

describe("statsOf", () => {
  it("reports each city's days and the days that do not fit", () => {
    const stats = statsOf(trip);
    expect(stats.cityDays.reduce((s, c) => s + c.days, 0)).toBe(trip.days.length);
    expect(stats.total).toBe(trip.budget.total);
    expect(Array.isArray(stats.overfullDays)).toBe(true);
  });
});

describe("flights when an edit changes where the trip starts", () => {
  const phuketFirst: EditOperation = {
    type: "set_cities",
    cities: [
      { name: "Phuket", days: 4 },
      { name: "Bangkok", days: 5 },
    ],
  };

  it("starts from a trip that carries a quote", () => {
    expect(trip.flights).toBeTruthy();
    expect(trip.flights!.arrival?.code).toBe("BKK");
  });

  it("re-prices the fare when the first city, and so the arrival airport, changes", async () => {
    const change = await okChange([phuketFirst]);
    const quote = change.patch.flights!;

    expect(quote.arrival?.code).toBe("HKT");
    expect(quote.totalInr).not.toBe(trip.flights!.totalInr);
    // The budget carries the new fare, not the old one.
    expect(change.patch.budget.categories.flights).toBe(fromInr(quote.totalInr, trip.currency));
    expect(change.patch.budget.categories.flights).not.toBe(trip.budget.categories.flights);
    expect(change.lines.some((l) => /^Flights re-estimated \(arriving at Phuket\)/.test(l))).toBe(true);
  });

  it("keeps the origin and the quote day, so only the airport moves the price", async () => {
    const change = await okChange([phuketFirst]);
    expect(change.patch.flights!.origin).toEqual(trip.flights!.origin);
    expect(change.patch.flights!.originAssumed).toBe(trip.flights!.originAssumed);
    expect(change.patch.flights!.quotedOn).toBe(trip.flights!.quotedOn);
  });

  it("leaves the fare alone when the first city stays the same", async () => {
    const change = await okChange([
      {
        type: "set_cities",
        cities: [
          { name: "Bangkok", days: 3 },
          { name: "Phuket", days: 6 },
        ],
      },
    ]);
    expect(change.patch.flights).toEqual(trip.flights);
    expect(change.patch.budget.categories.flights).toBe(trip.budget.categories.flights);
    expect(change.lines.some((l) => /Flights re-estimated/.test(l))).toBe(false);
  });

  it("does not touch the flights for an edit that cannot change them", async () => {
    const change = await okChange([{ type: "remove_activity", activityId: firstDay().activities[0].id }]);
    expect("flights" in change.patch).toBe(false);
    expect(change.patch.budget.categories.flights).toBe(trip.budget.categories.flights);
  });

  it("leaves a trip saved without a quote exactly as it was", async () => {
    const { flights: _quote, ...legacy } = trip;
    void _quote;
    const change = await okChange([phuketFirst], legacy);
    expect("flights" in change.patch).toBe(false);
    expect(change.patch.budget.categories.flights).toBe(trip.budget.categories.flights);
  });

  it("leaves a trip with flights switched off at zero", async () => {
    const off: AgentTrip = {
      ...trip,
      flights: null,
      budget: { ...trip.budget, categories: { ...trip.budget.categories, flights: 0 } },
    };
    const change = await okChange([phuketFirst], off);
    expect("flights" in change.patch).toBe(false);
    expect(change.patch.budget.categories.flights).toBe(0);
  });
});
