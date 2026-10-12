# Requirements

This page has the requirements for TripEase as of the mid-semester evaluation. We follow the classification from the course: functional requirements, non-functional requirements (product, organisational and external) and domain requirements. Every requirement has an ID so we can refer to it in the report. "Shall" marks a mandatory requirement. "Done" means it works in the current build and "Planned" means we are doing it before the final submission.

## 1. Scope

TripEase is meant to replace the usual mix of WhatsApp chats, notes, Google Maps and a spreadsheet that people use to plan a trip. The itinerary, the map and the budget are all part of one trip, so when you change one the others update too.

What it does not do: it does not book anything and it does not show live prices. All costs in the app are estimates.

One thing changed from the proposal. In the proposal we kept AI-generated itineraries out of scope. In iteration 4 we ended up using an AI model for one small part, which is deciding how many days to spend in each city. It does not pick places or prices. We check its answer with our own rules, and if the AI is down or gives a bad answer we use a normal (non-AI) planner instead. So the app still works without it.

## 2. Who and what uses the system

| Actor | Role |
|---|---|
| Traveller | The user. Makes trips, edits them, looks at the map and budget. Has to be signed in for everything except the landing page. |
| Firebase Authentication | Sign-up and sign-in (email/password or Google). |
| Cloud Firestore | Where users and trips are stored. |
| Places provider | Gives us hotels, sights, restaurants and nightlife. Google Places, or our demo data if there is no key. |
| AI provider | Suggests the city split. Groq, or a mock for testing. |
| OpenStreetMap | Map tiles. |

## 3. Functional requirements

These say what the system does, how it reacts to inputs and how it behaves in different situations.

### Accounts

| ID | Requirement | Status |
|---|---|---|
| FR-1 | The system shall let a user sign up and sign in with an email and password. | Done |
| FR-2 | The system shall let a user sign in with Google. | Done |
| FR-3 | The system shall let a user sign out. | Done |
| FR-4 | The system shall allow only signed-in users to open the dashboard and trip pages. | Done |
| FR-5 | If a user starts a trip on the landing page and then signs up, the system shall keep what they entered. | Done |

### Creating a trip

| ID | Requirement | Status |
|---|---|---|
| FR-6 | The system shall let a user create a trip through a wizard with these steps: destination, dates, budget and currency, who is travelling, travel style, and a final review. | Done |
| FR-7 | The system shall check what the user enters in the wizard and show an error if a value is not allowed (the limits are in NFR-11). | Done |
| FR-8 | The system shall decide which cities to visit and how many days each one gets. | Done |
| FR-9 | The system shall accept a city plan only if the days add up to the trip length, no city is repeated, every city gets at least 1 day, there are not more than 8 cities, and there are no more cities than days. | Done |
| FR-10 | If the AI gives a plan that is broken or breaks FR-9, the system shall ask it once more. If the AI fails, takes too long, or is still wrong, the system shall use the non-AI planner. The trip shall record which planner was used. | Done |
| FR-11 | The system shall build a day-by-day plan with a hotel for each city and meals and activities for each day. | Done |
| FR-12 | The system shall show where each place came from. A place without a real source shall be marked "Demo data". | Done |

### Managing trips

| ID | Requirement | Status |
|---|---|---|
| FR-13 | The dashboard shall show the user's own trips and let the user open or delete one. | Done |
| FR-14 | The system shall let a user rename a trip from its trip page. | Done |
| FR-15 | The system shall let a user add, edit, remove and reorder activities. Reordering is by drag and drop. | Done |
| FR-16 | The system shall let a user change a city's hotel and swap an activity with a place picked from search. | Done |
| FR-17 | The system shall let a user add, remove, rename and re-time cities. The days are rebalanced and FR-9 is checked again. | Done |
| FR-18 | The system shall save every change to the trip as soon as it is made. | Done |

### Map, feasibility and budget

| ID | Requirement | Status |
|---|---|---|
| FR-19 | The map shall show a pin for every place that has real coordinates, and a line joining each day's stops in order. | Done |
| FR-20 | The map shall be filterable by whole trip, city or day. Clicking a pin shall open that place in the roadmap and the other way round. | Done |
| FR-21 | The system shall estimate travel time between stops and between cities. | Done |
| FR-22 | The system shall mark a day red if it does not fit between 09:00 and 21:00, and amber if it is tight. | Done |
| FR-23 | The system shall show the budget split into flights, hotels, food, activities, transport, shopping, misc and buffer, and recalculate it after every edit. | Done |
| FR-24 | If the trip goes over budget, the system shall show up to three ways to save money. | Done |

### Still to do

| ID | Requirement | Status |
|---|---|---|
| FR-25 | The system shall let a user log what was actually spent and compare it with the plan. | Planned |
| FR-26 | The system shall let a user share a trip through a read-only link. | Planned |
| FR-27 | The system shall record the time from creating a trip to finishing it (TTCI), for the pilot study. | Planned |

## 4. Non-functional requirements

These are constraints on how the system works. We have grouped them the way the course does: product, organisational and external. Where we could, we wrote them so they can be tested.

### 4.1 Product requirements

| ID | Type | Requirement | How we check it | Status |
|---|---|---|---|---|
| NFR-1 | Reliability | The app shall work end to end with no Google Places or Groq key, using demo data. If a Google Places search fails or comes back empty, the gap shall be filled with demo data instead of failing the whole trip. | Run the app with no keys set. | Done |
| NFR-2 | Reliability | Sign-in and saving a trip shall be available at least 99% of the time on staging during the pilot. | Uptime during the pilot window. | Planned |
| NFR-3 | Efficiency (performance) | A call to the AI shall time out after 20 seconds, after which the non-AI planner shall be used. | Groq provider tests (timeout case) and planning pipeline tests (fallback). | Done |
| NFR-4 | Efficiency (performance) | Place searches shall be cached on the server for 10 minutes (500 entries at most), so the same search is not paid for twice. | Cache unit tests. | Done |
| NFR-5 | Usability | A first-time user shall be able to finish a 3-day trip with at least 5 stops in 15 minutes or less (median). This is the TTCI target from the proposal. | Pilot study, 12 to 20 participants. | Planned |
| NFR-6 | Usability | The layout shall adapt to phone and laptop screens, and both light and dark themes shall be supported. | Check by hand in a narrow window. | Done |
| NFR-7 | Security | Only the owner of a trip shall be able to read, edit or delete it, and the owner shall not be changeable after the trip is created. Everything else is denied by default (Firestore security rules). | Security rules tests on the emulator, run in CI. | Done |
| NFR-8 | Security | The routes for planning, generation, rebuilding and place search shall need a valid Firebase login token. The photo route shall accept only signed URLs. | A request without a token gets 401 (403 for photos); token checks have unit tests. | Done |
| NFR-9 | Security | The Google Places and Groq keys shall be read only on the server and never sent to the browser. | Keys have no `NEXT_PUBLIC_` prefix. | Done |
| NFR-10 | Maintainability | Places and AI shall sit behind interfaces, and all database access shall go through service files, so a provider can be switched without changing the rest of the code. | Code review. | Done |
| NFR-11 | Data limits | Destination shall be 2 to 80 characters, budget more than 0 and at most 100,000,000, travellers 1 to 20, travel styles 1 to 8, currency one of INR, USD, EUR or GBP, the end date shall not be before the start date, and a trip shall have at most 8 cities. | Zod schemas in the API routes, the wizard's date check, and the plan checks (FR-9). | Done |

### 4.2 Organisational requirements

| ID | Type | Requirement | Status |
|---|---|---|---|
| NFR-12 | Implementation | The app shall be built with Next.js, React and TypeScript, with Firebase for login and storage and no separate backend server. Server-side work shall be done in Next.js API routes. | Done |
| NFR-13 | Standards (process) | Every push shall run lint, unit tests, the security rules tests and a production build on GitHub Actions. Work shall be done on separate branches and merged into `main`. | Done |
| NFR-14 | Delivery | Every merge into `main` shall be deployed automatically to a staging site on Vercel. | Done |

### 4.3 External requirements

| ID | Type | Requirement | Status |
|---|---|---|---|
| NFR-15 | Interoperability | The map shall use OpenStreetMap tiles with the attribution their usage policy asks for, and places shall be fetched through the provider interface so Google Places can be used when a key is given. | Done |
| NFR-16 | Ethical | Travel times, distances and costs shall always be labelled as estimates, and a place shall never be shown as verified unless it has a real source. | Done |
| NFR-17 | Privacy | A trip shall be visible only to its owner. The pilot shall not collect location history or contact details, and participants shall be told what is recorded. | Done (trips) / Planned (pilot) |

## 5. Domain requirements

These come from the travel and budgeting domain. If they are wrong, the output looks wrong to anyone who has planned a trip.

| ID | Requirement |
|---|---|
| DR-1 | A sightseeing day shall be measured against a 09:00 to 21:00 window. Time at places, travel between them and a buffer for queues all count towards it. |
| DR-2 | The budget shall add a small fixed daily allowance (500) for local transport, a miscellaneous amount of 4% of the other costs, and a buffer of 5% of the user's budget, with a minimum of 3000. |
| DR-3 | The trip shall be priced for the whole group. Flights shall be multiplied by the number of travellers, and the other costs are for the group as a whole. |
| DR-4 | The stops in a day shall be visited nearest-first starting from the hotel, so the day does not zigzag across the city. |
| DR-5 | A change of city shall appear as its own travel step on the arrival day, with a mode and a duration. |

## 6. Use cases

### UC-1: Sign up / sign in

Actors: Traveller, Firebase Authentication

1. The user opens sign-in or sign-up.
2. They enter email and password, or pick Google.
3. Firebase checks it and gives back a token.
4. They land on the dashboard.

If the details are wrong, an error is shown and they stay on the same page.

### UC-2: Create a trip

Actors: Traveller, AI provider, places provider. The user must be signed in.

1. The user goes through the wizard.
2. The app asks the AI how to split the days between cities.
3. The split is checked against FR-9.
4. Places are fetched for each city and the days are filled in, checking that each day fits.
5. The budget is worked out and the trip is saved.
6. The trip page opens with the roadmap, map and budget.

If the AI fails at step 2 or 3, the non-AI planner makes the split and the loading screen tells the user.

### UC-3: Edit the itinerary

Actor: Traveller (owner of the trip)

1. The user adds, edits, removes or drags an activity, or changes a hotel.
2. The change is saved.
3. The budget, warnings and map update.

### UC-4: Edit cities

Actors: Traveller, places provider

1. The user opens "Edit cities" and makes changes.
2. The days are rebalanced and FR-9 is checked.
3. The server checks it again and only rebuilds the cities that are new or changed. Cities that weren't touched keep their activities.

If a rule is broken, the problem is shown and nothing is saved.

### UC-5: Replace a place

Actors: Traveller, places provider

1. From an activity, the user searches for a place.
2. Matching places come back from the provider.
3. The user picks one and it replaces the activity.

If the live search fails, demo results are shown with a message saying so.

### UC-6: View map and budget

Actors: Traveller, OpenStreetMap

1. The user opens the map or budget tab.
2. The map shows the places and the day lines, for the whole trip, a city or a day.
3. The budget tab shows each category, and savings tips if the trip is over budget.

### UC-7: Manage trips

Actor: Traveller

1. The user opens the dashboard and sees their trips.
2. They open one, or delete one from its card.
3. On the trip page they can rename it.

## 7. Assumptions and limits of the current build

- Travel times are worked out from distance, not from a routing service. We don't fetch opening hours either.
- Google Places charges per request, which is why it is optional and the results are cached.
- The Google Places provider is written against the documented API but we have not tested it with a live key yet. All our tests use the demo provider.
- The 3000 minimum buffer and the 500 daily transport allowance are fixed numbers in the code. They are not converted when the trip is in USD, EUR or GBP, so they are too big for those currencies.
- A Firebase login token that has been revoked still works until it expires (up to an hour), because we check tokens against Google's public keys and not with the Firebase Admin SDK.
