# Week 4 : Places, Itineraries, API Routes, Saving Trips, the Budget Engine and CI

# Places, Itinerary, Routes, Saving, Budget and CI

## Places provider and cache

**Issue.** Generating a trip needs several searches for every city, and each
one is a billable Google call. The app also has to work when there is no key.

**Fix.**

- `getPlacesProvider()` is the only place where a provider is chosen. With
  `PLACES_PROVIDER=google` and a key it uses Google Places. In every other
  case, including a missing key (a warning is logged), it uses an offline
  mock provider. Everything else depends only on the `PlacesProvider`
  interface.
- A search that fails or comes back empty falls back to the mock provider for
  that search only.
- `TtlCache` is a small in-memory cache: entries live 10 minutes and there are
  at most 500, and the oldest unused one is dropped first. It is per server
  process on purpose. The worst case after a restart is a repeated call.

## Itinerary generator

For each city it runs four searches at the same time with `Promise.all`: 1
hotel, 14 attractions, 12 restaurants and 4 nightlife places. Attractions are
grouped by area so that each day covers one part of the city, and the stops
are ordered nearest first. A stop is added to a day only if the day still
fits in the available minutes, with time kept for dinner. The output is
validated with a Zod schema before it is returned.

## Budget engine

`budget-engine.ts` is made of pure functions, so the screen can call them
after every edit.

- Eight categories: flights, hotels, food, activities, transport, shopping,
  miscellaneous and a buffer. Activities go into the category that matches
  them, hotels are the nightly price times the nights, and a fixed daily
  amount is added for local transport.
- Miscellaneous is 4% of the other costs. The buffer is 5% of the user's
  budget, with a minimum of 3,000.
- When the estimate is above the budget, `buildSavingsSuggestions` gives up
  to three rules-based suggestions: a cheaper hotel in the most expensive
  city (30% off), a shared tour instead of the most expensive non-food
  activity above 1,500 (60% off), and local restaurants instead of hotel
  dining (15% of the food cost). There is no model in this step, so every
  suggestion can be explained.

## API routes

The routes that spend quota (`plan`, `generate`, `rebuild` and places search)
check the user's token first, and none of them sends the error text of an
upstream provider to the browser. The `plan` route is described in Week 2.

- **`/api/trips/generate`.** It validates the trip details, then accepts the
  city plan that the wizard already has. A plan sent by the browser is client
  input, so it is checked again with the same rules. If it is missing or not
  valid, the server plans again, so an old plan cannot block the user. The
  itinerary is checked with `generatedItinerarySchema` before it is returned,
  and a bad result gives a 502.
- **`/api/trips/rebuild`.** It applies an edited city list. The request must
  have the trip details, 1 to 12 cities and the existing cities and days. The
  new allocation passes through `validateCityAllocation`, the check used for
  the AI plan. These are the traveller's own edits, so the exact problems are
  returned with status 400. The generator then receives the existing
  itinerary. A city that is still present, matched by name without regard to
  capital letters, keeps its hotel and its edited activities, and only a new
  city or an extra day causes a places search. A renamed city counts as new.
  `places-request-count.test.ts` checks that an unchanged rebuild makes no
  search. The saved plan is recorded as `fallback` with the reason "Cities
  edited by the traveller."
- **`/api/places/search`.** It backs the "replace with a real place" box. If
  the live provider fails, or returns nothing, the route returns demo places
  and a short notice. The notice comes from `friendlyPlacesMessage`, which
  maps each error code (`missing-key`, `invalid-key`, `quota-exceeded`,
  `network`, `malformed-response`, `provider-error`) to a safe sentence,
  because a raw Google error can contain project ids and key hints. An HTTP
  400, 401 or 403 from the provider is treated as an invalid key and a 429 as
  a quota problem. Every place is checked with `placeSchema` before it leaves
  the server, so a mapping bug in a provider fails here and does not reach a
  saved trip.

## Saving and editing a trip

**`trips.ts`.** It is the only file that touches Firestore for trip data.
Components call its functions and never build queries.

- A converter fills defaults when a field is missing (status "ready",
  currency INR, one traveller, solo) and turns timestamps into dates.
- `saveGeneratedTrip` writes one document with the current user as `ownerId`.
  From the planning step it stores only the structured decision (the cities,
  the source and the reason), never the prompt or the raw model output.
- `subscribeToOwnerTrips` and `subscribeToTrip` give live updates and return a
  function to stop listening. The trip list is filtered by owner and sorted by
  creation time, which needs a composite index. It is defined in
  `firestore.indexes.json`.
- `updateTripItinerary` replaces the cities, days, budget or planning record in
  a single write.

**`trip-mutations.ts`.** These are pure functions, with no Firestore and no
React. Adding, editing, deleting and reordering an activity, changing a hotel
and applying a suggestion each return the new days or cities together with a
budget recalculated by `computeBudgetBreakdown`. The flight cost already in
the budget is kept. The three suggestions are applied with the same
percentages that they were priced with: the hotel gets 70% of its price
(30% off), the chosen activity 40% of its cost (60% off), and every food
item 85% of its cost. The first two are marked as demo data and as
estimates, and their old link, rating, image and source are removed, because
they no longer describe a real place.

## CI and Deployment

The workflow `ci.yml` runs on every push and pull request. It installs Node
22 and Java 21 (the Firestore emulator needs Java), and then runs lint, the
unit tests, the Firestore rules tests and a production build. A second job
scans the repository for secrets.

The Firestore rules and indexes are published with
`npx firebase deploy --only firestore`, and `firebase.json` defines the local
emulators (Auth on port 9099, Firestore on 8085). Merges to `main` are deployed
to a staging environment on Vercel. The Vercel project uses `code/` as its root
directory, and the six `NEXT_PUBLIC_FIREBASE_*` variables are set for
Production and Preview. The Places and AI keys are optional: without them the
mock providers are used and the app still works.
