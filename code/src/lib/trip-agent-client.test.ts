import { beforeAll, describe, expect, it } from "vitest";
import { toAgentTrip } from "@/lib/trip-agent-client";
import { agentTripSchema } from "@/lib/validation/trip-agent";
import { buildThailandTrip } from "@/test-support/trip-fixture";
import type { Trip } from "@/types/trip";

let trip: Trip;

beforeAll(async () => {
  const built = await buildThailandTrip();
  const epoch = new Date(0);
  trip = { ...built, ownerId: "u1", status: "ready", createdAt: epoch, updatedAt: epoch };
});

describe("toAgentTrip", () => {
  it("sends the saved flight quote along, so the server can re-price it", () => {
    expect(toAgentTrip(trip).flights).toEqual(trip.flights);
  });

  it("sends null when flights were left out", () => {
    expect(toAgentTrip({ ...trip, flights: null }).flights).toBeNull();
  });

  it("sends nothing for a trip saved before quotes existed", () => {
    const { flights: _quote, ...legacy } = trip;
    void _quote;
    expect("flights" in toAgentTrip(legacy as Trip)).toBe(false);
  });

  it("produces a trip the agent endpoint accepts, quote included", () => {
    expect(agentTripSchema.safeParse(toAgentTrip(trip)).success).toBe(true);
    expect(agentTripSchema.safeParse(toAgentTrip({ ...trip, flights: null })).success).toBe(true);
  });

  it("sends the place the traveller asked for, if the trip has one", () => {
    expect(toAgentTrip({ ...trip, focus: "Chiang Mai" }).focus).toBe("Chiang Mai");
  });

  it.each([["null", null], ["empty", ""], ["missing", undefined]])("sends no place when the trip's is %s", (_label, focus) => {
    expect("focus" in toAgentTrip({ ...trip, focus })).toBe(false);
  });

  it("produces a trip the agent endpoint accepts, with or without a place", () => {
    expect(agentTripSchema.safeParse(toAgentTrip({ ...trip, focus: "Chiang Mai" })).success).toBe(true);
    expect(agentTripSchema.safeParse(toAgentTrip({ ...trip, focus: null })).success).toBe(true);
    expect(agentTripSchema.safeParse(toAgentTrip(trip)).success).toBe(true);
  });

  it("keeps the place when the endpoint parses the trip, rather than stripping it as unknown", () => {
    const parsed = agentTripSchema.parse(toAgentTrip({ ...trip, focus: "Chiang Mai" }));
    expect(parsed.focus).toBe("Chiang Mai");
  });

  it("bounds the place, and wants text", () => {
    expect(agentTripSchema.safeParse({ ...toAgentTrip(trip), focus: "a".repeat(120) }).success).toBe(true);
    expect(agentTripSchema.safeParse({ ...toAgentTrip(trip), focus: "a".repeat(121) }).success).toBe(false);
    expect(agentTripSchema.safeParse({ ...toAgentTrip(trip), focus: 5 }).success).toBe(false);
  });

  it("rejects a malformed quote", () => {
    const bad = { ...toAgentTrip(trip), flights: { ...trip.flights!, quotedOn: "yesterday" } };
    expect(agentTripSchema.safeParse(bad).success).toBe(false);
  });
});
