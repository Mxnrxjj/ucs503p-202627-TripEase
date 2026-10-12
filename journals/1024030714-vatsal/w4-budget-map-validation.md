# Week 4 : The Budget Panel, the Map and the Validation Schemas

# Budget Panel, Map and Zod Schemas

## Budget panel

**Problem.** The budget has a lot of numbers: total, estimate, eight
categories and the savings suggestions. They have to be read at a glance.

**What I did.** `BudgetPanel` compares the estimate with the budget:

- The difference is shown as "remaining" or "over", and a bar shows the
  percentage. The bar is clamped to 100% and turns red when the trip is over
  budget.
- A warning alert appears when the estimate is above the budget, and a
  success alert when it is not.
- A Recharts bar chart shows the spending by category (categories with zero
  are left out), and a list below shows every category with its amount.
- If there are savings suggestions, each one has a title, a description, the
  saving and an "Apply" button.

## Map card

**Problem.** Leaflet needs `window` when it is imported. On the server there
is no `window`, so the page would fail.

**What I did.** `TripMap` loads the Leaflet layer with
`dynamic(..., { ssr: false })` and shows "Loading map…" meanwhile. The map
points are built from the live trip, never from a separate fixed list, so
the map always matches what the traveller edited. If a selected point is
filtered out, the selection is cleared, so no row stays highlighted without
a marker.

`PlaceCard` shows only what the trip really has. A place with no rating
shows no rating, and a place with no real reference link shows no link.
"Free" is shown only when the cost is recorded as zero.

## Map layer

`leaflet-map.tsx` is the part that draws the map.

- **Tiles.** The map uses OpenStreetMap tiles, which need no key, so the map
  also works in demo mode. In dark mode the tiles are slightly dimmed with
  CSS, and the markers and cards keep their own colours.
- **Markers.** I used my own round markers instead of Leaflet's default
  pins. A stop shows its number in the day, a hotel shows a hotel emoji, and
  the colour tells the type: orange for sights, red for food and indigo for
  hotels. The selected marker is larger.
- **Keyboard and screen readers.** Each marker is given the role of a button,
  a name such as "Wat Pho — day 1, Bangkok" and a pressed state. Enter
  selects it, and I added the Space key too, as a button would normally allow.
- **Scrolling.** A plain mouse wheel scrolls the page, so the map does not
  trap the reader. For one and a half seconds a hint says "Use Ctrl + scroll
  to zoom the map". With Ctrl (or Cmd) the wheel zooms the map around the
  cursor.
- **Viewport.** The map fits all visible points with a margin and a maximum
  zoom of 14. It fits again when its container changes size, because on a
  small screen the map can be created while it is still hidden and has no
  size. Selecting a point centres it without animation.
- **Lines.** An orange dashed line follows the order of the day. A blue dotted
  line joins the cities. Neither is a driving route, and no routing service
  is used.

Two test files check these components: `leaflet-map.test.tsx` (the wheel
behaviour and the marker names, states and keys) and `place-card.test.tsx`
(what the card shows, and what it must not invent).

## Validation schemas and demo data

**Problem.** A wrong value from the AI or from a user must not reach a saved
trip.

**What I did.** `lib/validation/trip.ts` has Zod schemas that mirror the
types. For example, the destination must have 2 to 80 characters, the budget
must be positive and at most 100,000,000, there can be 1 to 20 travellers,
and the currency is one of INR, USD, EUR or GBP. The itinerary produced by
the generator is checked against `generatedItinerarySchema` before it is
returned, so a bad result fails in the API route instead of being saved.

`lib/mock-data/fx.ts` holds fixed, approximate conversion rates, so the demo
generator can show amounts in the currency the user picked. They are not live
rates, and the file says so.

## Result

The budget, the map and the saved data all show only values that are
checked, and say clearly when a value is only an estimate.
