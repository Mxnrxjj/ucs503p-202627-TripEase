import type { Activity, ActivityCategory } from "@/types/itinerary";

/**
 * How long things take.
 *
 * A model is never asked to invent a duration — it has no way to know, and a
 * confidently wrong "90 minutes" is worse than a transparent default. Instead
 * a provider-supplied duration is used when there is one, and otherwise a
 * category default that's deliberately mid-range. Everything here is an
 * estimate and the UI says so; travellers can edit any duration directly.
 */
const CATEGORY_DEFAULT_MINUTES: Record<ActivityCategory, number> = {
  sightseeing: 90,
  culture: 120,
  adventure: 180,
  beach: 150,
  relaxation: 90,
  shopping: 90,
  nightlife: 120,
  food: 75,
  transport: 0, // handled as a travel segment, not as time spent somewhere
};

export interface ActivityDuration {
  minutes: number;
  isEstimated: boolean;
}

export function estimateActivityDuration(activity: Activity): ActivityDuration {
  if (Number.isFinite(activity.durationMinutes) && activity.durationMinutes > 0) {
    return { minutes: activity.durationMinutes, isEstimated: false };
  }
  return { minutes: CATEGORY_DEFAULT_MINUTES[activity.category] ?? 90, isEstimated: true };
}

/** Time spent *at* places, excluding transport entries (those become segments). */
export function totalActivityMinutes(activities: Activity[]): number {
  return activities
    .filter((a) => a.category !== "transport")
    .reduce((sum, a) => sum + estimateActivityDuration(a).minutes, 0);
}

/**
 * Opening-hours support.
 *
 * The Places integration does not currently request opening hours (they're a
 * separate, billable field group), so `openingHours` is always absent today
 * and this check always returns "unknown". It exists so that turning the field
 * on later is a provider change rather than a feasibility-engine change — and
 * so that missing hours are explicitly *not* an error.
 */
export type OpeningHoursVerdict = "unknown" | "open" | "closed";

export interface OpeningHours {
  /** Minutes from midnight. */
  opensAt: number;
  closesAt: number;
}

export function parseTimeToMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function checkOpeningHours(
  activityTime: string,
  durationMinutes: number,
  hours: OpeningHours | null | undefined,
): OpeningHoursVerdict {
  if (!hours) return "unknown";
  const start = parseTimeToMinutes(activityTime);
  if (start === null) return "unknown";
  const end = start + durationMinutes;
  return start >= hours.opensAt && end <= hours.closesAt ? "open" : "closed";
}
