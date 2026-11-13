// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireUser } from "@/lib/server/firebase-auth";
import { POST } from "./route";

vi.mock("@/lib/server/firebase-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/firebase-auth")>();
  return { ...actual, requireUser: vi.fn() };
});
// No model: the rule-based planner splits the trip, which is all these tests need.
vi.mock("@/lib/services/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/ai")>();
  return { ...actual, getAIProvider: () => null };
});

const mockedUser = vi.mocked(requireUser);

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mockedUser.mockResolvedValue({ uid: "u1", email: null });
});

const trip = {
  destination: "Thailand",
  startDate: "2027-03-01",
  endDate: "2027-03-07",
  budget: 150_000,
  currency: "INR",
  travelers: 2,
  travelerType: "couple",
  preferences: ["culture"],
};

const post = (body: unknown = trip) =>
  POST(new NextRequest("http://localhost/api/trips/plan", { method: "POST", body: JSON.stringify(body) }));

describe("planning the cities of a trip", () => {
  it("plans a trip with a travel style", async () => {
    const response = await post();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.plan.cities.length).toBeGreaterThan(0);
  });

  it("plans a trip when the traveller picked no travel style", async () => {
    const response = await post({ ...trip, preferences: [] });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.plan.cities.length).toBeGreaterThan(0);
  });

  it("still refuses a style it does not know", async () => {
    const response = await post({ ...trip, preferences: ["not-a-style"] });
    expect(response.status).toBe(400);
  });

  it("refuses a trip longer than 30 days, and one that runs for years", async () => {
    expect((await post({ ...trip, startDate: "2027-03-01", endDate: "2027-03-30" })).status).toBe(200);
    expect((await post({ ...trip, startDate: "2027-03-01", endDate: "2027-03-31" })).status).toBe(400);
    expect((await post({ ...trip, endDate: "9999-12-31" })).status).toBe(400);
  });

  it("still tells a backwards range apart from a bad one", async () => {
    const response = await post({ ...trip, startDate: "2027-03-10", endDate: "2027-03-01" });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("End date must be on or after the start date.");
  });

  it("refuses a budget below the minimum", async () => {
    const response = await post({ ...trip, budget: 1 });
    expect(response.status).toBe(400);
  });

  it("still refuses a request with no preferences field at all", async () => {
    const { preferences: _omitted, ...withoutPreferences } = trip;
    void _omitted;
    const response = await post(withoutPreferences);
    expect(response.status).toBe(400);
  });
});
