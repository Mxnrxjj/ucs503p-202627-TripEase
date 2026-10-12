# Week 3 : A Dashboard that Updates Live, the Trip Page and the Roadmap

# Dashboard, Trip Page and Roadmap Components

## Problem

The dashboard has to show the user's own trips, keep the list up to date
when a trip changes, and let the user delete a trip without deleting it by
accident. The roadmap has to show many small facts about each stop without
becoming a wall of text. The trip page has to connect the roadmap, the
budget and the map, so that every edit moves all three together.

## Relevant Context

Trips are stored in Firestore. The service `subscribeToOwnerTrips` calls a
function every time the list changes, and returns a function that stops the
listening.

## Solution: Dashboard

- `dashboard/page.tsx` starts listening when the user is known, and stops
  listening when the page is left (the cleanup function of `useEffect`).
- While the first answer has not come yet, the page shows three grey pulsing
  cards. `trips === null` means "not loaded yet", and an empty list means
  "no trips", so the two cases show different things.
- Trips are split into "Your trips" and "Past trips" by comparing the end
  date with today.
- If the user has no trips, an empty state invites them to create one. If
  loading fails, an alert shows the error.
- In `TripCard`, the bin icon does not delete at once. It changes into
  "Cancel" and "Confirm" buttons. The card shows the dates, the number of
  travellers and the budget, formatted with `formatMoney`.

## Solution: Roadmap Rows

- `CitySection` shows the city name and dates, the hotel as a button that
  opens the hotel editor, and one expandable row for each day. A day row
  can show a "Transfer" badge, a red warning icon if the day may be too
  full, and the total cost of the day.
- `ActivityRow` uses `useSortable` from dnd-kit, so a row can be dragged to
  a new place. The drag handle appears only when the pointer is over the
  row.
- Places that do not have a verified source carry a "Demo data" badge, and a
  stop with no price shows "Free". The reference link opens in a new tab.
- Clicking a row with a location selects its place on the map.

## Solution: Trip Page

`trips/[tripId]/page.tsx` listens to one trip with `subscribeToTrip`.

- The page has three cases: while the first answer has not come, a skeleton
  is shown; if loading fails, an alert shows the error; and if there is no
  trip, the page says "This trip doesn't exist, or it isn't yours" with a
  link back to the dashboard.
- `TripHeader` shows the title (a pencil icon lets the user rename it, and an
  empty name is not saved), the dates, the number of nights and cities, and
  the budget bar. The bar is clamped to 100% and turns red when the estimate
  is above the budget.
- There are two tabs, Roadmap and Budget. On a small screen a "Show map" and
  "Hide map" button controls the map. On a large screen the map stays on the
  side while the page scrolls.
- Every edit (add, edit, delete or move an activity, change a hotel, apply a
  saving) calls a pure function from `trip-mutations.ts`, which returns the
  new days or cities together with the recalculated budget. The page then
  saves them in one write, so the roadmap and the budget cannot disagree.
- Travel times and warnings are not stored. `analyzeTrip` runs again after
  every change, so trips saved earlier are also analysed correctly.
- The map and the roadmap are linked. Selecting a place on the map opens the
  day that contains it and scrolls to its row. The map filter follows the day
  that is open, so the map has no separate day picker.
- "Edit cities" sends the new city list to `/api/trips/rebuild`, then saves
  the cities, days, budget and planning record in one write, and clears the
  selection so it cannot point at a removed city.

## Solution: Day View

- The header shows "Day N · City", the date, a line such as "~6.5h planned ·
  1.5h travel (est.)" and the planned cost of the day.
- Activities are sortable. The drag starts only after the pointer moves 4
  pixels, so a normal click on a row is not taken as a drag. After a drop the
  new order is passed up and the travel rows are calculated again.
- A city transfer is shown at the top of the day as a dashed card, for
  example "Bangkok → Phuket" with the mode, the time and the distance, and it
  says "estimated". It is not shown as an activity, because getting to a city
  is not something to do there. The legs between stops are small grey lines
  marked "(est.)".
- `FeasibilityNotes` shows each note by its level: a red note for a problem,
  an amber one for a warning and plain grey text for information. Nothing
  blocks the user. The notes only say what the engine noticed.
- An empty day shows "No activities yet — add the first one."

## Solution: Editing Dialogs

- **Hotel dialog.** The user can change the name, the price per night and the
  nights. The price cannot go below 0 and the nights cannot go below 1. If the
  name is changed, the hotel is marked as demo data and its link, rating,
  image and source are removed, because it is no longer the place that was
  found. If only the price or nights change, the source stays, and the price
  is marked as exact because the user typed it.
- **Activity dialog.** Adding and editing use the same dialog. The name is
  required, and a reference link must be a full URL. A hand-typed activity is
  marked as demo data. If an existing activity is renamed, it is marked as
  demo data again and its rating, image, source and location are removed,
  and the old link is dropped unless the user changed it.
- **Place search.** Inside the activity dialog, a search box calls
  `/api/places/search` with the user's sign-in token. It needs at least two
  characters, also works with the Enter key and shows a spinner. Each result
  shows the name, a "Demo" badge if needed, the rating, the address, the
  coordinates and an estimated price. Picking one fills the name, category,
  description, duration, cost and link, and keeps its location and source. If
  the user types over the name afterwards, the picked place is detached. If
  the search fails, a message says that the user can still type a name.
- **City dialog.** Each row has a city name and its days. Adding or removing
  a city shares the days again with `splitDaysAcrossCities`, keeping the
  relative sizes. "Add city" is disabled when there are as many cities as
  days, and a single remaining city cannot be removed. A counter shows "X of N
  days allocated", in green when it is correct and in amber when it is not.
  The dialog uses `validateCityAllocation`, the same check that the AI
  planner's result must pass, and "Save cities" stays disabled until it
  passes. The first problem is shown as a warning, and an error from the
  server is shown below it.

## Result

The dashboard is always in step with the data, deleting needs two clicks,
every roadmap row shows where its information came from, and an edit changes
the roadmap, the budget and the map together.
