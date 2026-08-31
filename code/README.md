# TripEase

A web app where a **trip** is one shared record holding its day-wise itinerary,
the route between stops, and a categorised budget — instead of that state living
in five different apps. See `../project-proposal/main.pdf` for the full rationale.

Stack: Next.js 16 (App Router) · Firebase Auth · Cloud Firestore · Tailwind v4.
There is no hand-written backend; Firestore security rules are the authorization
layer and are unit-tested in CI.

## Prerequisites

- Node.js 22+
- Java 17+ (only for the Firestore rules emulator / `npm run test:rules`)
- A Firebase project (see below)

## Setup

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

## Scripts

| Command             | What it does                                              |
| ------------------- | -------------------------------------------------------- |
| `npm run dev`       | Dev server                                               |
| `npm run build`     | Production build                                         |
| `npm run lint`      | ESLint                                                   |
| `npm test`          | Unit tests (`src/**/*.test.ts`), via Vitest              |
| `npm run test:rules`| Firestore rules tests against the emulator               |
| `npm run emulators` | Start the Auth + Firestore emulators locally             |

To develop fully offline against the emulators, set
`NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true` in `.env.local` and run `npm run
emulators` in a second terminal.

## Deployment

Merges to `master` deploy to a staging environment on **Vercel**.

- Vercel project **Root Directory** is set to `code/`.
- The six `NEXT_PUBLIC_FIREBASE_*` variables are configured in the Vercel
  project settings (Production + Preview), pointing at the `tripease-staging`
  Firebase project.

## Project layout

```
src/
  app/
    (auth)/            sign-in, sign-up            — redirects to /dashboard if signed in
    (app)/             dashboard, trips/[tripId]   — gated by <RequireAuth>
  components/          auth provider, route guard, shared UI
  lib/
    firebase.ts        SDK initialisation (+ emulator switch)
    collections.ts     Firestore collection paths, fixed expense categories
    date.ts            trip-length / date-input helpers
    services/          the ONLY place Firestore and Auth are touched
  types/trip.ts        Trip, ItineraryItem, Expense
firestore.rules        authorization layer, tested by tests/rules/
```

All data access goes through `src/lib/services/*`. Components never build
Firestore queries directly — that keeps the vendor-lock-in surface small and
enumerable.
