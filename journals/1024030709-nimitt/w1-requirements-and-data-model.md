# Week 1 : Requirements that Did Not Match the Proposal, and the Data Model

# Requirements and Data Model

## Problem

I had to write the requirements document for TripEase. While doing it I
found that it could not simply repeat the project proposal. The proposal
kept AI-generated itineraries out of scope, but the code we had built
already used an AI model for one small decision: how many days to spend in
each city.

## Relevant Context

The course asks for requirements in four groups: functional requirements,
non-functional requirements (split into product, organisational and
external) and domain requirements. Every requirement needs an ID so that it
can be traced to a use case and a test.

In the code, the AI model only suggests the split of days between cities.
Our own rules then check its answer, and if the model is down or gives a
bad answer, a normal (non-AI) planner is used instead.

## Key Observation

A requirement is only useful if someone can check it against the build. So
each requirement got an ID and a status, **Done** if it works in the
current build and **Planned** if it is left for the final submission. This
also made the gaps visible: the expense log (FR-25), the read-only share
link (FR-26) and the time-to-complete measurement (FR-27) are still
planned.

## Solution

- The requirements page (`docs/requirements.md`) has a Scope section that
  says plainly what changed from the proposal: AI is used for the city
  split only, it is checked by our own rules, and the app still works
  without it.
- Requirements are grouped as in the course: functional (FR-1 to FR-27),
  non-functional product, organisational and external, and domain
  requirements (DR-1 to DR-5).
- The same change is explained in the report under "Changes Since the
  Proposal".

## Data Model

The second task of the week was the ER diagram. I drew it in Chen notation
with eight entities: User, Trip, City, Hotel, Trip Day, Activity, Budget
and City Plan.

The question was which entities are weak. Hotel, Budget and City Plan have
no key of their own, because each exists only as part of a city or a trip,
so they are drawn as weak entities with identifying relationships.

A second question was how to show that a whole trip is stored as one
Firestore document. I kept the ER diagram as the logical model and
explained the storage separately in the data model page. A trip is small
enough to stay well below Firestore's 1 MiB document limit, and it loads and
saves in one read or write. The relationship between a trip and its days is
partly redundant, since a day already points to its city, but I kept it
because the days are stored directly under the trip.
