"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { CountryCombobox } from "@/components/ui/country-combobox";
import { Input } from "@/components/ui/input";
import { saveDraft } from "@/lib/draft-storage";
import { focusAfterPick } from "@/lib/trip-focus";
import { toDateInputValue } from "@/lib/date";
import { budgetProblem, dateProblems, todayInputValue } from "@/lib/trip-input-checks";
import { cn } from "@/lib/utils";

function defaultDates() {
  const start = new Date();
  start.setDate(start.getDate() + 30);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start: toDateInputValue(start), end: toDateInputValue(end) };
}

const labelClass = "text-sm font-medium text-zinc-800 dark:text-zinc-200";
const errorClass = "text-xs text-red-600 dark:text-red-400";
const invalidClass = "border-red-400 focus-visible:border-red-500 focus-visible:ring-red-500/25";

const NO_COUNTRY = "Choose a country to start.";

/**
 * The start of a trip, on the landing page, before anyone has signed in. What
 * is entered is kept in the tab (see `draft-storage`) across sign-up, so the
 * wizard opens already filled in.
 *
 * The button always responds. Submitting with something missing or wrong says
 * what, under the field, and moves the cursor there; nothing is saved until it
 * is all valid. Messages wait for that first try so a fresh form isn't red.
 */
export function TripPlannerWidget({ today = todayInputValue() }: { today?: string } = {}) {
  const router = useRouter();
  const [dates] = useState(defaultDates);
  const [destination, setDestination] = useState("");
  // A place picked through the country box ("goa", then India) goes on to the wizard.
  const [focus, setFocus] = useState({ text: "", country: "" });
  const [startDate, setStartDate] = useState(dates.start);
  const [endDate, setEndDate] = useState(dates.end);
  const [budget, setBudget] = useState("150000");
  const [tried, setTried] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const countryError = destination === "" ? NO_COUNTRY : null;
  const dateErrors = dateProblems(startDate, endDate, today);
  const budgetError = budgetProblem(budget, "INR");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setTried(true);

    const firstInvalid = countryError
      ? "hero-destination"
      : dateErrors.start
        ? "hero-start"
        : dateErrors.end
          ? "hero-end"
          : budgetError
            ? "hero-budget"
            : null;
    if (firstInvalid) {
      document.getElementById(firstInvalid)?.focus();
      return;
    }

    setSubmitting(true);
    saveDraft({
      destination,
      ...(focus.text ? { focus: focus.text } : {}),
      startDate,
      endDate,
      budget: Number(budget),
      currency: "INR",
    });
    router.push("/sign-up");
  }

  const show = (message: string | null | undefined) => (tried ? message ?? null : null);
  const startError = show(dateErrors.start);
  const endError = show(dateErrors.end);
  const shownBudgetError = show(budgetError);

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="animate-drift-up w-full max-w-md rounded-3xl bg-white/50 p-6 text-zinc-900 shadow-2xl shadow-black/30 [animation-delay:250ms] dark:bg-zinc-900/60 dark:text-zinc-100"
    >
      <h2 className="font-display text-2xl font-medium tracking-tight">
        Plan your trip
      </h2>
      <p className="mt-1 text-sm text-zinc-500">
        Pick a country, your dates and a budget.
      </p>

      <div className="mt-5 flex flex-col gap-4">
        <CountryCombobox
          id="hero-destination"
          label="Where to?"
          value={destination}
          onChange={(country, typed) => {
            setDestination(country);
            setFocus((prev) => ({
              text: focusAfterPick(prev.text, prev.country, country, typed),
              country: country || prev.country,
            }));
          }}
          error={show(countryError)}
        />

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="hero-start" className={labelClass}>
              From
            </label>
            <Input
              id="hero-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              aria-invalid={startError ? true : undefined}
              aria-describedby={startError ? "hero-start-error" : undefined}
              className={cn(startError && invalidClass)}
              required
            />
            {startError ? (
              <p id="hero-start-error" className={errorClass}>
                {startError}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="hero-end" className={labelClass}>
              To
            </label>
            <Input
              id="hero-end"
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              aria-invalid={endError ? true : undefined}
              aria-describedby={endError ? "hero-end-error" : undefined}
              className={cn(endError && invalidClass)}
              required
            />
            {endError ? (
              <p id="hero-end-error" className={errorClass}>
                {endError}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="hero-budget" className={labelClass}>
            Budget (₹)
          </label>
          <Input
            id="hero-budget"
            type="number"
            min={0}
            inputMode="numeric"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="150000"
            aria-invalid={shownBudgetError ? true : undefined}
            aria-describedby={shownBudgetError ? "hero-budget-error" : undefined}
            className={cn(shownBudgetError && invalidClass)}
          />
          {shownBudgetError ? (
            <p id="hero-budget-error" className={errorClass}>
              {shownBudgetError}
            </p>
          ) : null}
        </div>

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={submitting}
        >
          {submitting ? "Taking you there…" : "Build my itinerary"}
        </Button>
        <p className="text-center text-xs text-zinc-500">
          Free to try. You&apos;ll sign up next, and your trip is saved to your
          account.
        </p>
      </div>
    </form>
  );
}
