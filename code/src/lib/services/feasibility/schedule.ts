import type { Activity } from "@/types/itinerary";
import { parseTimeToMinutes } from "./durations";
import { isValidCoordinate } from "./geo";
import { getTravelTimeProvider, type TravelTimeProvider } from "./travel-time";

/**
 * Clock times for a day's stops.
 *
 * A day is a list in the order it is travelled, and each stop carries a start
 * time. These helpers keep the two telling the same story: the list is in
 * clock order, and a stop never starts before the traveller can have got there
 * from the one before.
 *
 * Pure and synchronous: no network, no Firestore, no React.
 */

/** Starts that were pushed later are rounded up to this, so "15:14" doesn't appear. */
const GRID_MINUTES = 5;
/** The latest a start is ever written as, so a pushed time is still a valid "HH:MM". */
const LAST_START_MINUTES = 23 * 60 + 55;
/** Where a stop with no usable time goes when nothing comes before it. */
const DEFAULT_START_MINUTES = 10 * 60;

/** A transfer between cities is shown as travel, not visited, so it is never moved. */
const isStop = (activity: Activity) => activity.category !== "transport";

function formatClock(minutes: number): string {
  const clamped = Math.max(0, Math.min(Math.round(minutes), LAST_START_MINUTES));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

function roundUpToGrid(minutes: number): number {
  return Math.ceil(minutes / GRID_MINUTES) * GRID_MINUTES;
}

/** How long a stop takes, tolerating a missing or nonsense duration. */
function lengthOf(activity: Activity): number {
  return Number.isFinite(activity.durationMinutes) ? Math.max(0, activity.durationMinutes) : 0;
}

/**
 * Put activities in clock order. Stable: stops at the same time keep the order
 * they came in, and a stop whose time can't be read goes last rather than being
 * guessed at.
 */
export function sortByTime<T extends Pick<Activity, "time">>(items: T[]): T[] {
  return items
    .map((item, index) => ({ item, index, at: parseTimeToMinutes(item.time) }))
    .sort((a, b) => {
      if (a.at === b.at) return a.index - b.index;
      if (a.at === null) return 1;
      if (b.at === null) return -1;
      return a.at - b.at;
    })
    .map((entry) => entry.item);
}

/** Minutes needed to get from one stop to the next; zero if either has no coordinates. */
function hopMinutes(from: Activity, to: Activity, provider: TravelTimeProvider): number {
  if (!isValidCoordinate(from.location) || !isValidCoordinate(to.location)) return 0;
  return provider.estimate(from.location, to.location, { sameCity: true }).minutes;
}

/**
 * Walk the stops in the order given and move any that starts before the
 * traveller could arrive. A start is only ever pushed later, never earlier, so
 * a day that already has room is returned exactly as it was.
 *
 * `activities` must already be in the order the day is travelled. City
 * transfers are left where they are, and the result is in clock order.
 */
export function settleTimes(
  activities: Activity[],
  provider: TravelTimeProvider = getTravelTimeProvider(),
): Activity[] {
  const transfers = activities.filter((a) => !isStop(a));
  let previous: Activity | null = null;
  let previousEnd = 0;

  const settled = activities.filter(isStop).map((stop) => {
    const planned = parseTimeToMinutes(stop.time);
    const earliest = previous ? previousEnd + hopMinutes(previous, stop, provider) : null;

    let start: number;
    if (planned !== null && (earliest === null || planned >= earliest)) start = planned;
    else if (earliest === null) start = DEFAULT_START_MINUTES;
    else start = roundUpToGrid(earliest);

    const next: Activity = start === planned ? stop : { ...stop, time: formatClock(start) };
    previous = next;
    previousEnd = start + lengthOf(next);
    return next;
  });

  return sortByTime([...transfers, ...settled]);
}

/**
 * The day after the traveller drags stops into a new order: the places move, the
 * times stay. The day's start times are dealt out again, earliest first, in the
 * new order, then settled so that none starts before the traveller could get
 * there.
 *
 * `orderedIds` is trusted only for order. An id that isn't on the day is
 * ignored, a repeated id counts once, and a stop it leaves out goes after the
 * others — nothing is ever dropped or duplicated.
 */
export function retimeInOrder(
  activities: Activity[],
  orderedIds: string[],
  provider: TravelTimeProvider = getTravelTimeProvider(),
): Activity[] {
  const waiting = new Map<string, Activity[]>();
  for (const activity of activities) {
    const group = waiting.get(activity.id);
    if (group) group.push(activity);
    else waiting.set(activity.id, [activity]);
  }

  const ordered: Activity[] = [];
  for (const id of orderedIds) {
    const next = waiting.get(id)?.shift();
    if (next) ordered.push(next);
  }
  for (const group of waiting.values()) ordered.push(...group);

  const stops = ordered.filter(isStop);
  const slots = stops
    .map((a) => parseTimeToMinutes(a.time))
    .filter((minutes): minutes is number => minutes !== null)
    .sort((a, b) => a - b);

  const reassigned = stops.map((stop, i) =>
    i < slots.length ? { ...stop, time: formatClock(slots[i]) } : stop,
  );

  return settleTimes([...ordered.filter((a) => !isStop(a)), ...reassigned], provider);
}
