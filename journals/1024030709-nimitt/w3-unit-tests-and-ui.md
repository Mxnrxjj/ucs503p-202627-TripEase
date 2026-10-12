# Week 3 : Unit Tests for the Formatting Helpers, and the Shared UI and Sign-in Screens

# Unit Tests and UI

## Problem

The helpers in `lib/utils.ts` format money, durations and dates everywhere
in the app, but they had no unit tests of their own.

## Relevant Context

There are six helpers: `cn` (joins class names), `formatMoney`,
`formatDurationShort`, `formatDateShort`, `formatDateLong` and
`addDaysIso`. `formatMoney` groups digits the Indian way, so one lakh is
written as ₹1,00,000, and it falls back to the currency code for a currency
it does not know. The date helpers work in UTC so that a date does not move
by a day in another time zone.

## Key Observation

Most of the value was in the edge cases, not in the normal case:
rounding of half values, zero and negative durations, a rollover across a
month, a year or a leap day, and the same calendar day in any time zone.

## Solution

I wrote 26 tests in six groups with Vitest in `utils.test.ts`, one group
for each helper. They check, for example, that `formatMoney(1234567)` gives
₹12,34,567, that `formatDurationShort(-30)` gives `0m`, and that
`addDaysIso("2028-02-28", 1)` gives `2028-02-29`. All of them pass in
continuous integration.

## Shared UI and Sign-in Screens

I also worked on the shared interface components and the sign-in screens.

- **Components.** `Button` has five variants (primary, secondary, outline,
  danger, ghost) and four sizes. `Chip` is a toggle button that sets
  `aria-pressed`. `Progress` is the budget bar and keeps its value between 0
  and 100. They all merge their classes with `cn`, and they support dark
  mode.
- **Sign-in and sign-up.** The two pages are only a few lines each. Both use
  the same `AuthForm` with a `mode` value, so the form is written once. If
  the user had started a trip on the landing page, the form sends them back
  to the trip wizard after signing in, so what they typed is kept.
- **Auth state.** Firebase Auth state exists only in the browser, so
  `AuthProvider` listens for it and keeps a `loading` flag until the first
  answer arrives. `RequireAuth` uses it to guard the protected pages: it
  shows a placeholder while the state is unknown and sends a visitor who is
  not signed in to the sign-in page, so the page does not flash first.
