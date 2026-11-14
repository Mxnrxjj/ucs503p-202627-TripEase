import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import {
  BudgetStep,
  DatesStep,
  DestinationStep,
  ReviewStep,
  StyleStep,
  budgetStepProblem,
  flightsIncluded,
  flightsReady,
  focusStepProblem,
  type WizardData,
} from "@/components/trips/wizard/steps";
import { COUNTRIES } from "@/lib/countries";

const EMPTY: WizardData = {
  destination: "",
  focusMode: "anywhere",
  focus: "",
  startDate: "2027-01-10",
  endDate: "2027-01-17",
  budget: "150000",
  currency: "INR",
  travelerType: "couple",
  travelers: 2,
  preferences: [],
  includeFlights: null,
  flyingFrom: null,
};

function Harness({ initial = "" }: { initial?: string }) {
  const [data, setData] = useState<WizardData>({ ...EMPTY, destination: initial });
  return (
    <>
      <DestinationStep data={data} setData={(patch) => setData((prev) => ({ ...prev, ...(typeof patch === "function" ? patch(prev) : patch) }))} />
      <output data-testid="chosen">{data.destination}</output>
    </>
  );
}

const chosen = () => screen.getByTestId("chosen").textContent;

describe("DestinationStep", () => {
  it("says how many countries can be searched", () => {
    render(<Harness />);
    expect(screen.getByText(new RegExp(`Search ${COUNTRIES.length} countries`))).toBeInTheDocument();
  });

  it("offers one-tap choices, all of them supported countries", () => {
    render(<Harness />);
    const supported = new Set(COUNTRIES.map((c) => c.name));
    const chips = screen.getAllByRole("button", { pressed: false });
    expect(chips.length).toBeGreaterThanOrEqual(5);
    for (const chip of chips) expect(supported.has(chip.textContent ?? "")).toBe(true);
  });

  it("fills the search box and the trip when a quick choice is tapped", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Singapore" }));
    expect(chosen()).toBe("Singapore");
    expect(screen.getByRole("combobox", { name: "Destination" })).toHaveValue("Singapore");
    expect(screen.getByRole("button", { name: "Singapore" })).toHaveAttribute("aria-pressed", "true");
  });

  it("leaves the destination empty for anything that is not a supported country", () => {
    render(<Harness />);
    fireEvent.change(screen.getByRole("combobox", { name: "Destination" }), { target: { value: "Narnia" } });
    expect(chosen()).toBe("");
  });

  it("takes a country typed in full", () => {
    render(<Harness />);
    fireEvent.change(screen.getByRole("combobox", { name: "Destination" }), { target: { value: "japan" } });
    expect(chosen()).toBe("Japan");
  });

  it("still points to Travis for someone who has not decided", () => {
    render(<Harness />);
    expect(screen.getByRole("link", { name: "Ask Travis" })).toHaveAttribute("href", "/travis");
  });
});

function BudgetHarness({
  currency = "INR",
  budget = "150000",
  destination = "",
}: {
  currency?: string;
  budget?: string;
  destination?: string;
}) {
  const [data, setData] = useState<WizardData>({ ...EMPTY, currency, budget, destination });
  return (
    <BudgetStep data={data} setData={(patch) => setData((prev) => ({ ...prev, ...(typeof patch === "function" ? patch(prev) : patch) }))} />
  );
}

describe("BudgetStep rupee preview", () => {
  it("shows the rupee equivalent next to a foreign-currency budget", () => {
    render(<BudgetHarness currency="USD" budget="3614" />);
    expect(screen.getByTestId("budget-inr")).toHaveTextContent("₹2,99,962");
  });

  it("does not repeat the amount when the budget is already in rupees", () => {
    render(<BudgetHarness currency="INR" budget="500000" />);
    expect(screen.queryByTestId("budget-inr")).not.toBeInTheDocument();
  });

  it("hides the preview until an amount is entered", () => {
    render(<BudgetHarness currency="EUR" budget="" />);
    expect(screen.queryByTestId("budget-inr")).not.toBeInTheDocument();
  });

  it("updates the preview when the currency changes", () => {
    render(<BudgetHarness currency="USD" budget="1000" />);
    expect(screen.getByTestId("budget-inr")).toHaveTextContent("₹83,000");
    fireEvent.change(screen.getByLabelText("Currency"), { target: { value: "GBP" } });
    expect(screen.getByTestId("budget-inr")).toHaveTextContent("₹1,05,000");
  });
});

describe("BudgetStep flights switch", () => {
  const box = () => screen.getByRole("checkbox", { name: /include flights/i });

  it("starts ticked for a trip abroad", () => {
    render(<BudgetHarness destination="Thailand" />);
    expect(box()).toBeChecked();
  });

  it("starts unticked for a trip inside India, which may well be a road trip", () => {
    render(<BudgetHarness destination="India" />);
    expect(box()).not.toBeChecked();
  });

  it("lets the traveller untick it abroad and tick it in India", () => {
    const { unmount } = render(<BudgetHarness destination="Thailand" />);
    fireEvent.click(box());
    expect(box()).not.toBeChecked();
    unmount();

    render(<BudgetHarness destination="India" />);
    fireEvent.click(box());
    expect(box()).toBeChecked();
  });
});

describe("flightsIncluded", () => {
  it("follows the destination until the traveller chooses, then follows the choice", () => {
    expect(flightsIncluded({ destination: "India", includeFlights: null })).toBe(false);
    expect(flightsIncluded({ destination: "Japan", includeFlights: null })).toBe(true);
    expect(flightsIncluded({ destination: "India", includeFlights: true })).toBe(true);
    expect(flightsIncluded({ destination: "Japan", includeFlights: false })).toBe(false);
  });
});

describe("BudgetStep flying from", () => {
  const picker = () => screen.queryByRole("combobox", { name: /flying from/i });

  it("asks where the traveller flies from only while flights are included", () => {
    render(<BudgetHarness destination="Thailand" />);
    expect(picker()).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /include flights/i }));
    expect(picker()).not.toBeInTheDocument();
  });

  it("offers Indian airports by city, and keeps the choice", () => {
    render(<BudgetHarness destination="Thailand" />);
    const select = picker() as HTMLSelectElement;
    expect(screen.getByRole("option", { name: "Delhi (DEL)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Chandigarh (IXC)" })).toBeInTheDocument();
    // Leh is a place to fly to, not a starting point.
    expect(screen.queryByRole("option", { name: /Leh/ })).not.toBeInTheDocument();
    fireEvent.change(select, { target: { value: "BOM" } });
    expect(select.value).toBe("BOM");
  });
});

describe("flightsReady", () => {
  it("needs an airport only when flights are included", () => {
    expect(flightsReady({ destination: "Japan", includeFlights: null, flyingFrom: null })).toBe(false);
    expect(flightsReady({ destination: "Japan", includeFlights: null, flyingFrom: "BLR" })).toBe(true);
    expect(flightsReady({ destination: "Japan", includeFlights: null, flyingFrom: "IXL" })).toBe(false);
    expect(flightsReady({ destination: "Japan", includeFlights: false, flyingFrom: null })).toBe(true);
    expect(flightsReady({ destination: "India", includeFlights: null, flyingFrom: null })).toBe(true);
  });
});

describe("ReviewStep flights", () => {
  it("says where the flights are from, or that they are left out", () => {
    const { unmount } = render(<ReviewStep data={{ ...EMPTY, destination: "Japan", flyingFrom: "CCU" }} />);
    expect(screen.getByText("From Kolkata (estimate)")).toBeInTheDocument();
    unmount();
    render(<ReviewStep data={{ ...EMPTY, destination: "Japan", includeFlights: false }} />);
    expect(screen.getByText("Not included")).toBeInTheDocument();
  });
});

describe("StyleStep", () => {
  it("says the style is optional and starts with nothing picked", () => {
    render(<StyleStep data={EMPTY} setData={() => {}} />);
    expect(screen.getByText(/Optional/)).toBeInTheDocument();
    for (const chip of screen.getAllByRole("button")) expect(chip).toHaveAttribute("aria-pressed", "false");
  });

  it("lets a style be picked and put back down again", () => {
    function Styles() {
      const [data, setData] = useState<WizardData>(EMPTY);
      return (
        <StyleStep
          data={data}
          setData={(patch) => setData((prev) => ({ ...prev, ...(typeof patch === "function" ? patch(prev) : patch) }))}
        />
      );
    }
    render(<Styles />);
    const first = screen.getAllByRole("button")[0];
    fireEvent.click(first);
    expect(first).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(first);
    expect(first).toHaveAttribute("aria-pressed", "false");
  });
});

describe("ReviewStep style", () => {
  it("says so when no style was picked", () => {
    render(<ReviewStep data={EMPTY} />);
    expect(screen.getByText("No preferences selected")).toBeInTheDocument();
  });
});

describe("DatesStep messages", () => {
  const TODAY = "2026-11-13";

  function Dates({ start, end }: { start: string; end: string }) {
    const [data, setData] = useState<WizardData>({ ...EMPTY, startDate: start, endDate: end });
    return (
      <DatesStep
        today={TODAY}
        data={data}
        setData={(patch) => setData((prev) => ({ ...prev, ...(typeof patch === "function" ? patch(prev) : patch) }))}
      />
    );
  }

  it("shows nothing for good dates, and stops the start before today", () => {
    render(<Dates start="2026-12-01" end="2026-12-08" />);
    expect(screen.queryByText(/can't|Choose/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Start date")).toHaveAttribute("min", TODAY);
  });

  it("says why a start in the past can't be used", () => {
    render(<Dates start="2026-11-01" end="2026-12-08" />);
    expect(screen.getByText("The start date can't be in the past.")).toBeInTheDocument();
    expect(screen.getByLabelText("Start date")).toHaveAttribute("aria-invalid", "true");
  });

  it("says why an end before the start can't be used, and clears once fixed", () => {
    render(<Dates start="2026-12-10" end="2026-12-08" />);
    expect(screen.getByText("The end date can't be before the start date.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2026-12-12" } });
    expect(screen.queryByText(/can't be before/)).not.toBeInTheDocument();
  });

  it("asks for a date that was cleared", () => {
    render(<Dates start="2026-12-10" end="2026-12-12" />);
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "" } });
    expect(screen.getByText("Choose a start date.")).toBeInTheDocument();
  });
});

describe("BudgetStep messages", () => {
  it.each([
    ["-5000", "The budget must be at least ₹5,000."],
    ["1", "The budget must be at least ₹5,000."],
    ["", "Enter your total budget."],
  ])("explains a budget of %j instead of only blocking Next", (budget, message) => {
    render(<BudgetHarness budget={budget} />);
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.getByLabelText("Total budget")).toHaveAttribute("aria-invalid", "true");
  });

  it("never previews a negative amount", () => {
    render(<BudgetHarness budget="-5000" />);
    expect(screen.queryByText("₹-5,000")).not.toBeInTheDocument();
    expect(screen.getByText("₹0")).toBeInTheDocument();
  });

  it("uses the minimum in the trip's own currency, and no rupee preview for a bad amount", () => {
    render(<BudgetHarness currency="USD" budget="60" />);
    expect(screen.getByText("The budget must be at least $61.")).toBeInTheDocument();
    expect(screen.queryByTestId("budget-inr")).not.toBeInTheDocument();
  });

  it("shows no message for a fine budget", () => {
    render(<BudgetHarness budget="150000" />);
    expect(screen.queryByText(/budget must|Enter your/)).not.toBeInTheDocument();
  });

  it("says an airport is needed while flights are included without one", () => {
    render(<BudgetHarness destination="Thailand" />);
    expect(screen.getByText("Choose the city you're flying from, or untick flights.")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: /flying from/i }), { target: { value: "BOM" } });
    expect(screen.queryByText(/Choose the city you're flying from/)).not.toBeInTheDocument();
  });
});

describe("budgetStepProblem", () => {
  it("gives the reason the budget step is blocked, budget first, then the airport", () => {
    expect(budgetStepProblem({ ...EMPTY, budget: "1", destination: "Japan" })).toBe("The budget must be at least ₹5,000.");
    expect(budgetStepProblem({ ...EMPTY, destination: "Japan" })).toBe(
      "Choose the city you're flying from, or untick flights.",
    );
    expect(budgetStepProblem({ ...EMPTY, destination: "Japan", flyingFrom: "DEL" })).toBeNull();
    expect(budgetStepProblem({ ...EMPTY, destination: "India" })).toBeNull();
  });
});

function FocusHarness({ initial = "", focus = "" }: { initial?: string; focus?: string }) {
  const [data, setData] = useState<WizardData>({ ...EMPTY, destination: initial, focus, focusMode: focus ? "place" : "anywhere" });
  return (
    <>
      <DestinationStep data={data} setData={(patch) => setData((prev) => ({ ...prev, ...(typeof patch === "function" ? patch(prev) : patch) }))} />
      <output data-testid="chosen">{data.destination}</output>
      <output data-testid="focus">{data.focus}</output>
      <output data-testid="mode">{data.focusMode}</output>
      <output data-testid="problem">{focusStepProblem(data) ?? ""}</output>
    </>
  );
}

const focusValue = () => screen.getByTestId("focus").textContent;
const modeValue = () => screen.getByTestId("mode").textContent;
const countryBox = () => screen.getByRole("combobox", { name: "Destination" });
const typeAndPick = (text: string) => {
  fireEvent.change(countryBox(), { target: { value: text } });
  fireEvent.keyDown(countryBox(), { key: "Enter" });
};
const letTripEaseChoose = () => screen.getByRole("radio", { name: /Let TripEase choose the cities/ });
const iKnowWhere = () => screen.getByRole("radio", { name: /I know where I want to go/ });
const placeBox = () => screen.queryByRole("textbox", { name: /^Where in / });
/** The message shown under the place box, if any. */
const shownError = () => document.getElementById("focus-error")?.textContent ?? null;

describe("DestinationStep: which part of the country", () => {
  it("asks only once a country is chosen, starting with 'let TripEase choose'", () => {
    render(<FocusHarness />);
    expect(screen.queryByRole("radio")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Thailand" }));
    expect(screen.getByRole("group", { name: "Which part of Thailand?" })).toBeInTheDocument();
    expect(letTripEaseChoose()).toBeChecked();
    expect(iKnowWhere()).not.toBeChecked();
    expect(placeBox()).toBeNull();
  });

  it("opens the place box when the traveller knows where, suggesting real cities", () => {
    render(<FocusHarness initial="Thailand" />);
    fireEvent.click(iKnowWhere());
    expect(modeValue()).toBe("place");
    expect(placeBox()).toHaveAttribute("placeholder", "e.g. Bangkok, Phuket");
    fireEvent.change(placeBox()!, { target: { value: "Krabi" } });
    expect(focusValue()).toBe("Krabi");
  });

  it("does not suggest the country itself for a one-city country", () => {
    render(<FocusHarness initial="Singapore" />);
    fireEvent.click(iKnowWhere());
    expect(placeBox()).toHaveAttribute("placeholder", "e.g. an area you'd like to stay in");
  });

  it("forgets the place when the traveller goes back to letting TripEase choose", () => {
    render(<FocusHarness initial="India" focus="Shimla" />);
    expect(iKnowWhere()).toBeChecked();
    fireEvent.click(letTripEaseChoose());
    expect(modeValue()).toBe("anywhere");
    expect(focusValue()).toBe("");
    expect(placeBox()).toBeNull();
  });

  it("uses the place that was typed to find the country", () => {
    render(<FocusHarness />);
    typeAndPick("goa");
    expect(chosen()).toBe("India");
    expect(focusValue()).toBe("Goa");
    expect(iKnowWhere()).toBeChecked();
    expect(placeBox()).toHaveValue("Goa");
  });

  it("does not treat another name for the country as a place", () => {
    render(<FocusHarness />);
    typeAndPick("thai");
    expect(chosen()).toBe("Thailand");
    expect(focusValue()).toBe("");
    expect(letTripEaseChoose()).toBeChecked();
  });

  it("keeps the place when the same country is chosen again, and starts over for another country", () => {
    render(<FocusHarness initial="India" focus="Shimla" />);
    typeAndPick("indi");
    expect(chosen()).toBe("India");
    expect(focusValue()).toBe("Shimla");
    expect(modeValue()).toBe("place");
    fireEvent.click(screen.getByRole("button", { name: "Thailand" }));
    expect(focusValue()).toBe("");
    expect(modeValue()).toBe("anywhere");
  });

  it("keeps 'I know where' for the same country even before a place is typed", () => {
    render(<FocusHarness initial="Thailand" />);
    fireEvent.click(iKnowWhere());
    fireEvent.click(screen.getByRole("button", { name: "Thailand" }));
    expect(modeValue()).toBe("place");
  });

  it("keeps 'I know where' while the country box is retyped, before any place is typed", () => {
    render(<FocusHarness initial="Thailand" />);
    fireEvent.click(iKnowWhere());
    fireEvent.change(countryBox(), { target: { value: "thai" } });
    expect(chosen()).toBe("");
    expect(modeValue()).toBe("place");
    fireEvent.keyDown(countryBox(), { key: "Enter" });
    expect(chosen()).toBe("Thailand");
    expect(modeValue()).toBe("place");
  });

  it("remembers which country a place was written for, after a change of country", () => {
    render(<FocusHarness initial="India" focus="Shimla" />);
    fireEvent.click(screen.getByRole("button", { name: "Thailand" }));
    fireEvent.click(iKnowWhere());
    fireEvent.change(placeBox()!, { target: { value: "Krabi" } });
    fireEvent.click(screen.getByRole("button", { name: "Thailand" }));
    expect(focusValue()).toBe("Krabi");
  });

  it("keeps the place while the country box is being retyped", () => {
    render(<FocusHarness initial="India" focus="Shimla" />);
    fireEvent.change(countryBox(), { target: { value: "indi" } });
    expect(chosen()).toBe("");
    expect(focusValue()).toBe("Shimla");
    expect(modeValue()).toBe("place");
    fireEvent.keyDown(countryBox(), { key: "Enter" });
    expect(focusValue()).toBe("Shimla");
    typeAndPick("japan");
    expect(focusValue()).toBe("");
  });

  it("says what's wrong with text that isn't a place name, straight away", () => {
    render(<FocusHarness initial="India" focus="Goa!" />);
    expect(shownError()).toMatch(/Use a place name/);
  });

  it("waits until the box is left before asking for a place, or calling one letter too short", () => {
    render(<FocusHarness initial="India" />);
    fireEvent.click(iKnowWhere());
    expect(screen.getByTestId("problem").textContent).toBe("Type the place, or let TripEase choose the cities.");
    expect(shownError()).toBeNull();
    fireEvent.blur(placeBox()!);
    expect(shownError()).toBe("Type the place, or let TripEase choose the cities.");
    fireEvent.change(placeBox()!, { target: { value: "G" } });
    expect(shownError()).toMatch(/at least 2/);
  });

  it("does not call one letter too short while it is still being typed", () => {
    render(<FocusHarness initial="India" />);
    fireEvent.click(iKnowWhere());
    fireEvent.change(placeBox()!, { target: { value: "G" } });
    expect(shownError()).toBeNull();
    fireEvent.change(placeBox()!, { target: { value: "Go" } });
    expect(shownError()).toBeNull();
  });

  it("explains how to plan a place the country list doesn't know", async () => {
    render(<FocusHarness />);
    fireEvent.change(countryBox(), { target: { value: "Rishikesh" } });
    expect(await screen.findByText(/choose the country it's in, then pick “I know where I want to go” below/)).toBeInTheDocument();
  });
});

describe("focusStepProblem", () => {
  it("asks nothing when TripEase chooses the cities", () => {
    expect(focusStepProblem({ focusMode: "anywhere", focus: "" })).toBeNull();
    expect(focusStepProblem({ focusMode: "anywhere", focus: "!!" })).toBeNull();
  });

  it("wants a place name when the traveller knows where", () => {
    expect(focusStepProblem({ focusMode: "place", focus: "" })).toBe("Type the place, or let TripEase choose the cities.");
    expect(focusStepProblem({ focusMode: "place", focus: "   " })).toBe("Type the place, or let TripEase choose the cities.");
    expect(focusStepProblem({ focusMode: "place", focus: "Goa!" })).toMatch(/place name/);
    expect(focusStepProblem({ focusMode: "place", focus: "Goa" })).toBeNull();
  });
});

describe("ReviewStep destination", () => {
  it("shows the place and its country, or just the country", () => {
    const { unmount } = render(<ReviewStep data={{ ...EMPTY, destination: "India", focusMode: "place", focus: "Goa" }} />);
    expect(screen.getByText("Goa, India")).toBeInTheDocument();
    unmount();
    render(<ReviewStep data={{ ...EMPTY, destination: "India", focus: "" }} />);
    expect(screen.getByText("India")).toBeInTheDocument();
  });
});
