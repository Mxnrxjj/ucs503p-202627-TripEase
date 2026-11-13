import { describe, expect, it } from "vitest";
import { newTripInputSchema, tripDraftInputSchema } from "@/lib/validation/trip";

const draft = {
  destination: "Thailand",
  startDate: "2027-03-08",
  endDate: "2027-03-14",
  budget: 150000,
  currency: "INR",
  travelers: 2,
  travelerType: "couple",
  preferences: ["culture"],
};

describe("travel style on a trip draft", () => {
  it("is optional: a trip with no style is accepted", () => {
    expect(tripDraftInputSchema.safeParse({ ...draft, preferences: [] }).success).toBe(true);
    expect(newTripInputSchema.safeParse({ ...draft, preferences: [] }).success).toBe(true);
  });

  it("still has to be a list of known styles", () => {
    expect(tripDraftInputSchema.safeParse({ ...draft, preferences: ["not-a-style"] }).success).toBe(false);
    expect(tripDraftInputSchema.safeParse({ ...draft, preferences: undefined }).success).toBe(false);
  });

  it("is capped at 8 styles", () => {
    const nine = Array.from({ length: 9 }, () => "culture");
    expect(tripDraftInputSchema.safeParse({ ...draft, preferences: nine }).success).toBe(false);
  });
});

describe("budget on a trip draft", () => {
  it("needs at least the rupee minimum for a new trip, in its own currency", () => {
    expect(newTripInputSchema.safeParse({ ...draft, budget: 4999 }).success).toBe(false);
    expect(newTripInputSchema.safeParse({ ...draft, budget: 5000 }).success).toBe(true);
    expect(newTripInputSchema.safeParse({ ...draft, currency: "USD", budget: 60 }).success).toBe(false);
    expect(newTripInputSchema.safeParse({ ...draft, currency: "USD", budget: 61 }).success).toBe(true);
  });

  it("says what is wrong with the budget, on the budget", () => {
    const parsed = newTripInputSchema.safeParse({ ...draft, budget: 1 });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]).toMatchObject({ path: ["budget"], message: "The budget must be at least ₹5,000." });
  });

  it("still lets an older saved trip with a small budget be rebuilt", () => {
    expect(tripDraftInputSchema.safeParse({ ...draft, budget: 1000 }).success).toBe(true);
  });

  it("caps every trip at the same maximum the wizard shows", () => {
    expect(tripDraftInputSchema.safeParse({ ...draft, budget: 100_000_000 }).success).toBe(true);
    expect(tripDraftInputSchema.safeParse({ ...draft, budget: 100_000_001 }).success).toBe(false);
  });
});

describe("trip length and real dates on a new trip", () => {
  it("allows 30 days and refuses 31, on the end date", () => {
    expect(newTripInputSchema.safeParse({ ...draft, startDate: "2027-03-01", endDate: "2027-03-30" }).success).toBe(true);
    const parsed = newTripInputSchema.safeParse({ ...draft, startDate: "2027-03-01", endDate: "2027-03-31" });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]).toMatchObject({
      path: ["endDate"],
      message: "A trip can be at most 30 days long. This one is 31.",
    });
  });

  it("refuses a trip that runs for years", () => {
    expect(newTripInputSchema.safeParse({ ...draft, endDate: "9999-12-31" }).success).toBe(false);
  });

  it("refuses a day that is not on the calendar", () => {
    expect(newTripInputSchema.safeParse({ ...draft, startDate: "2027-02-30", endDate: "2027-03-02" }).success).toBe(false);
    expect(newTripInputSchema.safeParse({ ...draft, startDate: "2027-03-01", endDate: "2027-13-02" }).success).toBe(false);
  });

  it("leaves a range the wrong way round to the route, which has its own message", () => {
    const parsed = newTripInputSchema.safeParse({ ...draft, startDate: "2027-03-10", endDate: "2027-03-01" });
    expect(parsed.success).toBe(true);
  });

  it("still lets an older saved trip that was longer than that be rebuilt", () => {
    expect(tripDraftInputSchema.safeParse({ ...draft, startDate: "2027-03-01", endDate: "2027-06-30" }).success).toBe(true);
  });

  it("never throws on garbage, however odd", () => {
    for (const input of [null, undefined, [], "x", 5, {}, { ...draft, budget: null }, { ...draft, startDate: 5 }, { ...draft, endDate: null }]) {
      expect(() => newTripInputSchema.safeParse(input)).not.toThrow();
      expect(newTripInputSchema.safeParse(input).success).toBe(false);
    }
  });
});
