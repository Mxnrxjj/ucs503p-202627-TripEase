# Week 2 : An Activity Diagram that Did Not Follow the Course Notation

# Use Cases and the Activity Diagram

## Problem

My first activity diagram of the "Create a trip" use case looked correct,
but when I compared it with the course slides on activity diagrams it did
not follow the notation.

## Relevant Context

The use case diagram and the use case descriptions came first. There are
twelve use cases: UC-1 to UC-7 come from the requirements, and UC-8 to
UC-12 are supporting use cases that the main ones include or extend. For
example, UC-2 Create a trip includes UC-8 Plan city split, and UC-9 Use
fallback planner extends UC-8. Each use case is written with the template
from the course.

The activity diagram describes UC-2, from the moment the traveller presses
Generate to the moment the new roadmap opens.

## Key Observation

Comparing my first version with the slides, these things were wrong:

- Several arrows entered an action directly. The course notation uses a
  merge diamond for this, with several entries and one exit.
- The exits of the decisions were not all labelled with guards in square
  brackets, which together must cover every case.
- I had used dashed arrows, which are not part of the activity notation.
- The swimlanes did not follow the rule that each action sits in the lane
  of the object that performs it.

I also found one factual mistake while checking the diagram against the
code. I had an action for savings tips, but the code works them out when
the trip page is shown, not when the trip is generated. The action became
"Work out the budget (eight categories)".

## Solution

I redrew the diagram with one start, end nodes, merge diamonds, decisions
whose guards cover every case, and five swimlanes: Traveller, TripEase, AI
provider, Places provider and Cloud Firestore. The four place searches for
a city run at the same time in the code, but they are drawn as one action,
so the diagram needs no fork and join.

Graphviz could not align swimlanes using clusters, so the layout is fixed by
hand (`neato -n`). I then wrote a ten step walkthrough in
`docs/activity-diagram.md` and checked every step against the code: the
token check, the Zod validation, the single retry with a repair note, the
fallback planner, the second check on the server, the feasibility rule for
adding a stop to a day, the transfer on the first day of each new city, the
budget and the save to Firestore.
