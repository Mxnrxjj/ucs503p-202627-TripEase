# TripEase

TripEase is a web application for planning a trip in one place. Normally a group's plan is spread across a chat, a notes app, a maps app and a spreadsheet, and nobody knows which copy is the latest. In TripEase a trip is a single record that holds the itinerary, the places on a map and the budget together, and all of them update when the traveller edits the plan.

This is the project for UCS503P (Software Engineering), 2026-27 odd semester, at Thapar Institute of Engineering and Technology, Patiala.

## Team

| Name | Roll No. |
|---|---|
| Manraj Singh | 1024030712 |
| Vatsal Chauhan | 1024030714 |
| Nimitt Malhotra | 1024030709 |

## Project status

The project is at the mid-semester stage. The working prototype covers the following.

**Done**

- Sign-up and sign-in with email and password, or with a Google account.
- A new-trip wizard (destination, dates, budget, travellers, preferences) and a dashboard that lists and deletes a user's trips (a trip is renamed from its own page).
- City planning with an AI provider (Groq). The answer is validated by our own checks, and a deterministic planner takes over if the AI is unavailable or its answer is not usable.
- Day-by-day itinerary generation with hotels, meals and activities, using Google Places data or built-in demo data.
- An editable roadmap: add, edit, remove, replace and reorder activities, change a city's hotel, and add, remove or rename cities.
- A map of the itinerary (Leaflet with OpenStreetMap tiles) with markers, a line joining each day's stops in order, and filters by city and day.
- Feasibility checks that estimate travel time between stops and warn about days that are too full.
- A budget broken down by category that updates after every edit, with suggestions for saving money when the trip goes over budget.
- Firestore security rules so that a trip can be read and changed only by its owner, with automated tests for the rules.
- Continuous integration that runs lint, unit tests, the rules tests and a production build on every push.
- Automatic deployment on Vercel whenever changes are merged into `main`.

**Planned for the final submission**

- Expense logging and a planned-versus-actual view.
- A read-only link for sharing a trip.
- A pilot study to measure the time taken to complete an itinerary, the success metric defined in the proposal.

## How a trip is planned

```
trip details -> city planner (AI, then validation, or fallback) -> places provider
             -> itinerary -> feasibility checks -> budget engine -> roadmap and map
```

The AI is only used to suggest how many days to spend in each city. Everything else, such as place details, travel times and the budget, is produced and checked by TripEase's own code. When no keys are configured, the app uses built-in demo providers and still works end to end.

## Technology

- Next.js (App Router), React and TypeScript
- Tailwind CSS, Radix UI, Framer Motion, dnd-kit and Recharts
- Firebase Authentication and Cloud Firestore, with no separate backend server
- Next.js API routes for server-side work, so that API keys stay on the server
- Leaflet and OpenStreetMap for the map
- Zod for validating input and generated data
- Vitest for tests and GitHub Actions for continuous integration

## Repository layout

| Folder | Contents |
|---|---|
| `code/` | The TripEase application |
| `docs/` | Project documentation, including the data flow and architecture diagrams (`docs/diagrams.md`) |
| `journals/` | Weekly journals of each team member |
| `project-proposal/` | The project proposal (LaTeX source and PDF) |
| `project-report-final/` | Reserved for the final report |

## Running the application locally

You need Node.js 22 or newer. Java is needed only for the Firestore rules tests (the CI uses Java 21).

```bash
cd code
npm install
cp .env.example .env.local     # then fill in the Firebase web configuration
npm run dev                    # http://localhost:3000
```

Only the six `NEXT_PUBLIC_FIREBASE_*` values in `.env.local` are required. Places data and AI planning use built-in demo providers unless you set `PLACES_PROVIDER=google` with a Google Places key, or `AI_PROVIDER=groq` with a Groq key. These keys are read only on the server and must never be given a `NEXT_PUBLIC_` prefix. The full setup, including creating the Firebase project, is described in [`code/README.md`](code/README.md).

## Tests

Run these from the `code/` folder.

```bash
npm run lint          # lint
npm test              # unit tests
npm run test:rules    # Firestore security rules tests (needs Java)
npm run build         # production build
```

The same four steps run automatically on every push through GitHub Actions.

## Documentation

The documentation is built with MkDocs and published automatically when changes are merged into `main`. To preview it locally, install the MkDocs packages listed in `.github/workflows/mkdocs.yml` and run `mkdocs serve` from the repository root.

## Workflow

Each iteration is developed on its own branch, for example `iteration4-ai-city-planner`, and merged into `main` once it works. Documentation changes are made through pull requests.
