import { describe, expect, it } from "vitest";
import { retimeInOrder, settleTimes, sortByTime } from "@/lib/services/feasibility/schedule";
import type { TravelTimeProvider } from "@/lib/services/feasibility/travel-time";
import type { Activity, ActivityCategory } from "@/types/itinerary";

/** Travel time is the longitude gap in thousandths of a degree: 0.010 apart = 10 minutes. */
const provider: TravelTimeProvider = {
  name: "stub",
  estimate: (from, to) => ({
    distanceKm: 1,
    minutes: Math.round(Math.abs((to?.lng ?? 0) - (from?.lng ?? 0)) * 1000),
    mode: "car",
    isEstimated: true,
  }),
};

function act(
  id: string,
  time: string,
  durationMinutes: number,
  lng: number | null = 0,
  category: ActivityCategory = "sightseeing",
): Activity {
  return {
    id,
    name: id,
    category,
    time,
    durationMinutes,
    description: "",
    estimatedCost: 0,
    currency: "INR",
    referenceUrl: null,
    isDemoData: false,
    location: lng === null ? null : { lat: 10, lng },
  };
}

const times = (activities: Activity[]) => activities.map((a) => `${a.id}@${a.time}`);

describe("sortByTime", () => {
  it("puts stops in clock order", () => {
    expect(sortByTime([act("c", "14:00", 60), act("a", "09:00", 60), act("b", "10:30", 60)]).map((a) => a.id)).toEqual(["a", "b", "c"]);
  });

  it("compares clock time, not text: 9:30 comes before 10:00", () => {
    expect(sortByTime([act("late", "10:00", 60), act("early", "9:30", 60)]).map((a) => a.id)).toEqual(["early", "late"]);
  });

  it("keeps the given order for stops at the same time", () => {
    expect(sortByTime([act("x", "12:00", 60), act("y", "12:00", 60), act("z", "12:00", 60)]).map((a) => a.id)).toEqual(["x", "y", "z"]);
  });

  it("puts a time it cannot read last, in the order it came", () => {
    const sorted = sortByTime([act("bad1", "soon", 60), act("ok", "15:00", 60), act("bad2", "", 60), act("ok2", "08:00", 60)]);
    expect(sorted.map((a) => a.id)).toEqual(["ok2", "ok", "bad1", "bad2"]);
  });

  it("handles an empty or single list and leaves its input alone", () => {
    expect(sortByTime([])).toEqual([]);
    const input = [act("b", "11:00", 60), act("a", "09:00", 60)];
    const copy = [...input];
    sortByTime(input);
    expect(input).toEqual(copy);
  });
});

describe("settleTimes", () => {
  it("returns a day that already has room exactly as it was", () => {
    const day = [act("a", "09:00", 60, 0), act("b", "11:00", 60, 0.03), act("c", "14:00", 60, 0.06)];
    const settled = settleTimes(day, provider);
    expect(times(settled)).toEqual(["a@09:00", "b@11:00", "c@14:00"]);
    settled.forEach((a, i) => expect(a).toBe(day[i]));
  });

  it("moves a stop that starts before the traveller could get there", () => {
    // a ends 11:00, b is 30 minutes away, so b can't start before 11:30
    const settled = settleTimes([act("a", "10:00", 60, 0), act("b", "11:00", 60, 0.03)], provider);
    expect(times(settled)).toEqual(["a@10:00", "b@11:30"]);
  });

  it("allows a stop to start exactly when the traveller arrives", () => {
    const settled = settleTimes([act("a", "10:00", 60, 0), act("b", "11:30", 60, 0.03)], provider);
    expect(times(settled)).toEqual(["a@10:00", "b@11:30"]);
  });

  it("allows a start that is exactly the arrival time even when it is not on the five-minute grid", () => {
    const settled = settleTimes([act("a", "10:00", 60, 0), act("b", "11:07", 60, 0.007)], provider);
    expect(settled[1].time).toBe("11:07");
  });

  it("rounds a pushed start up to the next five minutes", () => {
    const settled = settleTimes([act("a", "10:00", 60, 0), act("b", "11:00", 60, 0.007)], provider);
    expect(settled[1].time).toBe("11:10");
  });

  it("does not round a start that did not need to move", () => {
    const settled = settleTimes([act("a", "10:07", 60, 0), act("b", "13:03", 60, 0.01)], provider);
    expect(times(settled)).toEqual(["a@10:07", "b@13:03"]);
  });

  it("carries a push on to the stops after it", () => {
    const settled = settleTimes(
      [act("a", "10:00", 120, 0), act("b", "11:00", 60, 0.02), act("c", "12:00", 60, 0.04)],
      provider,
    );
    // b: 12:00 + 20 = 12:20; c: 13:20 + 20 = 13:40
    expect(times(settled)).toEqual(["a@10:00", "b@12:20", "c@13:40"]);
  });

  it("never moves a stop earlier", () => {
    const settled = settleTimes([act("a", "08:00", 30, 0), act("b", "20:00", 30, 0.01)], provider);
    expect(settled[1].time).toBe("20:00");
  });

  it("does not add travel between stops with no coordinates", () => {
    const settled = settleTimes([act("a", "10:00", 60, null), act("b", "11:00", 60, 0.5), act("c", "12:00", 60, null)], provider);
    expect(times(settled)).toEqual(["a@10:00", "b@11:00", "c@12:00"]);
  });

  it("leaves a city transfer where it is and does not travel from it", () => {
    const transfer = act("transfer", "09:00", 600, 5, "transport");
    const settled = settleTimes([transfer, act("a", "10:00", 60, 0)], provider);
    expect(times(settled)).toEqual(["transfer@09:00", "a@10:00"]);
    expect(settled[0]).toBe(transfer);
  });

  it("places a city transfer in clock order among the stops", () => {
    const settled = settleTimes([act("a", "08:00", 30, 0), act("transfer", "09:00", 60, 0, "transport"), act("b", "10:00", 30, 0)], provider);
    expect(settled.map((a) => a.id)).toEqual(["a", "transfer", "b"]);
  });

  it("gives a stop with no readable time a start after the one before it", () => {
    const settled = settleTimes([act("a", "10:00", 60, 0), act("b", "whenever", 60, 0.012)], provider);
    // 11:00 + 12 = 11:12, rounded up to 11:15
    expect(settled[1].time).toBe("11:15");
  });

  it("gives a first stop with no readable time a mid-morning start", () => {
    expect(settleTimes([act("a", "", 60, 0)], provider)[0].time).toBe("10:00");
  });

  it("never writes a time past 23:55", () => {
    const settled = settleTimes([act("a", "22:30", 120, 0), act("b", "23:00", 60, 0.05)], provider);
    expect(settled[1].time).toBe("23:55");
    expect(settled.every((a) => /^\d{2}:\d{2}$/.test(a.time))).toBe(true);
  });

  it("treats a missing or negative duration as no time at all", () => {
    const settled = settleTimes([act("a", "10:00", Number.NaN, 0), act("b", "10:00", -30, 0.01), act("c", "10:05", 10, 0.03)], provider);
    // a ends 10:00 -> b at 10:10 (ends 10:10) -> c: 10:10 + 20 = 10:30
    expect(times(settled)).toEqual(["a@10:00", "b@10:10", "c@10:30"]);
  });

  it("does not change the activities it was given", () => {
    const day = [act("a", "10:00", 60, 0), act("b", "11:00", 60, 0.03)];
    const before = JSON.stringify(day);
    settleTimes(day, provider);
    expect(JSON.stringify(day)).toBe(before);
  });

  it("works on an empty day", () => {
    expect(settleTimes([], provider)).toEqual([]);
  });
});

describe("retimeInOrder", () => {
  it("swaps the places and keeps the clock", () => {
    const day = [act("a", "09:00", 60, 0), act("b", "14:00", 60, 0)];
    const result = retimeInOrder(day, ["b", "a"], provider);
    expect(times(result)).toEqual(["b@09:00", "a@14:00"]);
  });

  it("deals the start times out in the new order", () => {
    const day = [act("a", "09:00", 30, 0), act("b", "11:00", 30, 0), act("c", "15:00", 30, 0)];
    expect(times(retimeInOrder(day, ["c", "a", "b"], provider))).toEqual(["c@09:00", "a@11:00", "b@15:00"]);
  });

  it("keeps each stop's own length and details with it", () => {
    const day = [act("short", "09:00", 30, 0), act("long", "12:00", 180, 0)];
    const result = retimeInOrder(day, ["long", "short"], provider);
    expect(result.map((a) => [a.id, a.durationMinutes])).toEqual([["long", 180], ["short", 30]]);
  });

  it("pushes a stop later when the one now before it runs into it", () => {
    const day = [act("short", "09:00", 30, 0), act("mid", "10:00", 30, 0), act("long", "12:00", 180, 0)];
    const result = retimeInOrder(day, ["long", "short", "mid"], provider);
    // slots 09:00, 10:00, 12:00 -> long 09:00-12:00, so short moves from 10:00 to 12:00 and mid follows to 12:30
    expect(times(result)).toEqual(["long@09:00", "short@12:00", "mid@12:30"]);
  });

  it("allows for the journey between the stops", () => {
    const day = [act("a", "09:00", 60, 0), act("b", "10:00", 60, 0.04)];
    // b goes first (09:00-10:00); a is 40 minutes away, so it can't start at its slot of 10:00
    expect(times(retimeInOrder(day, ["b", "a"], provider))).toEqual(["b@09:00", "a@10:40"]);
  });

  it("changes nothing when the order is unchanged and there is room", () => {
    const day = [act("a", "09:00", 60, 0), act("b", "13:00", 60, 0.01), act("c", "19:00", 60, 0.02)];
    const result = retimeInOrder(day, ["a", "b", "c"], provider);
    expect(times(result)).toEqual(["a@09:00", "b@13:00", "c@19:00"]);
  });

  it("leaves a city transfer in place and gives it no slot", () => {
    const transfer = act("transfer", "09:00", 120, 0, "transport");
    const day = [transfer, act("a", "16:30", 60, 0), act("b", "20:00", 60, 0)];
    const result = retimeInOrder(day, ["transfer", "b", "a"], provider);
    expect(times(result)).toEqual(["transfer@09:00", "b@16:30", "a@20:00"]);
    expect(result[0]).toBe(transfer);
  });

  it("ignores an id that is not on the day", () => {
    const day = [act("a", "09:00", 60, 0), act("b", "13:00", 60, 0)];
    expect(times(retimeInOrder(day, ["ghost", "b", "a"], provider))).toEqual(["b@09:00", "a@13:00"]);
  });

  it("counts a repeated id once", () => {
    const day = [act("a", "09:00", 60, 0), act("b", "13:00", 60, 0)];
    const result = retimeInOrder(day, ["b", "b", "a", "a"], provider);
    expect(times(result)).toEqual(["b@09:00", "a@13:00"]);
  });

  it("puts a stop the order leaves out after the others, and never drops it", () => {
    const day = [act("a", "09:00", 60, 0), act("b", "13:00", 60, 0), act("c", "18:00", 60, 0)];
    const result = retimeInOrder(day, ["c"], provider);
    expect(times(result)).toEqual(["c@09:00", "a@13:00", "b@18:00"]);
  });

  it("keeps both of two activities that share an id", () => {
    const day = [act("same", "09:00", 60, 0), act("same", "13:00", 60, 0), act("b", "18:00", 60, 0)];
    expect(retimeInOrder(day, ["b", "same", "same"], provider)).toHaveLength(3);
  });

  it("copes with a time it cannot read", () => {
    const day = [act("a", "09:00", 60, 0), act("b", "oops", 60, 0), act("c", "15:00", 60, 0)];
    const result = retimeInOrder(day, ["c", "a", "b"], provider);
    expect(result.map((a) => a.id).sort()).toEqual(["a", "b", "c"]);
    expect(result.every((a) => /^\d{2}:\d{2}$/.test(a.time))).toBe(true);
    const clock = result.map((a) => a.time);
    expect(clock).toEqual([...clock].sort());
  });

  it("gives a stop with an unreadable time no slot, and settles it after the others", () => {
    const day = [act("a", "09:00", 60, 0), act("b", "oops", 60, 0), act("c", "15:00", 60, 0)];
    expect(times(retimeInOrder(day, ["c", "a", "b"], provider))).toEqual(["c@09:00", "a@15:00", "b@16:00"]);
  });

  it("handles an empty day and an empty order", () => {
    expect(retimeInOrder([], ["a"], provider)).toEqual([]);
    const day = [act("a", "09:00", 60, 0), act("b", "13:00", 60, 0)];
    expect(times(retimeInOrder(day, [], provider))).toEqual(["a@09:00", "b@13:00"]);
  });

  it("does not change the activities it was given", () => {
    const day = [act("a", "09:00", 60, 0), act("b", "14:00", 60, 0)];
    const before = JSON.stringify(day);
    retimeInOrder(day, ["b", "a"], provider);
    expect(JSON.stringify(day)).toBe(before);
  });
});
