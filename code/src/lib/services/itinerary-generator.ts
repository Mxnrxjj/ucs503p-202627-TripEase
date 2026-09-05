import { addDaysIso } from "@/lib/utils";
import {
  findDestinationTemplate,
  GENERIC_ACTIVITY_BANK,
  type ActivityTemplate,
  type CityTemplate,
} from "@/lib/mock-data/destinations";
import { fromInr } from "@/lib/mock-data/fx";
import { computeBudgetBreakdown } from "@/lib/services/budget-engine";
import type { Activity, City, Hotel, TripDay } from "@/types/itinerary";
import type { GeneratedItinerary, TripDraftInput } from "@/types/trip";

/**
 * The itinerary "AI". This is the one place trip content gets generated —
 * components never build itineraries themselves. Today it's a deterministic
 * mock planner (`USE_MOCK_TRIP_DATA`/no AI key), but the shape it returns
 * (`GeneratedItinerary`, validated by `@/lib/validation/trip`) is exactly
 * what a real LLM-backed planner would need to produce, so swapping the
 * body of `generateItinerary` for a real AI call later doesn't touch any
 * caller.
 */

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

function rankByPreferenceMatch(pool: ActivityTemplate[], preferences: string[]): ActivityTemplate[] {
  return [...pool].sort((a, b) => {
    const aScore = a.styles.filter((s) => preferences.includes(s)).length;
    const bScore = b.styles.filter((s) => preferences.includes(s)).length;
    return bScore - aScore;
  });
}

function toActivity(template: ActivityTemplate, time: string, currency: string): Activity {
  return {
    id: makeId("act"),
    name: template.name,
    category: template.category,
    time,
    durationMinutes: template.durationMinutes,
    description: template.description,
    estimatedCost: fromInr(template.estimatedCost, currency),
    currency,
    referenceUrl: template.referenceUrl,
    isDemoData: template.isDemoData,
  };
}

function buildCityFromTemplate(
  template: CityTemplate,
  order: number,
  startDate: string,
  dayCount: number,
  isLastCity: boolean,
  currency: string,
): City {
  const nights = Math.max(1, isLastCity ? dayCount - 1 : dayCount);
  const hotel: Hotel = {
    name: template.hotel.name,
    pricePerNight: fromInr(template.hotel.pricePerNight, currency),
    currency,
    nights,
    referenceUrl: null,
    isDemoData: true,
  };
  return {
    id: makeId("city"),
    name: template.name,
    country: template.country,
    order,
    startDate,
    endDate: addDaysIso(startDate, dayCount - 1),
    dayCount,
    hotel,
    imageQuery: template.imageQuery,
  };
}

function buildDaysForCity(
  city: City,
  template: CityTemplate,
  dayNumberOffset: number,
  preferences: string[],
  currency: string,
  isFirstCity: boolean,
): TripDay[] {
  const rankedAttractions = rankByPreferenceMatch(template.attractions, preferences);
  const days: TripDay[] = [];

  for (let i = 0; i < city.dayCount; i++) {
    const date = addDaysIso(city.startDate, i);
    const activities: Activity[] = [];

    if (i === 0 && !isFirstCity) {
      activities.push(
        toActivity(
          {
            name: `Travel to ${city.name}`,
            category: "transport",
            description: `Transfer from the previous city to ${city.name}.`,
            estimatedCost: 6_000,
            durationMinutes: 180,
            referenceUrl: null,
            isDemoData: true,
            styles: [],
          },
          "07:30",
          currency,
        ),
      );
    }

    activities.push(toActivity(template.breakfast, "09:00", currency));
    activities.push(toActivity(pickRotating(rankedAttractions, i * 2), "10:00", currency));
    activities.push(toActivity(pickRotating(template.lunch, i), "12:30", currency));
    activities.push(toActivity(pickRotating(rankedAttractions, i * 2 + 1), "14:00", currency));
    activities.push(toActivity(pickRotating(template.eveningSpots, i), "18:00", currency));
    activities.push(toActivity(pickRotating(template.dinner, i), "20:00", currency));

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

function buildGenericTemplate(destination: string): CityTemplate {
  return {
    name: destination,
    country: destination,
    imageQuery: `${destination} travel landmark`,
    shareOfTrip: 1,
    hotel: { name: `${destination} Central Hotel (demo)`, pricePerNight: 3_500 },
    breakfast: {
      name: "Breakfast at the hotel",
      category: "food",
      description: "Breakfast before heading out for the day.",
      estimatedCost: 400,
      durationMinutes: 45,
      referenceUrl: null,
      isDemoData: true,
      styles: [],
    },
    lunch: [
      {
        name: "Local lunch",
        category: "food",
        description: "Lunch at a well-reviewed local restaurant.",
        estimatedCost: 700,
        durationMinutes: 60,
        referenceUrl: null,
        isDemoData: true,
        styles: [],
      },
    ],
    dinner: [
      {
        name: "Dinner in the city centre",
        category: "food",
        description: "Dinner at a popular local restaurant.",
        estimatedCost: 900,
        durationMinutes: 90,
        referenceUrl: null,
        isDemoData: true,
        styles: [],
      },
    ],
    attractions: [],
    eveningSpots: [
      {
        name: "Evening stroll in the city centre",
        category: "sightseeing",
        description: "A relaxed evening walk through the main square or promenade.",
        estimatedCost: 0,
        durationMinutes: 90,
        referenceUrl: null,
        isDemoData: true,
        styles: [],
      },
    ],
  };
}

export function generateItinerary(input: TripDraftInput): GeneratedItinerary {
  const dayCount = Math.max(
    1,
    Math.round((new Date(input.endDate).getTime() - new Date(input.startDate).getTime()) / 86_400_000) + 1,
  );

  const template = findDestinationTemplate(input.destination);
  const cityTemplates: CityTemplate[] = template
    ? template.cities
    : [buildGenericTemplate(input.destination)];

  // For a generic destination on a longer trip, split into two demo "zones"
  // so the roadmap still demonstrates a multi-city trip.
  const effectiveTemplates =
    !template && dayCount >= 5
      ? [
          { ...cityTemplates[0], name: `${input.destination} City`, shareOfTrip: 0.55 },
          { ...cityTemplates[0], name: `${input.destination} Coast`, shareOfTrip: 0.45 },
        ]
      : cityTemplates;

  const weights = effectiveTemplates.map((c) => c.shareOfTrip);
  const daysPerCity = splitDaysAcrossCities(dayCount, weights);

  // Generic activity pool, deduped by name, used to pad out generic-destination attractions.
  const genericPool = Array.from(
    new Map(
      input.preferences
        .flatMap((style) => GENERIC_ACTIVITY_BANK[style] ?? [])
        .concat(Object.values(GENERIC_ACTIVITY_BANK).flat())
        .map((t) => [t.name, t] as const),
    ).values(),
  );

  const cities: City[] = [];
  const days: TripDay[] = [];
  let cursorDate = input.startDate;
  let dayOffset = 0;

  effectiveTemplates.forEach((cityTemplate, i) => {
    const count = daysPerCity[i];
    const effectiveTemplate: CityTemplate =
      cityTemplate.attractions.length > 0 ? cityTemplate : { ...cityTemplate, attractions: genericPool };
    const isLast = i === effectiveTemplates.length - 1;
    const city = buildCityFromTemplate(cityTemplate, i, cursorDate, count, isLast, input.currency);
    cities.push(city);
    days.push(
      ...buildDaysForCity(city, effectiveTemplate, dayOffset, input.preferences, input.currency, i === 0),
    );
    cursorDate = addDaysIso(cursorDate, count);
    dayOffset += count;
  });

  const flightCostTotal = fromInr(
    (template?.flightTierPerTraveler ?? 25_000) * input.travelers,
    input.currency,
  );

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
