// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireUser } from "@/lib/server/firebase-auth";
import { RATE_LIMITS, waitInWords } from "@/lib/server/rate-limit";
import { getAIProvider } from "@/lib/services/ai";
import { POST } from "./route";

vi.mock("@/lib/server/firebase-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/firebase-auth")>();
  return { ...actual, requireUser: vi.fn() };
});
// No model: the rule-based planner splits the trip, which is all these tests need.
vi.mock("@/lib/services/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/ai")>();
  return { ...actual, getAIProvider: vi.fn(() => null) };
});

const mockedUser = vi.mocked(requireUser);

// A new person for every test: the route's rate limiter remembers people for the whole file.
let userCounter = 0;

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  userCounter += 1;
  mockedUser.mockResolvedValue({ uid: `user-${userCounter}`, email: null });
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

describe("planning a trip about one place in the country", () => {
  it("plans around the place, tidied", async () => {
    const body = await (await post({ ...trip, destination: "India", focus: "  Darjeeling  " })).json();
    expect(body.plan.cities).toEqual([expect.objectContaining({ name: "Darjeeling", days: 7 })]);
  });

  it("plans the whole country when the place is empty or the country again", async () => {
    for (const focus of ["", "India", "bharat"]) {
      const body = await (await post({ ...trip, destination: "India", focus })).json();
      expect(body.plan.cities.length, focus).toBeGreaterThan(1);
    }
  });

  it("refuses a place that is not a place name", async () => {
    expect((await post({ ...trip, destination: "India", focus: "<b>Goa</b>" })).status).toBe(400);
  });
});

describe("rate limiting", () => {
  const { limit } = RATE_LIMITS.tripPlan;
  /** Uses up this test's person's allowance with real requests that work. */
  async function useAllowance() {
    for (let i = 0; i < limit; i++) expect((await post()).status).toBe(200);
  }

  it(`plans a trip ${limit} times for one person, then refuses and says when to try again`, async () => {
    await useAllowance();

    const refused = await post();
    const json = await refused.json();
    expect(refused.status).toBe(429);
    expect(json.code).toBe("rate-limited");
    expect(json.retryAfterSeconds).toBeGreaterThan(0);
    expect(refused.headers.get("Retry-After")).toBe(String(json.retryAfterSeconds));
    expect(json.error).toBe(`You've asked for several new trips in a short time. Try again ${waitInWords(json.retryAfterSeconds)}.`);
  });

  it("spends nothing on a request it refuses", async () => {
    await useAllowance();
    // Planning asks for the model before anything else, so no ask means no model call.
    const before = vi.mocked(getAIProvider).mock.calls.length;

    expect((await post()).status).toBe(429);
    expect(vi.mocked(getAIProvider).mock.calls.length).toBe(before);
  });

  it("refuses before reading the request, so even a broken one counts as refused", async () => {
    await useAllowance();
    const broken = await POST(new NextRequest("http://localhost/api/trips/plan", { method: "POST", body: "not json" }));
    expect(broken.status).toBe(429);
  });

  it("limits one person without affecting anyone else", async () => {
    await useAllowance();
    expect((await post()).status).toBe(429);

    mockedUser.mockResolvedValue({ uid: `someone-else-${userCounter}`, email: null });
    expect((await post()).status).toBe(200);
  });
});
