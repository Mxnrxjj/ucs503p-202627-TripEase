# Week 2 : The Wizard Steps, and a Generation Screen that Shows Only Real Progress

# The Wizard Steps, the Wizard Shell and the Generation Loader

## Problem

Generating a trip takes a few seconds. I wanted the user to see that
something is happening, but I did not want a progress bar that moves on a
timer or shows a made-up percentage. That would tell the user something that
is not true.

## Relevant Context

The page `trips/new/page.tsx` has two phases: the wizard and the generating
screen. When the user presses "Generate my trip" the page does four things
in order:

1. `POST /api/trips/plan` decides the cities.
2. `POST /api/trips/generate` finds places and builds the itinerary and the
   budget.
3. The trip is saved to Firestore.
4. The browser opens the new roadmap.

## Key Observation

These are the only four real boundaries in the work. "Finding places" and
"building the itinerary" look like two steps, but they are one server call.
Showing them as two lines would be invented progress, so I did not do it.

## Solution

- `GenerationLoader` has four stages: planning, places, saving and roadmap.
  A stage moves forward only when the real work moves forward.
- When the planner returns, the chosen cities are shown straight away under
  "Your route", with their number of days and the reason. A badge says
  whether the route was "AI planned" or planned by "TripEase planner" (the
  fallback). If it is the fallback, a short line says that AI planning was
  not available.
- `WizardShell` shows the six steps (Destination, Dates, Budget, Travelers,
  Style, Review) as a bar at the top. A step is coloured when it is reached,
  and the label of the current step is highlighted. The step content slides
  in with Framer Motion.
- If anything fails, the page goes back to the wizard and shows the error
  message, so the user can try again.

## The Six Steps

The steps are in `wizard/steps.tsx`. All of them read and write one
`WizardData` object. The budget is kept as text, so the field can be empty
while the user types. The update function accepts either a patch or a
function of the previous state, so two quick clicks never use an old value.

- **Destination.** A text field with focus on load, and six quick choices:
  Thailand, Bali (Indonesia), Italy, Japan, Goa (India) and Vietnam.
- **Dates.** A start date and an end date. The start date is set as the
  minimum of the end date field.
- **Budget.** A currency (INR, USD, EUR or GBP) and an amount. The amount is
  shown below in large type, formatted with `formatMoney`, so the user sees
  immediately what was typed.
- **Travellers.** Four types: Solo, Couple, Family and Friends. Choosing one
  sets a default number of travellers (1, 2, 4 and 4). The plus and minus
  buttons keep the number between 1 and 20 and change the type to "custom".
  Both buttons have labels for screen readers.
- **Style.** Eight choices (beaches, food, culture, adventure, nightlife,
  shopping, nature, relaxation). The user can pick as many as they like, and
  pressing a chosen one removes it.
- **Review.** A summary of all values. A missing value shows "—", and an
  empty style list shows "No preferences selected".

## Result

The user sees the real stages and the real cities, and nothing on the screen
claims more than the app has actually done.
