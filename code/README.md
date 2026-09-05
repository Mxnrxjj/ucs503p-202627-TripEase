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
- **Destination recommendations** — real, well-known attractions link to a
  genuine reference (currently Wikipedia); anything without a verifiable
  source is clearly labelled "Demo data" rather than presented as fact.
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
Trip generation needs no API key — see "Mock mode" below.

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

There is currently no AI provider or Maps/Places API key configured, by
design — the whole app works offline aside from Firebase:

- **Itinerary generation** (`src/lib/services/itinerary-generator.ts`) is a
  deterministic mock planner. Thailand (Bangkok + Phuket) is curated with
  real, well-known attractions; any other destination falls back to a
  generic template. The function signature and output shape are exactly what
  a real LLM-backed planner would need to produce, so swapping in a live AI
  provider later touches only that one file.
- **Reference links**: real Wikipedia links are used for landmarks the
  generator is confident actually exist (Grand Palace, Wat Pho, Phi Phi
  Islands, etc). Hotels, restaurants and anything else without a verifiable
  source carry no link and are tagged **"Demo data"** in the UI — the app
  never invents a URL or presents a fabricated price as real.
- **Map view** (`src/components/maps/mock-map.tsx`) draws a CSS-based route
  between cities and stops. It's marked "Demo map" in the UI and is
  structured so a real Google Maps/Places integration can replace its
  internals without changing the roadmap page around it.
- **Budget numbers** are computed from the mock content (see
  `src/lib/services/budget-engine.ts`) — realistic in shape, not live prices.

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
    mock-data/                  curated + generic destination content, mock FX rates
    services/
      auth.ts                    the ONLY place Firebase Auth is touched (unchanged)
      trips.ts                   the ONLY place Firestore trip docs are touched
      trip-mutations.ts          pure add/edit/delete/reorder/hotel-change logic
      itinerary-generator.ts     the mock "AI" — destination + dates + budget → full itinerary
      budget-engine.ts           itinerary → budget breakdown, over-budget savings suggestions
    validation/trip.ts           Zod schemas for trip input and generated itineraries
  types/                        trip.ts, itinerary.ts, budget.ts
firestore.rules                 authorization layer, tested by tests/rules/
```

All Firestore access goes through `src/lib/services/*`; components never
build queries or touch `firebase/auth` directly. A trip is stored as a single
Firestore document (cities, days and activities are denormalized into it) —
at the scale of a handful of cities and a few dozen activities this stays
well under Firestore's document size limit and keeps every edit a single
read-modify-write instead of a fan-out across subcollections.

## Known limitations (V1)

- Cities can't be added or removed from a generated trip yet (hotel, day
  schedule and activities within existing cities are fully editable).
- The map is a stylized mock, not a real Google Maps embed.
- Costs are treated as a flat total for the travelling party rather than
  computed per-traveller (except flights, which scale by traveller count).
- There's no real AI or live pricing/availability data — see "Mock mode" above.
