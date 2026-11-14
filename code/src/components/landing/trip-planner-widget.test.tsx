import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TripPlannerWidget } from "@/components/landing/trip-planner-widget";
import { readDraft } from "@/lib/draft-storage";

const push = vi.fn();
const TODAY = "2026-11-13";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

const country = () => screen.getByRole("combobox", { name: "Where to?" });
const submit = () => screen.getByRole("button", { name: /Build my itinerary|Taking you there/ });

beforeEach(() => {
  push.mockReset();
  window.sessionStorage.clear();
});

describe("TripPlannerWidget", () => {
  it("says a country is needed when submitted without one, and goes nowhere", () => {
    render(<TripPlannerWidget today={TODAY} />);
    expect(submit()).toBeEnabled();
    expect(screen.queryByText("Choose a country to start.")).not.toBeInTheDocument();

    fireEvent.click(submit());
    expect(screen.getByText("Choose a country to start.")).toBeInTheDocument();
    expect(country()).toHaveFocus();
    expect(readDraft()).toBeNull();
    expect(push).not.toHaveBeenCalled();

    fireEvent.change(country(), { target: { value: "japan" } });
    expect(screen.queryByText("Choose a country to start.")).not.toBeInTheDocument();
  });

  it("keeps the chosen country, dates and budget for after sign-up, and goes there", () => {
    render(<TripPlannerWidget />);
    fireEvent.change(country(), { target: { value: "Japan" } });
    fireEvent.change(screen.getByLabelText("Budget (₹)"), { target: { value: "220000" } });
    fireEvent.click(submit());

    expect(readDraft()).toMatchObject({ destination: "Japan", budget: 220000, currency: "INR" });
    expect(push).toHaveBeenCalledWith("/sign-up");
  });

  it("does not save or move on without a country, even if the form is submitted", () => {
    render(<TripPlannerWidget />);
    fireEvent.submit(country().closest("form")!);
    expect(readDraft()).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it("says when the trip ends before it starts, and saves nothing", () => {
    render(<TripPlannerWidget today={TODAY} />);
    fireEvent.change(country(), { target: { value: "Japan" } });
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2027-01-10" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2027-01-05" } });
    fireEvent.click(submit());
    expect(screen.getByText("The end date can't be before the start date.")).toBeInTheDocument();
    expect(screen.getByLabelText("To")).toHaveFocus();
    expect(readDraft()).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it("says when the trip is longer than 30 days", () => {
    render(<TripPlannerWidget today={TODAY} />);
    fireEvent.change(country(), { target: { value: "Japan" } });
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2027-01-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2027-01-31" } });
    fireEvent.click(submit());
    expect(screen.getByText("A trip can be at most 30 days long. This one is 31.")).toBeInTheDocument();
    expect(readDraft()).toBeNull();

    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2027-01-30" } });
    fireEvent.click(submit());
    expect(push).toHaveBeenCalledWith("/sign-up");
  });

  it("says when the trip starts in the past", () => {
    render(<TripPlannerWidget today={TODAY} />);
    fireEvent.change(country(), { target: { value: "Japan" } });
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-11-12" } });
    fireEvent.click(submit());
    expect(screen.getByText("The start date can't be in the past.")).toBeInTheDocument();
    expect(readDraft()).toBeNull();
  });

  it.each([
    ["", "Enter your total budget."],
    ["-5000", "The budget must be at least ₹5,000."],
    ["1", "The budget must be at least ₹5,000."],
  ])("refuses a budget of %j with a message instead of quietly replacing it", (budget, message) => {
    render(<TripPlannerWidget today={TODAY} />);
    fireEvent.change(country(), { target: { value: "Japan" } });
    fireEvent.change(screen.getByLabelText("Budget (₹)"), { target: { value: budget } });
    fireEvent.click(submit());
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.getByLabelText("Budget (₹)")).toHaveAttribute("aria-invalid", "true");
    expect(readDraft()).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it("keeps a fresh form free of error messages", () => {
    render(<TripPlannerWidget today={TODAY} />);
    fireEvent.change(screen.getByLabelText("Budget (₹)"), { target: { value: "1" } });
    expect(screen.queryByText(/at least/)).not.toBeInTheDocument();
  });

  it("saves the draft as a supported country, never as the typed text", () => {
    render(<TripPlannerWidget />);
    fireEvent.change(country(), { target: { value: "ThAiLaNd" } });
    fireEvent.click(submit());
    expect(readDraft()?.destination).toBe("Thailand");
  });
});

describe("TripPlannerWidget: a place typed to find the country", () => {
  it("goes on to the wizard with the country", () => {
    render(<TripPlannerWidget today={TODAY} />);
    fireEvent.focus(country());
    fireEvent.change(country(), { target: { value: "goa" } });
    fireEvent.keyDown(country(), { key: "Enter" });
    fireEvent.click(submit());
    expect(readDraft()).toMatchObject({ destination: "India", focus: "Goa" });
  });

  it("is left out when the country was typed by name", () => {
    render(<TripPlannerWidget today={TODAY} />);
    fireEvent.change(country(), { target: { value: "Japan" } });
    fireEvent.click(submit());
    expect(readDraft()).not.toHaveProperty("focus");
  });

  it("is kept when the same country is found again by typing", () => {
    render(<TripPlannerWidget today={TODAY} />);
    fireEvent.focus(country());
    fireEvent.change(country(), { target: { value: "goa" } });
    fireEvent.keyDown(country(), { key: "Enter" });
    fireEvent.change(country(), { target: { value: "indi" } });
    fireEvent.keyDown(country(), { key: "Enter" });
    fireEvent.click(submit());
    expect(readDraft()).toMatchObject({ destination: "India", focus: "Goa" });
  });

  it("is dropped when a different country is chosen afterwards", () => {
    render(<TripPlannerWidget today={TODAY} />);
    fireEvent.focus(country());
    fireEvent.change(country(), { target: { value: "goa" } });
    fireEvent.keyDown(country(), { key: "Enter" });
    fireEvent.change(country(), { target: { value: "Japan" } });
    fireEvent.click(submit());
    expect(readDraft()).toMatchObject({ destination: "Japan" });
    expect(readDraft()).not.toHaveProperty("focus");
  });
});
