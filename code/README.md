# TripEase

AI-powered, personalized trip planning. Tell TripEase where you're going, when,
and what your budget is — it generates a complete, editable day-by-day
itinerary with hotels, food, activities and a live budget breakdown.

```
Tell TripEase where you want to go → it plans it → you explore it → edit it → save it.
```

## Features

- **AI itinerary generation** — a destination, dates, budget and a handful of
  travel-style preferences turn into a full multi-city, day-by-day plan.
- **Budget-aware planning** — every hotel, meal and activity rolls up into a
  categorized budget (flights, hotels, food, activities, transport, shopping,
  misc, buffer) that recalculates on every edit, with deterministic "ways to
  save" suggestions when a trip goes over budget.
- **Interactive roadmap** — a visual, per-city timeline of days rather than a
  wall of text; expand any day to see its full schedule.
- **Editable itinerary** — add, edit, delete and drag-to-reorder activities;
  change a city's hotel; all changes save immediately.
- **Destination recommendations** — hotels, attractions, restaurants and
  nightlife come from a swappable places provider (an offline curated/mock
  dataset by default, or live Google Places when configured — see "Places
  data provider" below). Real places link to a genuine reference; anything
  without a verifiable source is clearly labelled "Demo data" rather than
  presented as fact.
- **Map view** — a visual (currently mocked) route between cities and stops,
  architected so a real Maps/Places provider can be swapped in later.
- **Firebase Authentication** — email/password and Google sign-in.
- **Firestore persistence** — trips are private to their owner and enforced
  by security rules that are unit-tested in CI.

## Tech stack

- **Next.js 16** (App Router, Turbopack) · **React 19** · **TypeScript**
- **Tailwind CSS v4** for styling, **Radix UI** primitives (Dialog, Tabs,
  Progress) for accessible interactive components
- **Framer Motion** for animation, **@dnd-kit** for drag-and-drop reordering,
  **Recharts** for the budget chart
- **Zod** for validating trip input and generated itineraries
- **Firebase Auth** + **Cloud Firestore** — no separate backend; Next.js API
  routes handle itinerary generation, Firestore security rules are the
  authorization layer

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the Firebase web config
npm run dev                  # http://localhost:3000
```

### Firebase project

1. In the [Firebase console](https://console.firebase.google.com/), create a
   project (e.g. `tripease-dev`).
2. **Build → Authentication → Get started**, then enable the **Email/Password**
   and **Google** sign-in providers.
3. **Build → Firestore Database → Create database**, start in production mode,
   pick a region close to you.
4. **Project settings → General → Your apps → Web app**. Register an app and copy
   the config values into `.env.local`.
5. Push the security rules and indexes:
   ```bash
   npx firebase deploy --only firestore
   ```

`.firebaserc` also defines a `staging` alias — create a second Firebase project
`tripease-staging` for it so pilot data never mixes with development data.

### Environment variables

See `.env.example`. Only the six `NEXT_PUBLIC_FIREBASE_*` values are required.
Trip generation needs no API key by default — see "Places data provider" below.

## Places data provider

`src/lib/services/places/` is a small provider abstraction with one
interface (`PlacesProvider.searchPlaces`) and two implementations:

- **`mock-provider.ts`** (default, no setup required) — offline, curated
  content for Thailand (Bangkok + Phuket) plus a generic fallback for any
  other destination. This is what the app runs on out of the box.
- **`google-provider.ts`** — live results from the Places API (New)
  `searchText` endpoint.

`getPlacesProvider()` (`src/lib/services/places/index.ts`) picks between
them based on environment variables and always falls back to mock data if
anything is missing or fails, so **the app never requires an API key to
work**.

### Using live Google Places data (optional)

1. In the [Google Cloud console](https://console.cloud.google.com/), enable
   the **Places API (New)** on a project and create an API key. Restrict the
   key to the Places API and, ideally, to your server's IP/referrer.
2. Add to `.env.local` (**not** `.env.example` — never commit a real key):
   ```
   PLACES_PROVIDER=google
   GOOGLE_PLACES_API_KEY=your-key-here
   ```
3. Restart the dev server. Newly generated trips will now pull real hotels,
   attractions, restaurants and nightlife for the destination.

**This key is server-only.** It's read from `process.env` (no
`NEXT_PUBLIC_` prefix) only inside `getPlacesProvider()`, which is only
ever called from server code — the `/api/trips/generate` route and the
`/api/places/photo` image proxy. It is never sent to, or readable from, the
browser. Photos are streamed through `/api/places/photo` for the same
reason: a raw Google photo URL needs the key attached as a query
parameter, so the app fetches it server-side and relays the image bytes
instead of ever putting that URL in front of a client.

If a live search comes back empty for a city (quota, network issue, sparse
data), the generator transparently fills that one gap from the mock
provider rather than failing the whole trip — every place still carries its
own source, so a hybrid itinerary is never misrepresented as fully verified.

## Scripts

| Command              | What it does                                              |
| --------------------- | --------------------------------------------------------- |
| `npm run dev`         | Dev server                                                |
| `npm run build`       | Production build                                          |
| `npm run lint`        | ESLint                                                    |
| `npm test`            | Unit tests (`src/**/*.test.ts`), via Vitest               |
| `npm run test:rules`  | Firestore rules tests against the emulator                |
| `npm run emulators`   | Start the Auth + Firestore emulators locally              |

To develop fully offline against the emulators, set
`NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true` in `.env.local` and run `npm run
emulators` in a second terminal.

## Deployment

Merges to `master` deploy to a staging environment on **Vercel**.

- Vercel project **Root Directory** is set to `code/`.
- The six `NEXT_PUBLIC_FIREBASE_*` variables are configured in the Vercel
  project settings (Production + Preview), pointing at the `tripease-staging`
  Firebase project.

## Mock mode: what's real, what's demo

By default there's no AI provider or Places API key configured — the whole
app works offline aside from Firebase:

- **Itinerary generation** (`src/lib/services/itinerary-generator.ts`) is
  deterministic: it decides which cities to visit and how many days each
  gets, then asks the active **places provider** (see above) for that
  city's hotel, attractions, restaurants and nightlife. With the mock
  provider, Thailand (Bangkok + Phuket) is curated with real, well-known
  attractions; any other destination falls back to a generic template. The
  generator's function signature and output shape are exactly what a real
  LLM-backed planner would need to produce, so swapping in a live AI
  provider later touches only that one file.
- **Every place carries its own provenance** (`Activity.source` /
  `Hotel.source`, see `src/types/place.ts`): `isDemoData` says whether the
  place itself is real, `priceIsEstimate` says whether its cost is a
  verified number or an inferred guess (true for essentially everything
  today — Google Places only ever returns a coarse price *level*, never an
  exact amount). Real, well-known landmarks link to a genuine reference
  (Wikipedia in mock mode, a Google Maps/website link in Google mode);
  anything without a verifiable source carries no link and is tagged
  **"Demo data"** in the UI. Nothing is ever presented as a verified fact
  it isn't.
- **Map view** (`src/components/maps/mock-map.tsx`) draws a CSS-based route
  between cities and stops. It's marked "Demo map" in the UI and is
  structured so a real Google Maps/Directions integration can replace its
  internals without changing the roadmap page around it.
- **Budget numbers** are computed from whatever the places provider
  returned (see `src/lib/services/budget-engine.ts`) — realistic in shape,
  not live/bookable prices, even when the underlying places are real.

## Project layout

```
src/
  app/
    (auth)/                    sign-in, sign-up — redirect to /dashboard if signed in
    (app)/                     gated by <RequireAuth>
      dashboard/                trip list + "create new trip"
      trips/new/                the multi-step create-trip wizard
      trips/[tripId]/           the roadmap / budget / map trip view
    api/trips/generate/         itinerary generation endpoint
    api/places/photo/           server-side proxy for Google Places photos (keeps the API key off the client)
    page.tsx                    landing page
  components/
    landing/                   hero, how-it-works, itinerary + budget previews, features, CTA
    dashboard/                 trip card
    trips/wizard/               wizard shell, steps, generation loader
    roadmap/                   city section, day view, activity editor/row, hotel editor
    budget/                    budget panel + chart
    maps/                      mock map
    ui/                        shared primitives (button, input, dialog, tabs, progress, chip…)
    auth-provider.tsx, require-auth.tsx, site-header.tsx, auth-form.tsx  (unchanged from iteration 1)
  lib/
    firebase.ts                 SDK initialisation (+ emulator switch)
    collections.ts               Firestore collection paths
    date.ts, utils.ts            date + formatting helpers
    draft-storage.ts             carries a trip idea from the landing page through sign-up
    mock-data/                  curated destination content + city list, mock FX rates
    services/
      auth.ts                    the ONLY place Firebase Auth is touched (unchanged)
      trips.ts                   the ONLY place Firestore trip docs are touched
      trip-mutations.ts          pure add/edit/delete/reorder/hotel-change logic
      itinerary-generator.ts     destination + dates + budget → full itinerary, via the places provider
      budget-engine.ts           itinerary → budget breakdown, over-budget savings suggestions
      places/
        provider.ts               the PlacesProvider interface every provider implements
        mock-provider.ts          offline provider backed by lib/mock-data
        google-provider.ts        live provider backed by the Places API (New)
        index.ts                  getPlacesProvider() — picks a provider from env vars
    validation/
      trip.ts                     Zod schemas for trip input and generated itineraries
      places.ts                   Zod schemas for the Place model + raw Google API responses
  types/                        trip.ts, itinerary.ts, budget.ts, place.ts
firestore.rules                 authorization layer, tested by tests/rules/
```

All Firestore access goes through `src/lib/services/*`; components never
build queries or touch `firebase/auth` directly. A trip is stored as a single
Firestore document (cities, days and activities are denormalized into it) —
at the scale of a handful of cities and a few dozen activities this stays
well under Firestore's document size limit and keeps every edit a single
read-modify-write instead of a fan-out across subcollections.

## Known limitations

- Cities can't be added or removed from a generated trip yet (hotel, day
  schedule and activities within existing cities are fully editable).
- Which cities a trip visits (and how many days each gets) is still a
  small static/curated decision in `itinerary-generator.ts`, not something
  the places provider decides — only the recommendations *within* a city
  (hotel/attractions/restaurants/nightlife) are provider-driven.
- The map is a stylized mock, not a real Google Maps embed.
- Costs are treated as a flat total for the travelling party rather than
  computed per-traveller (except flights, which scale by traveller count).
- There's no real AI itinerary generation (an LLM deciding the plan) — see
  "Mock mode" above.
- `google-provider.ts` is implemented against the documented Places API
  (New) `searchText` shape but has not been exercised against a live API
  key in this environment; the mock provider is what every automated test
  and manual QA pass in this repo actually runs against.
