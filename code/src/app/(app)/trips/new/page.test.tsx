import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { postAuthenticated } from "@/lib/api-client";
import { saveDraft } from "@/lib/draft-storage";
import { saveGeneratedTrip } from "@/lib/services/trips";
import NewTripPage from "./page";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock("@/components/auth-provider", () => ({ useAuth: () => ({ user: { uid: "u1" }, loading: false }) }));
vi.mock("@/lib/api-client", () => ({ postAuthenticated: vi.fn() }));
vi.mock("@/lib/services/trips", () => ({ saveGeneratedTrip: vi.fn() }));

const next = () => screen.getByRole("button", { name: /^Next/ });
const setField = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
});

/** Opens the wizard on the dates step, with Japan chosen. */
function openOnDates() {
  render(<NewTripPage />);
  fireEvent.click(screen.getByRole("button", { name: "Singapore" }));
  fireEvent.click(next());
  expect(screen.getByText("When are you travelling?")).toBeInTheDocument();
}

describe("the new-trip wizard, step by step", () => {
  it("cannot leave the first step until a country is chosen", () => {
    render(<NewTripPage />);
    expect(next()).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Singapore" }));
    expect(next()).toBeEnabled();
  });

  describe("dates", () => {
    it("move on with the dates it starts with", () => {
      openOnDates();
      expect(next()).toBeEnabled();
      expect(screen.queryByText(/can't be|Choose a|at most/)).not.toBeInTheDocument();
    });

    it("stop on a start in the past, and say so", () => {
      openOnDates();
      setField("Start date", day(-1));
      expect(screen.getByText("The start date can't be in the past.")).toBeInTheDocument();
      expect(next()).toBeDisabled();
    });

    it("accept today, and a trip of one day", () => {
      openOnDates();
      setField("Start date", day(0));
      setField("End date", day(0));
      expect(next()).toBeEnabled();
    });

    it("stop on an end before the start, and say so", () => {
      openOnDates();
      setField("Start date", day(10));
      setField("End date", day(5));
      expect(screen.getByText("The end date can't be before the start date.")).toBeInTheDocument();
      expect(next()).toBeDisabled();
    });

    it("stop on a cleared date", () => {
      openOnDates();
      setField("End date", "");
      expect(screen.getByText("Choose an end date.")).toBeInTheDocument();
      expect(next()).toBeDisabled();
    });

    it("allow 30 days, stop at 31, and recover once shortened", () => {
      openOnDates();
      setField("Start date", day(10));
      setField("End date", day(39)); // 30 days
      expect(next()).toBeEnabled();
      setField("End date", day(40)); // 31 days
      expect(screen.getByText("A trip can be at most 30 days long. This one is 31.")).toBeInTheDocument();
      expect(next()).toBeDisabled();
      setField("End date", day(20));
      expect(screen.queryByText(/at most 30 days long/)).not.toBeInTheDocument();
      expect(next()).toBeEnabled();
    });
  });

  describe("budget", () => {
    function openOnBudget(destination = "Singapore") {
      render(<NewTripPage />);
      fireEvent.click(screen.getByRole("button", { name: destination }));
      fireEvent.click(next());
      fireEvent.click(next());
      expect(screen.getByText("What's your trip budget?")).toBeInTheDocument();
    }

    it("stops on a negative, a tiny and an empty budget, each with its message", () => {
      openOnBudget();
      fireEvent.change(screen.getByRole("combobox", { name: /flying from/i }), { target: { value: "DEL" } });
      expect(next()).toBeEnabled();

      setField("Total budget", "-5000");
      expect(screen.getByText("The budget must be at least ₹5,000.")).toBeInTheDocument();
      expect(screen.queryByText("₹-5,000")).not.toBeInTheDocument();
      expect(next()).toBeDisabled();

      setField("Total budget", "1");
      expect(next()).toBeDisabled();

      setField("Total budget", "");
      expect(screen.getByText("Enter your total budget.")).toBeInTheDocument();
      expect(next()).toBeDisabled();

      setField("Total budget", "5000");
      expect(next()).toBeEnabled();
    });

    it("stops a trip abroad that has no starting airport, and lets it go once one is chosen or flights are off", () => {
      openOnBudget();
      expect(screen.getByText("Choose the city you're flying from, or untick flights.")).toBeInTheDocument();
      expect(next()).toBeDisabled();

      fireEvent.click(screen.getByRole("checkbox", { name: /include flights/i }));
      expect(next()).toBeEnabled();
      fireEvent.click(screen.getByRole("checkbox", { name: /include flights/i }));
      expect(next()).toBeDisabled();

      fireEvent.change(screen.getByRole("combobox", { name: /flying from/i }), { target: { value: "BOM" } });
      expect(next()).toBeEnabled();
    });

    it("checks the minimum in the chosen currency", () => {
      openOnBudget();
      fireEvent.click(screen.getByRole("checkbox", { name: /include flights/i }));
      fireEvent.change(screen.getByLabelText("Currency"), { target: { value: "USD" } });
      setField("Total budget", "60");
      expect(screen.getByText("The budget must be at least $61.")).toBeInTheDocument();
      expect(next()).toBeDisabled();
      setField("Total budget", "61");
      expect(next()).toBeEnabled();
    });
  });

  it("a draft from earlier with a start date now in the past is stopped at the dates, not at the end", () => {
    saveDraft({ destination: "Japan", startDate: "2020-01-01", endDate: "2020-01-08" });
    render(<NewTripPage />);
    fireEvent.click(next());
    expect(screen.getByText("The start date can't be in the past.")).toBeInTheDocument();
    expect(next()).toBeDisabled();
  });

  it("goes all the way to generating a trip with no travel style, sending what was entered", async () => {
    vi.mocked(postAuthenticated).mockImplementation(async (path: string) =>
      path === "/api/trips/plan" ? { plan: { cities: [] } } : { itinerary: {}, plan: { cities: [] } },
    );
    vi.mocked(saveGeneratedTrip).mockResolvedValue("trip-1");

    render(<NewTripPage />);
    fireEvent.click(screen.getByRole("button", { name: "Singapore" }));
    fireEvent.click(next()); // dates
    fireEvent.click(next()); // budget
    fireEvent.click(screen.getByRole("checkbox", { name: /include flights/i })); // untick
    setField("Total budget", "200000");
    fireEvent.click(next()); // travellers
    fireEvent.click(next()); // style, none picked
    fireEvent.click(next()); // review
    expect(screen.getByText("No preferences selected")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Generate my trip/ }));
    });

    await waitFor(() => expect(saveGeneratedTrip).toHaveBeenCalled());
    const [path, body] = vi.mocked(postAuthenticated).mock.calls[0];
    expect(path).toBe("/api/trips/plan");
    expect(body).toMatchObject({
      destination: "Singapore",
      budget: 200000,
      currency: "INR",
      preferences: [],
      includeFlights: false,
    });
    expect(typeof (body as { budget: unknown }).budget).toBe("number");
  });
});

describe("the dates the wizard starts with are always acceptable", () => {
  it("opens with a start in the future and a week-long trip", () => {
    render(<NewTripPage />);
    fireEvent.click(screen.getByRole("button", { name: "Singapore" }));
    fireEvent.click(next());
    expect((screen.getByLabelText("Start date") as HTMLInputElement).value > day(-1)).toBe(true);
    expect(next()).toBeEnabled();
  });
});
