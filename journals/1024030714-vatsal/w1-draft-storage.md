# Week 1 : The Landing Page, and Keeping a Visitor's Trip Idea Alive through Sign-up

# The Landing Page and the Draft Across the Sign-up Redirect

## Problem

The landing page has a small form: destination, dates and budget. A visitor
fills it in and presses "Create my itinerary". But only a signed-in user can
plan a trip, so the visitor is sent to the sign-up page. Without extra work,
the wizard would open empty after sign-up, and everything the visitor typed
would be gone.

## Relevant Context

- The form is `trip-planner-widget.tsx`.
- The wizard is `trips/new/page.tsx`.
- Between them the visitor goes to the sign-up page, and the page changes
  more than once, so a normal React state cannot carry the data.

## Key Observation

The data only needs to live for a short time and only in this browser tab.
That is what `sessionStorage` is for. It is cleared when the tab is closed.

## Solution

I wrote a small module, `lib/draft-storage.ts`, with three functions:

``` ts
saveDraft(draft)   // landing page, just before going to /sign-up
readDraft()        // wizard, to pre-fill its first values
clearDraft()       // wizard, once it has read the draft
```

Three details made it safe:

- Every function first checks `typeof window === "undefined"`, because
  Next.js also runs this code on the server, where there is no `window`.
- Every call to `sessionStorage` is inside `try/catch`. In some private
  browsing modes it throws. In that case the draft is simply lost, and the
  app does not crash.
- The wizard reads the draft only once, in its first state. It then clears
  it, so an old draft cannot appear again later.

The landing page form also falls back to safe defaults: "Thailand" if the
destination is empty, and 1,50,000 if the budget is not a number.

## The Rest of the Landing Page

The home page (`app/page.tsx`) is built from separate sections in
`components/landing/`:

- `Hero` has the headline, two buttons ("Start planning" goes to sign-up,
  "Explore how it works" scrolls down to the four steps) and the planner
  form described above.
- `HowItWorks` explains the flow in four steps: tell us your trip, TripEase
  plans it, customize everything, travel.
- `ItineraryPreview` shows an example trip of 8 days across Bangkok and
  Phuket. The visitor can press a day number to see that day. The data is a
  fixed list written in the file, so it is the same for every visitor and is
  not a generated trip.
- `BudgetPreview` shows six example budget bars with fixed amounts.
- `Features` has six cards, and `FinalCta` repeats the sign-up button.
- The footer says that TripEase is a student project and that prices and
  names are demo data unless they are linked to a source.

The sections below the hero fade in once, with Framer Motion (`whileInView`
with `once: true`). A visitor who is already signed in is sent to
`/dashboard` with `router.replace`, as soon as the sign-in state has
finished loading.

## The Header Inside the App

`SiteHeader` is used by the signed-in pages. It has the logo (a link to the
dashboard), a "New trip" button (hidden on small screens), the user's name or
email (shown only on large screens) and a "Sign out" button. While signing
out, the button is disabled and shows "Signing out…", and afterwards the user
is sent to the sign-in page.

## Result

A visitor can type a trip idea, sign up, and arrive in the wizard with the
destination, dates and budget already filled in.
