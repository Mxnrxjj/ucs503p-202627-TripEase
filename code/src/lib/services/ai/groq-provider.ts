import { llmCityPlanSchema, type LlmCityPlan } from "@/lib/validation/planning";
import type { CityPlanRequest } from "@/types/planning";
import {
  AIProviderError,
  buildCityPlannerUserPrompt,
  CITY_PLAN_JSON_SCHEMA,
  CITY_PLANNER_SYSTEM_PROMPT,
  type AIProvider,
} from "./provider";

/**
 * Groq-hosted models via their OpenAI-compatible chat-completions endpoint.
 *
 * `GROQ_API_KEY` is server-only (no `NEXT_PUBLIC_` prefix). This class is
 * constructed solely by `getAIProvider()`, which only runs in route handlers,
 * so the key never reaches the browser.
 *
 * Output is constrained with `response_format: json_schema` where the model
 * supports it, which makes the model emit the planner's exact structure
 * rather than prose. Not every Groq model accepts a schema, so a rejection of
 * that specific parameter falls back to plain JSON mode for the retry — the
 * result is validated identically either way, so the fallback loses
 * constraint strength but never correctness.
 */

const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_MODEL = "openai/gpt-oss-120b";
const TIMEOUT_MS = 20_000;

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export class GroqAIProvider implements AIProvider {
  readonly name = "groq" as const;
  readonly simulated = false;
  readonly model: string;

  private readonly baseUrl: string;
  /** Flipped once the model tells us it won't accept a JSON schema. */
  private schemaModeSupported = true;

  constructor(
    private readonly apiKey: string,
    model?: string,
    baseUrl?: string,
  ) {
    this.model = model ?? DEFAULT_MODEL;
    this.baseUrl = (baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  }

  async planCities(request: CityPlanRequest, repairNote?: string): Promise<LlmCityPlan> {
    const messages: ChatMessage[] = [
      { role: "system", content: CITY_PLANNER_SYSTEM_PROMPT },
      { role: "user", content: buildCityPlannerUserPrompt(request) },
    ];
    if (repairNote) {
      messages.push({
        role: "user",
        content: `Your previous answer was rejected:\n${repairNote}\nReturn corrected JSON in the same format.`,
      });
    }

    let raw = await this.complete(messages, this.schemaModeSupported);

    // Some models accept the request but reject the schema parameter; retry
    // once in plain JSON mode rather than failing the whole plan over it.
    if (raw === "unsupported-schema") {
      this.schemaModeSupported = false;
      console.warn("[ai] Groq model rejected json_schema; falling back to json_object mode.");
      raw = await this.complete(messages, false);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new AIProviderError("malformed-json", "The model returned text that isn't JSON.");
    }

    const result = llmCityPlanSchema.safeParse(parsed);
    if (!result.success) {
      throw new AIProviderError("schema", "The model's JSON didn't match the expected shape.");
    }
    return result.data;
  }

  /** Returns the message content, or the sentinel "unsupported-schema". */
  private async complete(messages: ChatMessage[], useSchema: boolean): Promise<string> {
    const responseFormat = useSchema
      ? {
          type: "json_schema",
          json_schema: { name: "city_plan", strict: true, schema: CITY_PLAN_JSON_SCHEMA },
        }
      : { type: "json_object" };

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: 0.3,
          response_format: responseFormat,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      throw new AIProviderError(
        timedOut ? "timeout" : "provider-error",
        timedOut ? "The planner timed out." : "Could not reach the planning model.",
      );
    }

    if (!response.ok) {
      // Logged server-side only: the body can echo prompt content and key hints.
      const detail = await response.text().catch(() => "");
      console.error(`[ai] Groq responded ${response.status}: ${detail.slice(0, 300)}`);

      if (useSchema && response.status === 400 && /json_schema|response_format|schema/i.test(detail)) {
        return "unsupported-schema";
      }
      if (response.status === 401 || response.status === 403) {
        throw new AIProviderError("auth", "The planning model rejected our credentials.");
      }
      if (response.status === 429) {
        throw new AIProviderError("quota", "The planning model is rate limited.");
      }
      throw new AIProviderError("provider-error", "The planning model failed.");
    }

    let content: unknown;
    try {
      const body = await response.json();
      content = body?.choices?.[0]?.message?.content;
    } catch {
      throw new AIProviderError("malformed-json", "The model returned an unreadable response.");
    }

    if (typeof content !== "string" || content.trim().length === 0) {
      throw new AIProviderError("malformed-json", "The model returned an empty answer.");
    }
    return content;
  }
}
