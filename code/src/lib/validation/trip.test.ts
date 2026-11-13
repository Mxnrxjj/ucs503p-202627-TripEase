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
