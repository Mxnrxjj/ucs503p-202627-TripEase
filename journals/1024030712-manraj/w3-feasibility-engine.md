# Week 3 : A Feasibility Engine Built on Honest Estimates, and a Map that Never Guesses

# Distance, Travel Time, the Clock and Map Points

## Issue

A generated day can look fine and still be impossible: too many stops, too
far apart, no time to travel. The app needed a way to tell the traveller
that a day is too full, without calling a paid routing service.

## Decisions

**Distance is calculated locally.** `geo.ts` uses the haversine formula for
the great-circle distance. No provider call is made, which matters when the
Places quota is small. A coordinate is valid only if it is a finite number in
range and is not (0, 0), because (0, 0) is nearly always a provider default
meaning "unknown". If a distance cannot be worked out, the result is `null`,
and a guessed distance is never used instead.

**Travel time is a heuristic.** `travel-time.ts` turns a straight-line
distance into a journey:

- Distances are multiplied by 1.3 for roads (flights are not).
- Inside a city: walking up to 1.2 km, then car in bands of speed.
- Between cities: car up to 120 km, train up to 400 km, flight beyond that.
  Every mode has a fixed overhead, so a flight includes the 180 minutes of
  getting to and from the airport.
- Every result is marked `isEstimated: true`, so the screen can say
  "estimated". The code sits behind a `TravelTimeProvider` interface, so a
  real routing service could replace it later.

**Durations.** A duration given by a provider is used when there is one.
Otherwise the engine uses a middle value for the category (for example 90
minutes for sightseeing and 75 for food). The model is never asked to invent
a duration.

**Opening hours.** The Places integration does not request opening hours,
because they are a separate billable field. The check therefore answers
"unknown", and missing hours are not an error. When the field is turned on
later, only the provider needs to change.

**Map points.** The same rule, unknown stays unknown, is used for the map.
`map-points.ts` turns a saved trip into a flat list of points.

- A hotel or an activity becomes a point only if it has a coordinate. A place
  without one is not drawn, and no pin is put at a guessed position.
  `countUnmappablePlaces` counts the missing ones, so the screen can say how
  many.
- A point has the id of its activity, or `hotel:<cityId>` for a hotel. The
  roadmap and the map use this one key, and `roadmapElementId` is the single
  place that turns it into a page element id, so the two cannot drift apart.
- `filterMapPoints` has three modes: all, one city, or one day. In day mode the
  hotel of the city stays visible, because the day starts and ends there.
- `routeForDay` gives the points of a day in the planned order, and
  `cityTransferLines` gives straight lines between cities (the hotel is the
  anchor, or else the first mapped stop). Both are only "the order planned"
  and "these cities connect". They are not routes, because no routing service
  is used. For the day line the screen says: "Dashed line shows the order you
  planned this day — not a driving route."
- Each point carries what its card shows (time, duration, rating, address,
  link and source name), copied from the trip and never looked up. A duration
  of zero is treated as no duration, and a price counts as an estimate unless
  it is marked as exact.

`map-points.test.ts` covers these rules.

## Result

The same arithmetic is used when a day is generated and when it is shown, so
the generator does not create days that the engine would then mark red. A
day is judged against the 09:00 to 21:00 window, 720 minutes. On the map, only
places with a real coordinate are drawn.
