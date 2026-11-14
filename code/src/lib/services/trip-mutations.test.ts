import { beforeAll, describe, expect, it } from "vitest";
import { parseTimeToMinutes } from "@/lib/services/feasibility";
import { getTravelTimeProvider } from "@/lib/services/feasibility/travel-time";
import { addActivity, reorderActivities, updateActivity } from "@/lib/services/trip-mutations";
import { buildThailandTrip } from "@/test-support/trip-fixture";
import type { Activity } from "@/types/itinerary";
import type { Trip } from "@/types/trip";

/**
 * How a day's activities and their clock times behave when the traveller
 * adds, edits or drags one. The day under test is written out by hand so each
 * test can see exactly what goes in.
 */

function act(id: string, time: string, durationMinutes = 60, location: Activity["location"] = null): Activity {
  return {
    id,
    name: id,
    category: "sightseeing",
    time,
    durationMinutes,
    description: "",
    estimatedCost: 100,
    currency: "INR",
    referenceUrl: null,
    isDemoData: false,
    location,
  };
}

let base: Trip;

beforeAll(async () => {
  const agentTrip = await buildThailandTrip();
  base = { ...agentTrip, ownerId: "u1", status: "ready", createdAt: new Date(0), updatedAt: new Date(0) };
});

/** The fixture trip with its first day holding exactly these activities. */
function withDay(activities: Activity[]): { trip: Trip; dayId: string } {
  const [first, ...rest] = base.days;
  return { trip: { ...base, days: [{ ...first, activities }, ...rest] }, dayId: first.id };
}

const firstDay = (days: Trip["days"]) => days[0];
const ids = (activities: Activity[]) => activities.map((a) => a.id);
const stamps = (activities: Activity[]) => activities.map((a) => `${a.id}@${a.time}`);

describe("reordering a day", () => {
  it("puts the stops in the new order and moves the times with the places", () => {
    const { trip, dayId } = withDay([act("a", "09:00"), act("b", "11:00"), act("c", "15:00")]);
    const { days } = reorderActivities(trip, dayId, ["c", "a", "b"]);
    expect(stamps(firstDay(days).activities)).toEqual(["c@09:00", "a@11:00", "b@15:00"]);
  });

  it("leaves the times reading in order, which they did not after a drag before", () => {
    const { trip, dayId } = withDay([act("a", "09:00"), act("b", "12:30"), act("c", "20:00")]);
    const { days } = reorderActivities(trip, dayId, ["b", "c", "a"]);
    const clock = firstDay(days).activities.map((a) => parseTimeToMinutes(a.time)!);
    expect(clock).toEqual([...clock].sort((x, y) => x - y));
    expect(ids(firstDay(days).activities)).toEqual(["b", "c", "a"]);
  });

  it("does not start a stop before the traveller could get there", () => {
    const near = { lat: 13.75, lng: 100.5 };
    const far = { lat: 13.8, lng: 100.55 };
    const { trip, dayId } = withDay([act("a", "09:00", 60, near), act("b", "10:00", 60, far)]);
    const { days } = reorderActivities(trip, dayId, ["b", "a"]);
    const [first, second] = firstDay(days).activities;
    const hop = getTravelTimeProvider().estimate(far, near, { sameCity: true }).minutes;
    expect(first.id).toBe("b");
    expect(parseTimeToMinutes(second.time)!).toBeGreaterThanOrEqual(parseTimeToMinutes(first.time)! + 60 + hop);
  });

  it("keeps every stop when the order leaves one out or names one that is not there", () => {
    const { trip, dayId } = withDay([act("a", "09:00"), act("b", "11:00"), act("c", "15:00")]);
    const { days } = reorderActivities(trip, dayId, ["ghost", "c"]);
    expect(ids(firstDay(days).activities).sort()).toEqual(["a", "b", "c"]);
    expect(ids(firstDay(days).activities)[0]).toBe("c");
  });

  it("only touches the day it was asked about", () => {
    const { trip, dayId } = withDay([act("a", "09:00"), act("b", "11:00")]);
    const { days } = reorderActivities(trip, dayId, ["b", "a"]);
    days.slice(1).forEach((day, i) => expect(day).toBe(trip.days[i + 1]));
  });

  it("changes nothing for a day that is not in the trip", () => {
    const { trip } = withDay([act("a", "09:00"), act("b", "11:00")]);
    const { days } = reorderActivities(trip, "no-such-day", ["b", "a"]);
    days.forEach((day, i) => expect(day).toBe(trip.days[i]));
  });

  it("keeps the budget in step: the same stops cost the same in any order", () => {
    const { trip, dayId } = withDay([act("a", "09:00"), act("b", "11:00")]);
    const forward = reorderActivities(trip, dayId, ["a", "b"]);
    const backward = reorderActivities(trip, dayId, ["b", "a"]);
    expect(backward.budget.estimatedTotal).toBe(forward.budget.estimatedTotal);
  });

  it("does not change the trip it was given", () => {
    const { trip, dayId } = withDay([act("a", "09:00"), act("b", "11:00")]);
    const before = JSON.stringify(trip);
    reorderActivities(trip, dayId, ["b", "a"]);
    expect(JSON.stringify(trip)).toBe(before);
  });
});

describe("adding an activity", () => {
  it("puts it where its time says, not at the end", () => {
    const { trip, dayId } = withDay([act("a", "09:00"), act("c", "15:00")]);
    const { days } = addActivity(trip, dayId, act("new", "12:00"));
    expect(ids(firstDay(days).activities)).toEqual(["a", "new", "c"]);
  });

  it("puts one earlier than everything first, and one later than everything last", () => {
    const { trip, dayId } = withDay([act("a", "10:00"), act("b", "14:00")]);
    expect(ids(firstDay(addActivity(trip, dayId, act("early", "07:30")).days).activities)).toEqual(["early", "a", "b"]);
    expect(ids(firstDay(addActivity(trip, dayId, act("late", "21:00")).days).activities)).toEqual(["a", "b", "late"]);
  });

  it("puts it after the ones already at that time", () => {
    const { trip, dayId } = withDay([act("a", "12:00"), act("b", "12:00")]);
    expect(ids(firstDay(addActivity(trip, dayId, act("new", "12:00")).days).activities)).toEqual(["a", "b", "new"]);
  });

  it("works on an empty day", () => {
    const { trip, dayId } = withDay([]);
    expect(ids(firstDay(addActivity(trip, dayId, act("only", "12:00")).days).activities)).toEqual(["only"]);
  });

  it("adds its cost to the budget", () => {
    const { trip, dayId } = withDay([act("a", "09:00")]);
    const before = reorderActivities(trip, dayId, ["a"]).budget.estimatedTotal;
    const after = addActivity(trip, dayId, act("new", "12:00")).budget.estimatedTotal;
    expect(after).toBeGreaterThan(before);
  });

  it("only touches the day it was added to", () => {
    const { trip, dayId } = withDay([act("a", "09:00")]);
    const { days } = addActivity(trip, dayId, act("new", "12:00"));
    days.slice(1).forEach((day, i) => expect(day).toBe(trip.days[i + 1]));
  });
});

describe("editing an activity", () => {
  it("moves it to where its new time belongs", () => {
    const { trip, dayId } = withDay([act("a", "09:00"), act("b", "12:00"), act("c", "15:00")]);
    const { days } = updateActivity(trip, dayId, "a", { time: "16:00" });
    expect(stamps(firstDay(days).activities)).toEqual(["b@12:00", "c@15:00", "a@16:00"]);
  });

  it("moves a later one up when it is given an earlier time", () => {
    const { trip, dayId } = withDay([act("a", "09:00"), act("b", "12:00"), act("c", "15:00")]);
    const { days } = updateActivity(trip, dayId, "c", { time: "08:00" });
    expect(ids(firstDay(days).activities)).toEqual(["c", "a", "b"]);
  });

  it("applies the rest of the patch as before", () => {
    const { trip, dayId } = withDay([act("a", "09:00"), act("b", "12:00")]);
    const { days } = updateActivity(trip, dayId, "b", { name: "Renamed", estimatedCost: 999 });
    expect(firstDay(days).activities[1]).toMatchObject({ id: "b", name: "Renamed", estimatedCost: 999, time: "12:00" });
  });

  it("leaves the order alone when the time is not what changed", () => {
    // A day saved with its times out of order is not rearranged by renaming a stop.
    const { trip, dayId } = withDay([act("late", "15:00"), act("early", "09:00")]);
    const { days } = updateActivity(trip, dayId, "early", { name: "Renamed" });
    expect(ids(firstDay(days).activities)).toEqual(["late", "early"]);
  });

  it("leaves the order alone when the time is set to what it already was", () => {
    const { trip, dayId } = withDay([act("late", "15:00"), act("early", "09:00")]);
    const { days } = updateActivity(trip, dayId, "early", { time: "09:00" });
    expect(ids(firstDay(days).activities)).toEqual(["late", "early"]);
  });

  it("changes nothing for an activity that is not on the day", () => {
    const { trip, dayId } = withDay([act("late", "15:00"), act("early", "09:00")]);
    const { days } = updateActivity(trip, dayId, "ghost", { time: "01:00" });
    expect(stamps(firstDay(days).activities)).toEqual(["late@15:00", "early@09:00"]);
  });
});
