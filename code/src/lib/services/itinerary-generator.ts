import { addDaysIso } from "@/lib/utils";
import { findDestinationTemplate } from "@/lib/mock-data/destinations";
import { fromInr } from "@/lib/mock-data/fx";
import { getPlacesProvider } from "@/lib/services/places";
import { MockPlacesProvider } from "@/lib/services/places/mock-provider";
import type { PlaceSearchParams, PlacesProvider } from "@/lib/services/places/provider";
import { computeBudgetBreakdown } from "@/lib/services/budget-engine";
import type { Activity, City, Hotel, TripDay } from "@/types/itinerary";
import type { Place } from "@/types/place";
import type { GeneratedItinerary, TripDraftInput } from "@/types/trip";

/**
 * The itinerary "AI". This is the one place trip content gets generated —
 * components never build itineraries themselves, and never call a places
 * provider directly. As of Iteration 2, every hotel/attraction/restaurant/
 * nightlife recommendation is fetched through `PlacesProvider.searchPlaces`
 * (see `lib/services/places`) rather than read out of hardcoded Thailand
 * data — swapping the mock provider for a live one (Google Places today,
 * anything else later) changes recommendation quality but touches nothing
 * in this file's callers. The shape returned here (`GeneratedItinerary`,
 * validated by `@/lib/validation/trip`) is also exactly what a real
 * LLM-backed planner would need to produce, so a future AI-generated
 * itinerary (as opposed to an AI-assisted places search) fits the same seam.
 */

const MOCK_FALLBACK = new MockPlacesProvider();

/**
 * A live provider can legitimately come back empty (no hotels indexed for
 * a tiny town, a quota error, a network blip). Rather than let a gap in
 * one provider call break the whole trip, fall back to the mock provider
 * for that one search — mock content always has *something* for any
 * destination. Every place still carries its own `source`/`isDemoData`, so
 * a hybrid itinerary (mostly-real with a mock-filled gap) is never
 * misrepresented as fully verified.
 */
async function searchWithFallback(provider: PlacesProvider, params: PlaceSearchParams): Promise<Place[]> {
  const results = await provider.searchPlaces(params);
  if (results.length > 0 || provider.name === "mock") return results;
  return MOCK_FALLBACK.searchPlaces(params);
}

function makeId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}`;
}

function splitDaysAcrossCities(dayCount: number, weights: number[]): number[] {
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (w / totalWeight) * dayCount);
  const floors = raw.map((r) => Math.max(1, Math.floor(r)));
  let assigned = floors.reduce((a, b) => a + b, 0);
  // Distribute any remaining days to the cities with the largest fractional part.
  const fractional = raw.map((r, i) => ({ i, frac: r - Math.floor(r) }));
  fractional.sort((a, b) => b.frac - a.frac);
  let idx = 0;
  while (assigned < dayCount) {
    floors[fractional[idx % fractional.length].i] += 1;
    assigned += 1;
    idx += 1;
  }
  // If rounding overshot the total (small day counts, many cities), trim from the smallest.
  while (assigned > dayCount) {
    const maxIdx = floors.indexOf(Math.max(...floors));
    if (floors[maxIdx] <= 1) break;
    floors[maxIdx] -= 1;
    assigned -= 1;
  }
  return floors;
}

function pickRotating<T>(pool: T[], index: number): T {
  return pool[index % pool.length];
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

  const [hotels, attractions, breakfast, lunch, dinner, nightlife] = await Promise.all([
    searchWithFallback(provider, { ...base, type: "hotel", limit: 1 }),
    searchWithFallback(provider, { ...base, type: "attraction", preferences, limit: 14 }),
    searchWithFallback(provider, { ...base, type: "restaurant", mealType: "breakfast", limit: 3 }),
    searchWithFallback(provider, { ...base, type: "restaurant", mealType: "lunch", limit: 6 }),
    searchWithFallback(provider, { ...base, type: "restaurant", mealType: "dinner", limit: 6 }),
    searchWithFallback(provider, { ...base, type: "nightlife", limit: 4 }),
  ]);

  return {
    hotel: hotels[0] ?? null,
    attractions: rankByPreference(attractions, preferences),
    breakfast,
    lunch,
    dinner,
    nightlife,
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

    if (places.breakfast.length > 0) {
      activities.push(placeToActivity(pickRotating(places.breakfast, i), "09:00", 45));
    }
    if (places.attractions.length > 0) {
      activities.push(placeToActivity(pickRotating(places.attractions, i * 2), "10:00"));
    }
    if (places.lunch.length > 0) {
      activities.push(placeToActivity(pickRotating(places.lunch, i), "12:30", 60));
    }
    if (places.attractions.length > 0) {
      activities.push(placeToActivity(pickRotating(places.attractions, i * 2 + 1), "14:00"));
    }
    if (places.nightlife.length > 0) {
      activities.push(placeToActivity(pickRotating(places.nightlife, i), "18:00"));
    }
    if (places.dinner.length > 0) {
      activities.push(placeToActivity(pickRotating(places.dinner, i), "20:00", 90));
    }

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

interface CityPlan {
  name: string;
  country: string;
  shareOfTrip: number;
  imageQuery: string;
}

/** Which cities to visit — a lightweight, still-static breakdown. Iteration 2 replaces
 *  hardcoded PLACE content with the places service; picking the cities themselves
 *  (a geocoding/region-breakdown concern) is intentionally out of scope for it. */
function planCities(destination: string, dayCount: number): CityPlan[] {
  const template = findDestinationTemplate(destination);
  if (template) {
    return template.cities.map((c) => ({
      name: c.name,
      country: c.country,
      shareOfTrip: c.shareOfTrip,
      imageQuery: c.imageQuery,
    }));
  }
  if (dayCount >= 5) {
    return [
      { name: `${destination} City`, country: destination, shareOfTrip: 0.55, imageQuery: `${destination} city` },
      { name: `${destination} Coast`, country: destination, shareOfTrip: 0.45, imageQuery: `${destination} coast` },
    ];
  }
  return [{ name: destination, country: destination, shareOfTrip: 1, imageQuery: `${destination} travel landmark` }];
}

function flightTierPerTraveler(destination: string): number {
  return findDestinationTemplate(destination)?.flightTierPerTraveler ?? 25_000;
}

export async function generateItinerary(input: TripDraftInput): Promise<GeneratedItinerary> {
  const dayCount = Math.max(
    1,
    Math.round((new Date(input.endDate).getTime() - new Date(input.startDate).getTime()) / 86_400_000) + 1,
  );

  const provider = getPlacesProvider();
  const cityPlans = planCities(input.destination, dayCount);
  const daysPerCity = splitDaysAcrossCities(
    dayCount,
    cityPlans.map((c) => c.shareOfTrip),
  );

  const cities: City[] = [];
  const days: TripDay[] = [];
  let cursorDate = input.startDate;
  let dayOffset = 0;

  for (let i = 0; i < cityPlans.length; i++) {
    const plan = cityPlans[i];
    const count = daysPerCity[i];
    const isLast = i === cityPlans.length - 1;
    const nights = Math.max(1, isLast ? count - 1 : count);

    const places = await fetchCityPlaces(provider, plan.name, plan.country, input.preferences, input.currency);
    const hotel = placeToHotel(places.hotel, plan.name, nights, input.currency);

    const city: City = {
      id: makeId("city"),
      name: plan.name,
      country: plan.country,
      order: i,
      startDate: cursorDate,
      endDate: addDaysIso(cursorDate, count - 1),
      dayCount: count,
      hotel,
      imageQuery: plan.imageQuery,
    };
    cities.push(city);
    days.push(...buildDaysForCity(city, places, dayOffset, i === 0));

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
