import { addDaysIso } from "@/lib/utils";
import { findDestinationTemplate } from "@/lib/mock-data/destinations";
import { fromInr } from "@/lib/mock-data/fx";
import { getPlacesProvider } from "@/lib/services/places";
import { PlacesProviderError } from "@/lib/services/places/errors";
import { MockPlacesProvider } from "@/lib/services/places/mock-provider";
import type { PlaceSearchParams, PlacesProvider } from "@/lib/services/places/provider";
import { computeBudgetBreakdown } from "@/lib/services/budget-engine";
import type { Activity, City, Hotel, TripDay } from "@/types/itinerary";
import type { Place } from "@/types/place";
import type { CityPlan } from "@/types/planning";
import type { GeneratedItinerary, TripDraftInput } from "@/types/trip";

/**
 * Turns a validated city plan into a full itinerary. This is the one place
 * trip content gets generated — components never build itineraries
 * themselves, and never call a places provider directly. Every
 * hotel/attraction/restaurant/nightlife recommendation is fetched through
 * `PlacesProvider.searchPlaces` (see `lib/services/places`) rather than read
 * out of hardcoded destination data — swapping the mock provider for a live
 * one (Google Places today, anything else later) changes recommendation
 * quality but touches nothing
 * in this file's callers. The shape returned here (`GeneratedItinerary`,
 * validated by `@/lib/validation/trip`) is also exactly what a real
 * LLM-backed planner would need to produce, so a future AI-generated
 * itinerary (as opposed to an AI-assisted places search) fits the same seam.
 */

const MOCK_FALLBACK = new MockPlacesProvider();

/**
 * A live provider can legitimately come back empty (no hotels indexed for a
 * tiny town) or fail outright (bad key, quota, network blip). Rather than
 * let a gap in one provider call break the whole trip, fall back to the mock
 * provider for that one search — mock content always has *something* for any
 * destination. Every place still carries its own `source`/`isDemoData`, so a
 * hybrid itinerary (mostly-real with a mock-filled gap) is never
 * misrepresented as fully verified.
 */
async function searchWithFallback(provider: PlacesProvider, params: PlaceSearchParams): Promise<Place[]> {
  if (provider.name === "mock") return provider.searchPlaces(params);

  try {
    const results = await provider.searchPlaces(params);
    if (results.length > 0) return results;
  } catch (error) {
    const code = error instanceof PlacesProviderError ? error.code : "unknown";
    console.warn(`[places] live search failed (${code}) for ${params.destination}/${params.type}; using mock data.`);
  }
  return MOCK_FALLBACK.searchPlaces(params);
}

function makeId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}`;
}

/**
 * Pick from `pool` starting at `startIndex`, skipping anything already used
 * today. Falls back to the rotating pick when every candidate is used, so a
 * thin pool still fills the day rather than leaving gaps.
 */
function pickUnused(pool: Place[], startIndex: number, used: Set<string>): Place | null {
  if (pool.length === 0) return null;
  for (let offset = 0; offset < pool.length; offset++) {
    const candidate = pool[(startIndex + offset) % pool.length];
    if (!used.has(candidate.name.toLowerCase())) return candidate;
  }
  return pool[startIndex % pool.length];
}

/** Turn a `Place` into an itinerary `Activity`. Duration falls back to a sane default
 *  when a provider (Google Places) doesn't supply one. */
function placeToActivity(place: Place, time: string, fallbackDurationMinutes = 90): Activity {
  return {
    id: makeId("act"),
    name: place.name,
    category: place.category,
    time,
    durationMinutes: place.durationMinutes ?? fallbackDurationMinutes,
    description: place.description,
    estimatedCost: place.price?.amount ?? 0,
    currency: place.price?.currency ?? "INR",
    referenceUrl: place.source.sourceUrl,
    isDemoData: place.isDemoData,
    location: place.location,
    address: place.address,
    rating: place.rating,
    imageUrl: place.imageUrl,
    source: place.source,
    priceIsEstimate: place.price?.isEstimate ?? true,
  };
}

function placeToHotel(place: Place | null, cityName: string, nights: number, currency: string): Hotel {
  if (!place) {
    // No provider returned anything at all (shouldn't happen — the mock
    // fallback always has content — but a Hotel needs a definite price).
    return {
      name: `${cityName} hotel (demo)`,
      pricePerNight: fromInr(3_500, currency),
      currency,
      nights,
      referenceUrl: null,
      isDemoData: true,
      priceIsEstimate: true,
    };
  }
  return {
    name: place.name,
    pricePerNight: place.price?.amount ?? fromInr(3_500, currency),
    currency,
    nights,
    referenceUrl: place.source.sourceUrl,
    isDemoData: place.isDemoData,
    location: place.location,
    address: place.address,
    rating: place.rating,
    imageUrl: place.imageUrl,
    source: place.source,
    priceIsEstimate: place.price?.isEstimate ?? true,
  };
}

function rankByPreference(places: Place[], preferences: string[]): Place[] {
  return [...places].sort((a, b) => {
    const aScore = a.styleTags.filter((s) => preferences.includes(s)).length;
    const bScore = b.styleTags.filter((s) => preferences.includes(s)).length;
    return bScore - aScore;
  });
}

interface CityPlaces {
  hotel: Place | null;
  attractions: Place[];
  lunch: Place[];
  dinner: Place[];
  breakfast: Place[];
  nightlife: Place[];
}

async function fetchCityPlaces(
  provider: PlacesProvider,
  cityName: string,
  country: string,
  preferences: TripDraftInput["preferences"],
  currency: string,
): Promise<CityPlaces> {
  const base = { destination: cityName, country, currency } satisfies Partial<PlaceSearchParams>;

  // One restaurant search per city, not one per meal. Breakfast, lunch and
  // dinner queries return heavily overlapping results from a live provider
  // anyway, so three searches bought variety we can get locally — at three
  // times the quota cost. Four searches per city instead of six.
  const [hotels, attractions, restaurants, nightlife] = await Promise.all([
    searchWithFallback(provider, { ...base, type: "hotel", limit: 1 }),
    searchWithFallback(provider, { ...base, type: "attraction", preferences, limit: 14 }),
    searchWithFallback(provider, { ...base, type: "restaurant", limit: 12 }),
    searchWithFallback(provider, { ...base, type: "nightlife", limit: 4 }),
  ]);

  const meals = partitionRestaurants(restaurants);

  return {
    hotel: hotels[0] ?? null,
    attractions: rankByPreference(attractions, preferences),
    ...meals,
    nightlife,
  };
}

/**
 * Split one restaurant result set into the three meal pools a day needs.
 *
 * Two kinds of result arrive here. Curated mock content is already tagged with
 * the meals it suits, so those tags are honoured and the demo itinerary comes
 * out exactly as before. Live results carry no meal semantics — Google doesn't
 * say whether somewhere is a breakfast place — so rather than inventing that
 * distinction they're dealt round-robin into three *disjoint* pools. Disjoint
 * matters: it's what structurally prevents the same restaurant turning up as
 * breakfast, lunch and dinner on one day.
 *
 * A pool that would come out empty falls back to the whole list, so a city
 * with only one or two known restaurants still gets meals rather than blank
 * slots. No extra provider requests are made to top the pools up.
 */
export function partitionRestaurants(restaurants: Place[]): {
  breakfast: Place[];
  lunch: Place[];
  dinner: Place[];
} {
  const meals = ["breakfast", "lunch", "dinner"] as const;
  const pools: Record<(typeof meals)[number], Place[]> = { breakfast: [], lunch: [], dinner: [] };

  const tagged = restaurants.filter((p) => (p.mealTypes?.length ?? 0) > 0);
  const untagged = restaurants.filter((p) => (p.mealTypes?.length ?? 0) === 0);

  for (const place of tagged) {
    for (const meal of meals) {
      if (place.mealTypes?.includes(meal)) pools[meal].push(place);
    }
  }
  untagged.forEach((place, index) => {
    pools[meals[index % meals.length]].push(place);
  });

  return {
    breakfast: pools.breakfast.length > 0 ? pools.breakfast : restaurants,
    lunch: pools.lunch.length > 0 ? pools.lunch : restaurants,
    dinner: pools.dinner.length > 0 ? pools.dinner : restaurants,
  };
}

function buildDaysForCity(
  city: City,
  places: CityPlaces,
  dayNumberOffset: number,
  isFirstCity: boolean,
): TripDay[] {
  const days: TripDay[] = [];

  for (let i = 0; i < city.dayCount; i++) {
    const date = addDaysIso(city.startDate, i);
    const activities: Activity[] = [];

    if (i === 0 && !isFirstCity) {
      activities.push({
        id: makeId("act"),
        name: `Travel to ${city.name}`,
        category: "transport",
        time: "07:30",
        durationMinutes: 180,
        description: `Transfer from the previous city to ${city.name}.`,
        estimatedCost: fromInr(6_000, city.hotel.currency),
        currency: city.hotel.currency,
        referenceUrl: null,
        isDemoData: true,
        priceIsEstimate: true,
      });
    }

    // A live provider's breakfast/lunch/dinner searches overlap heavily — the
    // same well-rated cafe is often the top hit for all three — so a day is
    // built by taking the first candidate it hasn't already used.
    const usedToday = new Set<string>();
    const add = (pool: Place[], startIndex: number, time: string, duration?: number) => {
      const place = pickUnused(pool, startIndex, usedToday);
      if (!place) return;
      usedToday.add(place.name.toLowerCase());
      activities.push(placeToActivity(place, time, duration));
    };

    add(places.breakfast, i, "09:00", 45);
    add(places.attractions, i * 2, "10:00");
    add(places.lunch, i, "12:30", 60);
    add(places.attractions, i * 2 + 1, "14:00");
    add(places.nightlife, i, "18:00");
    add(places.dinner, i, "20:00", 90);

    days.push({
      id: makeId("day"),
      dayNumber: dayNumberOffset + i + 1,
      date,
      cityId: city.id,
      activities,
    });
  }

  return days;
}

function flightTierPerTraveler(destination: string): number {
  return findDestinationTemplate(destination)?.flightTierPerTraveler ?? 25_000;
}

/** Match a planned city to one already in the trip, by name. Renaming a city
 *  therefore counts as a different place and correctly gets fresh lookups. */
function findExistingCity(
  existing: { cities: City[]; days: TripDay[] } | undefined,
  name: string,
): City | null {
  if (!existing) return null;
  const wanted = name.trim().toLowerCase();
  return existing.cities.find((c) => c.name.trim().toLowerCase() === wanted) ?? null;
}

/**
 * Build the full itinerary for an already-validated city allocation.
 *
 * The city decision arrives from `lib/services/planning` (AI or fallback) and
 * has already passed Zod plus TripEase's constraint checks by the time it gets
 * here — this function's job is turning it into real days of real places.
 * Passing the plan in (rather than deciding here) is what makes the generator
 * destination-agnostic: it no longer knows or cares that Thailand is special.
 */
export async function generateItinerary(
  input: TripDraftInput,
  plan: CityPlan,
  /**
   * An existing itinerary to salvage from, used when the traveller edits the
   * city list. A city that's still present keeps its hotel and its already-
   * edited activities; only genuinely new cities (or extra days added to an
   * existing one) cost a fresh places lookup. Without this, adding one city
   * would silently discard every edit made to the others.
   */
  existing?: { cities: City[]; days: TripDay[] },
  /** Injectable for tests; defaults to whatever the environment configures. */
  provider: PlacesProvider = getPlacesProvider(),
): Promise<GeneratedItinerary> {
  const dayCount = Math.max(
    1,
    Math.round((new Date(input.endDate).getTime() - new Date(input.startDate).getTime()) / 86_400_000) + 1,
  );

  const cities: City[] = [];
  const days: TripDay[] = [];
  let cursorDate = input.startDate;
  let dayOffset = 0;

  for (let i = 0; i < plan.cities.length; i++) {
    const allocation = plan.cities[i];
    const count = allocation.days;
    const isLast = i === plan.cities.length - 1;
    const nights = Math.max(1, isLast ? count - 1 : count);

    // The destination doubles as the country hint for place lookups: searching
    // "Rome, Italy" is far more precise than searching "Rome".
    const country = input.destination;

    const previous = findExistingCity(existing, allocation.name);
    const previousDays = previous ? existing!.days.filter((d) => d.cityId === previous.id) : [];
    const reusableDays = Math.min(previousDays.length, count);
    // Only pay for a places lookup when there's something new to fill.
    const needsPlaces = !previous || reusableDays < count;

    const places = needsPlaces
      ? await fetchCityPlaces(provider, allocation.name, country, input.preferences, input.currency)
      : null;

    const hotel = previous
      ? { ...previous.hotel, nights }
      : placeToHotel(places!.hotel, allocation.name, nights, input.currency);

    const city: City = {
      id: previous?.id ?? makeId("city"),
      name: allocation.name,
      country,
      order: i,
      startDate: cursorDate,
      endDate: addDaysIso(cursorDate, count - 1),
      dayCount: count,
      hotel,
      imageQuery: `${allocation.name} ${country}`,
    };
    cities.push(city);

    const freshDays = places ? buildDaysForCity(city, places, dayOffset, i === 0) : [];
    for (let dayIndex = 0; dayIndex < count; dayIndex++) {
      const kept = dayIndex < reusableDays ? previousDays[dayIndex] : null;
      const source = kept ?? freshDays[dayIndex];
      if (!source) continue;
      days.push({
        ...source,
        // Dates and numbering always come from the new allocation; only the
        // activities are carried over.
        cityId: city.id,
        dayNumber: dayOffset + dayIndex + 1,
        date: addDaysIso(cursorDate, dayIndex),
      });
    }

    cursorDate = addDaysIso(cursorDate, count);
    dayOffset += count;
  }

  const flightCostTotal = fromInr(flightTierPerTraveler(input.destination) * input.travelers, input.currency);

  const budget = computeBudgetBreakdown({
    cities,
    days,
    travelers: input.travelers,
    currency: input.currency,
    userBudget: input.budget,
    flightCostTotal,
  });

  return {
    destination: input.destination,
    title: `${input.destination} Adventure`,
    startDate: input.startDate,
    endDate: input.endDate,
    dayCount,
    currency: input.currency,
    cities,
    days,
    budget,
  };
}
