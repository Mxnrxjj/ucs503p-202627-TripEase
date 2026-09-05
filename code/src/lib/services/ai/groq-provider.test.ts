// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { GroqAIProvider } from "@/lib/services/ai/groq-provider";
import { AIProviderError } from "@/lib/services/ai/provider";
import type { CityPlanRequest } from "@/types/planning";

const request: CityPlanRequest = {
  destination: "Italy",
  startDate: "2027-06-12",
  endDate: "2027-06-20",
  dayCount: 9,
  travelers: 2,
  budget: 150_000,
  currency: "INR",
  preferences: ["culture", "food", "beaches"],
};

function completion(content: unknown) {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }] }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GroqAIProvider", () => {
  it("asks for schema-constrained JSON and parses a valid plan", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      completion({
        destination: "Italy",
        cities: [
          { name: "Rome", days: 4, reason: "History and food" },
          { name: "Florence", days: 3, reason: "Art" },
          { name: "Naples", days: 2, reason: "Coast" },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GroqAIProvider("test-key", "openai/gpt-oss-120b");
    const plan = await provider.planCities(request);

    expect(plan.cities.map((c) => `${c.name}:${c.days}`)).toEqual(["Rome:4", "Florence:3", "Naples:2"]);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe("openai/gpt-oss-120b");
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.strict).toBe(true);
    // The key must travel in the header, never in the URL or body.
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer test-key");
    expect(fetchMock.mock.calls[0][0]).not.toContain("test-key");
  });

  it("falls back to plain JSON mode when the model rejects a schema", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "response_format json_schema not supported" } }), {
          status: 400,
        }),
      )
      .mockResolvedValueOnce(completion({ destination: "Italy", cities: [{ name: "Rome", days: 9, reason: "All of it" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GroqAIProvider("test-key");
    const plan = await provider.planCities(request);

    expect(plan.cities).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).response_format.type).toBe("json_object");
  });

  it("classifies auth, quota and server failures", async () => {
    for (const [status, code] of [
      [401, "auth"],
      [429, "quota"],
      [500, "provider-error"],
    ] as const) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status })));
      const provider = new GroqAIProvider("test-key");
      await expect(provider.planCities(request)).rejects.toMatchObject({ code });
    }
  });

  it("rejects free-form prose instead of accepting it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completion("Spend 4 days in Rome, then head to Florence.")));
    const provider = new GroqAIProvider("test-key");
    await expect(provider.planCities(request)).rejects.toBeInstanceOf(AIProviderError);
    await expect(provider.planCities(request)).rejects.toMatchObject({ code: "malformed-json" });
  });

  it("rejects JSON that doesn't match the planner schema", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completion({ itinerary: "Day 1: Colosseum" })));
    const provider = new GroqAIProvider("test-key");
    await expect(provider.planCities(request)).rejects.toMatchObject({ code: "schema" });
  });

  it("surfaces a timeout as a timeout", async () => {
    const abort = new Error("The operation was aborted");
    abort.name = "TimeoutError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abort));
    const provider = new GroqAIProvider("test-key");
    await expect(provider.planCities(request)).rejects.toMatchObject({ code: "timeout" });
  });

  it("passes the repair note back on a retry", async () => {
    const fetchMock = vi.fn().mockResolvedValue(completion({ destination: "Italy", cities: [{ name: "Rome", days: 9, reason: "x" }] }));
    vi.stubGlobal("fetch", fetchMock);

    await new GroqAIProvider("test-key").planCities(request, "City days add up to 11, but the trip is 9 days.");

    const messages = JSON.parse(fetchMock.mock.calls[0][1].body).messages;
    expect(messages.at(-1).content).toContain("add up to 11");
  });
});
