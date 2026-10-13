# Week 2 : An AI City Planner that Cannot Break the App

# City Planning with Validation, One Retry and a Fallback

## Issue

The model suggests how many days to spend in each city. A model can return a
valid-looking answer that is impossible, for example four cities with eleven
days for a nine-day trip, or it can return broken JSON, time out or run out
of quota. The traveller must never see a broken generation screen because of
that.

## Design

`planCities` follows one rule: the AI proposes, TripEase validates, and a
deterministic planner catches everything else.

```
attempt -> Zod -> constraint checks -> (one repair retry) -> fallback
```

- **Provider seam.** The planner depends only on the `AIProvider` interface.
  Groq and a mock provider implement it. A new vendor is a new class, and
  `services/planning` does not change.
- **Two layers of checks.** Zod checks the shape of the answer. Then
  `validateCityAllocation` checks that the plan is possible: the days add up
  to the trip length, no city is repeated, every city has at least one day,
  there are at most 8 cities and not more cities than days. The destination
  must also match the one that was asked for.
- **One retry only.** The retry happens for a plan that breaks a rule, or for
  malformed JSON or a wrong schema. It carries a repair note with the
  problems found, so it is a correction and not a new roll of the dice. Auth,
  quota and timeout errors are not retried, because a retry would only cost
  time and money.
- **Fallback.** If there is no model configured, or the retry fails too,
  `planCitiesDeterministically` is used. The saved plan records its source
  (`ai` or `fallback`) and the reason.
- **No false claims.** A mock provider does not reason, so its plans are
  recorded as `fallback`, not `ai`.

## The Fallback Planner

For a curated destination (Thailand) it uses a known split of cities. It
never gives a city fewer than two days, because each extra stop costs about
half a day of travel. Without that rule a 3-day Thailand trip became "one
night in Bangkok, then fly to Phuket". For any other destination it stays in
one place. An earlier version split unknown places into names like
"<Destination> City" and "<Destination> Coast", which looked real but were
invented, so I removed it.

## The Groq Provider and the Plan Route

**Groq provider.** `GroqAIProvider` calls Groq's chat-completions endpoint
with `fetch`. The model is `openai/gpt-oss-120b` unless `GROQ_MODEL` says
otherwise, the temperature is 0.3 and a request is stopped after 20 seconds.

- The request asks for `json_schema` output in strict mode with the planner's
  own schema. Not every model accepts a schema. If the server answers 400 and
  mentions the schema, the provider remembers this, writes a warning and tries
  once more in plain `json_object` mode. The answer is validated in the same
  way in both modes, so only the strength of the constraint is lost.
- For a retry, the repair note is added as an extra message: "Your previous
  answer was rejected" followed by the problems found.
- Every failure gets a code: `timeout`, `provider-error` (unreachable or any
  other status), `auth` (401 and 403), `quota` (429), `malformed-json` (not
  JSON or empty) and `schema` (JSON of the wrong shape). These codes decide
  whether the planner retries.
- The error body from Groq is written to the server log only, cut to 300
  characters. It is never sent to the browser, because it can contain parts of
  the prompt or hints about the key.

**Choosing the provider.** `getAIProvider()` is the only place that decides.
`AI_PROVIDER=groq` with a `GROQ_API_KEY` gives Groq, `mock` gives the mock
provider, and anything else returns nothing, so the deterministic planner is
used. A missing key or an unknown value writes a warning. The key has no
`NEXT_PUBLIC_` prefix, so it stays on the server. `aiProviderStatus()` says
whether AI is live without showing the key.

**The route.** `POST /api/trips/plan` first checks the user's token. Then it
parses the body with `tripDraftInputSchema`, checks that the end date is not
before the start date, counts the days and calls `planCities`. A failure gives
a general message and status 500, and the details go to the log. The route is
separate from `/api/trips/generate` so that the wizard can show the chosen
cities as soon as they are ready, and does not pay for planning twice.

`groq-provider.test.ts` checks the schema request, the switch to JSON mode,
the error codes, prose and wrong-shaped answers, the timeout and the repair
note.

## Result

`planCities` always returns a valid plan. If the fallback ever produced an
invalid one, that is logged as an error instead of being shipped silently.
