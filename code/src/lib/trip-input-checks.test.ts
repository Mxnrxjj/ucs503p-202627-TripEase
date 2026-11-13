import { afterEach, describe, expect, it } from "vitest";
import { toInr } from "@/lib/fx";
import {
  MAX_BUDGET,
  MAX_TRIP_DAYS,
  MIN_BUDGET_INR,
  budgetProblem,
  dateProblems,
  datesAreValid,
  isRealDay,
  minBudgetIn,
  todayInputValue,
  tripLengthProblem,
} from "@/lib/trip-input-checks";

describe("minBudgetIn", () => {
  it.each(["INR", "USD", "EUR", "GBP"])("is the smallest whole %s amount worth the rupee minimum", (currency) => {
    const min = minBudgetIn(currency);
    expect(Number.isInteger(min)).toBe(true);
    expect(toInr(min, currency)).toBeGreaterThanOrEqual(MIN_BUDGET_INR);
    expect(toInr(min - 1, currency)).toBeLessThan(MIN_BUDGET_INR);
  });

  it("does not stop at a rounded figure that is just short ($60 is ₹4,980)", () => {
    expect(minBudgetIn("USD")).toBe(61);
  });
});

describe("budgetProblem", () => {
  it.each([
    ["", "INR", "Enter your total budget."],
    ["   ", "INR", "Enter your total budget."],
    ["abc", "INR", "Enter the budget as a number."],
    ["-5000", "INR", "The budget must be at least ₹5,000."],
    ["0", "INR", "The budget must be at least ₹5,000."],
    ["1", "INR", "The budget must be at least ₹5,000."],
    ["4999", "INR", "The budget must be at least ₹5,000."],
    ["60", "USD", "The budget must be at least $61."],
    [String(MAX_BUDGET + 1), "INR", "The budget can be at most ₹10,00,00,000."],
  ])("refuses %j %s", (budget, currency, message) => {
    expect(budgetProblem(budget, currency)).toBe(message);
  });

  it.each([
    ["5000", "INR"],
    ["150000", "INR"],
    ["1e5", "INR"],
    ["61", "USD"],
    [String(MAX_BUDGET), "INR"],
  ])("accepts %j %s", (budget, currency) => {
    expect(budgetProblem(budget, currency)).toBeNull();
  });

  it("checks numbers the same way as field text", () => {
    expect(budgetProblem(4999, "INR")).toBe(budgetProblem("4999", "INR"));
    expect(budgetProblem(Number.NaN, "INR")).toBe("Enter the budget as a number.");
    expect(budgetProblem(5000, "INR")).toBeNull();
  });
});

describe("todayInputValue", () => {
  const original = process.env.TZ;
  afterEach(() => {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  });

  it("uses the local calendar day, not the UTC one", () => {
    // Built from local parts, so this is 11:30 pm on 13 Nov wherever the test runs.
    expect(todayInputValue(new Date(2026, 10, 13, 23, 30))).toBe("2026-11-13");
    expect(todayInputValue(new Date(2027, 0, 5, 0, 5))).toBe("2027-01-05");
  });

  // The same instant is a different day in different places. UTC is already the
  // 14th while it is still the evening of the 13th in the Americas, which is
  // where today's date would wrongly be called "in the past".
  it.each([
    ["America/Los_Angeles", "2026-11-14T05:30:00Z", "2026-11-13"],
    ["Pacific/Pago_Pago", "2026-11-14T08:00:00Z", "2026-11-13"],
    ["Asia/Kolkata", "2026-11-13T20:00:00Z", "2026-11-14"],
    ["Pacific/Kiritimati", "2026-11-13T12:00:00Z", "2026-11-14"],
    ["UTC", "2026-11-13T23:59:00Z", "2026-11-13"],
  ])("in %s at %s it is %s", (zone, instant, expected) => {
    process.env.TZ = zone;
    expect(todayInputValue(new Date(instant))).toBe(expected);
  });
});

describe("isRealDay", () => {
  it.each(["2027-02-28", "2028-02-29", "2026-12-31"])("accepts %s", (day) => expect(isRealDay(day)).toBe(true));
  it.each(["2027-02-29", "2027-02-30", "2027-13-01", "2027-00-10", "2027-1-1", "", "soon", "2027-03-01T00:00"])(
    "refuses %j",
    (day) => expect(isRealDay(day)).toBe(false),
  );
});

describe("tripLengthProblem", () => {
  it(`allows up to ${MAX_TRIP_DAYS} days, counting both ends`, () => {
    expect(tripLengthProblem("2027-03-01", "2027-03-01")).toBeNull();
    expect(tripLengthProblem("2027-03-01", "2027-03-30")).toBeNull();
  });

  it("refuses one day more, and says how long it is", () => {
    expect(tripLengthProblem("2027-03-01", "2027-03-31")).toBe("A trip can be at most 30 days long. This one is 31.");
  });

  it("counts a leap February properly", () => {
    expect(tripLengthProblem("2028-02-01", "2028-03-01")).toBeNull(); // 30 days
    expect(tripLengthProblem("2028-02-01", "2028-03-02")).not.toBeNull(); // 31 days
    expect(tripLengthProblem("2027-02-01", "2027-03-02")).toBeNull(); // 30 days: February has 28
    expect(tripLengthProblem("2027-02-01", "2027-03-03")).not.toBeNull(); // 31 days
  });

  it("is not thrown by a silly year", () => {
    expect(tripLengthProblem("2027-03-01", "9999-12-31")).toMatch(/at most 30 days/);
  });

  it("stays quiet about ranges that have a different problem", () => {
    expect(tripLengthProblem("", "2027-03-31")).toBeNull();
    expect(tripLengthProblem("2027-03-01", "")).toBeNull();
    expect(tripLengthProblem("2027-02-30", "2027-06-01")).toBeNull();
    expect(tripLengthProblem("2027-06-01", "2027-03-01")).toBeNull();
  });
});

describe("dateProblems", () => {
  const today = "2026-11-13";

  it("accepts a trip from today, and a one-day trip", () => {
    expect(dateProblems("2026-11-13", "2026-11-13", today)).toEqual({});
    expect(datesAreValid("2026-11-13", "2026-11-20", today)).toBe(true);
  });

  it("asks for missing or impossible dates", () => {
    expect(dateProblems("", "", today)).toEqual({ start: "Choose a start date.", end: "Choose an end date." });
    expect(dateProblems("2027-02-30", "2027-03-02", today).start).toBe("Choose a start date.");
    expect(dateProblems("2027-03-01", "soon", today).end).toBe("Choose an end date.");
  });

  it("refuses a start in the past", () => {
    expect(dateProblems("2026-11-12", "2026-11-20", today)).toEqual({ start: "The start date can't be in the past." });
    expect(datesAreValid("2026-11-12", "2026-11-20", today)).toBe(false);
  });

  it("refuses an end before the start", () => {
    expect(dateProblems("2026-12-10", "2026-12-09", today)).toEqual({
      end: "The end date can't be before the start date.",
    });
  });

  it("does not blame the end date when only the start is missing", () => {
    expect(dateProblems("", "2026-12-09", today)).toEqual({ start: "Choose a start date." });
  });

  it("blames the end date for a trip that is too long, once the start is sound", () => {
    expect(dateProblems("2026-12-01", "2027-01-15", today)).toEqual({
      end: "A trip can be at most 30 days long. This one is 46.",
    });
  });

  it("reports a start in the past and a trip that is too long together, each on its own field", () => {
    expect(dateProblems("2026-11-01", "2027-03-01", today)).toEqual({
      start: "The start date can't be in the past.",
      end: "A trip can be at most 30 days long. This one is 121.",
    });
  });
});
