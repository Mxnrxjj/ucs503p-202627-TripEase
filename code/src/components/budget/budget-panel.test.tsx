import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { BudgetPanel } from "@/components/budget/budget-panel";
import { quoteFlights } from "@/lib/flights/quote";
import { fromInr } from "@/lib/fx";
import { buildSavingsSuggestions } from "@/lib/services/budget-engine";
import type { TripBudgetCheck } from "@/lib/services/budget-check";
import type { FlightQuote } from "@/types/flights";
import { buildThailandTrip } from "@/test-support/trip-fixture";
import type { AgentTrip } from "@/types/trip-agent";

let trip: AgentTrip;
beforeAll(async () => {
  trip = await buildThailandTrip();
});

/** The same trip, but over its budget, so the engine has something to suggest. */
const overBudget = () => ({ ...trip.budget, total: Math.round(trip.budget.estimatedTotal * 0.7) });

describe("savings suggestions", () => {
  it("offers nothing while the trip is within its budget", () => {
    const within = { ...trip.budget, total: trip.budget.estimatedTotal };
    expect(buildSavingsSuggestions(trip.cities, trip.days, within, trip.travelers)).toEqual([]);
  });

  it("each comes with the words to ask Travis to carry it out", () => {
    const suggestions = buildSavingsSuggestions(trip.cities, trip.days, overBudget(), trip.travelers);
    expect(suggestions.length).toBeGreaterThan(0);
    for (const s of suggestions) expect(s.askTravis.length).toBeGreaterThan(10);
  });

  it("names the real hotel city and the real activity it is about", () => {
    const suggestions = buildSavingsSuggestions(trip.cities, trip.days, overBudget(), trip.travelers);
    const hotel = suggestions.find((s) => s.kind === "hotel-downgrade");
    expect(hotel?.askTravis).toMatch(/cheaper, well-rated hotel in /);
    expect(trip.cities.some((c) => hotel?.askTravis.includes(c.name))).toBe(true);

    const activity = suggestions.find((s) => s.kind === "activity-swap");
    if (activity) {
      const target = trip.days.flatMap((d) => d.activities).find((a) => a.id === activity.targetId)!;
      expect(activity.askTravis).toContain(target.name);
    }
  });

  it("claims no star rating for a hotel it has not looked up", () => {
    const text = JSON.stringify(buildSavingsSuggestions(trip.cities, trip.days, overBudget(), trip.travelers));
    expect(text).not.toMatch(/3-star/);
  });
});

describe("BudgetPanel", () => {
  const renderPanel = (onAskTravis = vi.fn()) => {
    const budget = overBudget();
    render(<BudgetPanel budget={budget} suggestions={buildSavingsSuggestions(trip.cities, trip.days, budget, trip.travelers)} onAskTravis={onAskTravis} />);
    return onAskTravis;
  };

  it("hands a suggestion to Travis instead of editing the trip itself", () => {
    const onAskTravis = renderPanel();
    expect(screen.queryByRole("button", { name: "Apply" })).not.toBeInTheDocument();

    const buttons = screen.getAllByRole("button", { name: "Ask Travis" });
    fireEvent.click(buttons[0]);
    expect(onAskTravis).toHaveBeenCalledTimes(1);
    expect(onAskTravis.mock.calls[0][0]).toMatch(/cheaper, well-rated hotel in /);
  });

  it("calls a saving an estimate, not a promise", () => {
    renderPanel();
    expect(screen.getAllByText(/Est\. saving/).length).toBeGreaterThan(0);
  });
});

describe("the flight quote", () => {
  const quote = quoteFlights({
    origin: "BOM",
    destination: "Singapore",
    startDate: "2027-03-08",
    travelers: 2,
    now: new Date("2026-11-13T12:00:00Z"),
  })!;
  const renderWith = (flights: FlightQuote | null, currency = "INR") =>
    render(
      <BudgetPanel budget={{ ...trip.budget, currency }} flights={flights} suggestions={[]} onAskTravis={vi.fn()} />,
    );

  it("shows the route, the range per person and that it is an estimate", () => {
    renderWith(quote);
    expect(screen.getByText("Mumbai (BOM) → Singapore (SIN), return")).toBeInTheDocument();
    const range = screen.getByTestId("flight-range");
    expect(range).toHaveTextContent(`₹${quote.perTravelerInr.low.toLocaleString("en-IN")}`);
    expect(range).toHaveTextContent(`₹${quote.perTravelerInr.high.toLocaleString("en-IN")}`);
    expect(range).toHaveTextContent(`for 2`);
    expect(screen.getByText(quote.basis)).toBeInTheDocument();
    expect(screen.getByText(/not a live fare/)).toBeInTheDocument();
  });

  it("shows the range in the trip's currency", () => {
    renderWith(quote, "USD");
    expect(screen.getByTestId("flight-range")).toHaveTextContent(
      `$${fromInr(quote.perTravelerInr.typical, "USD").toLocaleString("en-IN")}`,
    );
  });

  it("explains a zero fare instead of showing a route", () => {
    const home = quoteFlights({
      origin: "DEL",
      destination: "India",
      firstCity: "Delhi",
      startDate: "2027-03-08",
      travelers: 2,
      now: new Date("2026-11-13T12:00:00Z"),
    })!;
    renderWith(home);
    expect(screen.queryByTestId("flight-range")).not.toBeInTheDocument();
    expect(screen.getByText(/no flight to pay for/)).toBeInTheDocument();
  });

  it("shows nothing for a trip without a quote", () => {
    renderWith(null);
    expect(screen.queryByText(/not a live fare/)).not.toBeInTheDocument();
  });
});

describe("a budget too low for the trip", () => {
  const minimum = { currency: "INR", budget: 114_000, parts: { flights: 29_960, hotels: 40_110, food: 19_200, transport: 14_478 } };
  // A function: the fixture trip is only built in beforeAll.
  const tooLow = () => ({ ...trip.budget, currency: "INR", total: 100_000, estimatedTotal: 133_284 });
  const renderWith = (check: TripBudgetCheck | null, note: string | null = null, budget = tooLow()) =>
    render(<BudgetPanel budget={budget} suggestions={[]} onAskTravis={vi.fn()} check={check} note={note} travelers={4} dayCount={8} />);

  it("says so, with the cheapest version's total and what it is made of", () => {
    renderWith({ verdict: "unrealistic", minimum });
    const notice = screen.getByTestId("budget-too-low");
    expect(notice).toHaveTextContent("This budget is too low for a trip like this.");
    expect(notice).toHaveTextContent("for 4 people over 8 days, comes to at least ₹1,14,000");
    expect(notice).toHaveTextContent("flights ₹29,960, 3-star hotels ₹40,110, simple local meals ₹19,200, getting around ₹14,478");
    expect(notice).toHaveTextContent("₹33,284 over your ₹1,00,000");
    // Instead of, not as well as, the ordinary over-budget line.
    expect(screen.queryByText(/See ways to save below/)).not.toBeInTheDocument();
  });

  it("leaves flights out of the list when they aren't in the budget", () => {
    renderWith({ verdict: "unrealistic", minimum: { ...minimum, parts: { ...minimum.parts, flights: 0 } } });
    expect(screen.getByTestId("budget-too-low")).not.toHaveTextContent("flights");
  });

  it("adds the written note when there is one", () => {
    renderWith({ verdict: "unrealistic", minimum }, "Hotels for four people take most of this budget.");
    expect(screen.getByText("Hotels for four people take most of this budget.")).toBeInTheDocument();
  });

  it("speaks of one person and one day correctly", () => {
    render(<BudgetPanel budget={tooLow()} suggestions={[]} onAskTravis={vi.fn()} check={{ verdict: "unrealistic", minimum }} travelers={1} dayCount={1} />);
    expect(screen.getByTestId("budget-too-low")).toHaveTextContent("for 1 person over 1 day");
  });

  it("keeps the ordinary messages when the budget could cover the trip", () => {
    renderWith({ verdict: "over", minimum });
    expect(screen.queryByTestId("budget-too-low")).not.toBeInTheDocument();
    expect(screen.getByText(/See ways to save below/)).toBeInTheDocument();
    cleanup();
    renderWith({ verdict: "fits", minimum }, null, { ...tooLow(), estimatedTotal: 90_000 });
    expect(screen.getByText("Your trip fits comfortably within budget.")).toBeInTheDocument();
    cleanup();
    renderWith(null);
    expect(screen.queryByTestId("budget-too-low")).not.toBeInTheDocument();
  });
});
