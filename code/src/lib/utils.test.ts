import { describe, expect, it } from "vitest";
import {
  addDaysIso,
  cn,
  formatDateLong,
  formatDateShort,
  formatDurationShort,
  formatMoney,
} from "@/lib/utils";

describe("cn", () => {
  it("joins class names and skips falsy values", () => {
    expect(cn("a", false, undefined, null, "b")).toBe("a b");
  });

  it("lets the later Tailwind class win when two conflict", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});

describe("formatMoney", () => {
  it("uses the rupee symbol and INR by default", () => {
    expect(formatMoney(500)).toBe("₹500");
  });

  it("uses the symbol for each supported currency", () => {
    expect(formatMoney(1500, "INR")).toBe("₹1,500");
    expect(formatMoney(1500, "USD")).toBe("$1,500");
    expect(formatMoney(1500, "EUR")).toBe("€1,500");
    expect(formatMoney(1500, "GBP")).toBe("£1,500");
  });

  it("groups digits the Indian way (lakhs and crores)", () => {
    expect(formatMoney(100000)).toBe("₹1,00,000");
    expect(formatMoney(1234567)).toBe("₹12,34,567");
  });

  it("rounds to the nearest whole unit", () => {
    expect(formatMoney(1234.4)).toBe("₹1,234");
    expect(formatMoney(1234.5)).toBe("₹1,235");
  });

  it("formats zero", () => {
    expect(formatMoney(0)).toBe("₹0");
  });

  it("falls back to the currency code for an unknown currency", () => {
    expect(formatMoney(500, "CHF")).toBe("CHF 500");
  });
});

describe("formatDurationShort", () => {
  it("shows only minutes below one hour", () => {
    expect(formatDurationShort(45)).toBe("45m");
  });

  it("shows only hours when the minutes are zero", () => {
    expect(formatDurationShort(60)).toBe("1h");
    expect(formatDurationShort(180)).toBe("3h");
  });

  it("shows hours and minutes together", () => {
    expect(formatDurationShort(200)).toBe("3h 20m");
    expect(formatDurationShort(61)).toBe("1h 1m");
  });

  it("formats zero minutes", () => {
    expect(formatDurationShort(0)).toBe("0m");
  });

  it("rounds fractional minutes", () => {
    expect(formatDurationShort(44.6)).toBe("45m");
    expect(formatDurationShort(59.6)).toBe("1h");
  });

  it("treats a negative duration as zero", () => {
    expect(formatDurationShort(-30)).toBe("0m");
  });
});

describe("formatDateShort", () => {
  it("formats as short month and day", () => {
    expect(formatDateShort("2026-03-14")).toBe("Mar 14");
  });

  it("does not add a leading zero to the day", () => {
    expect(formatDateShort("2026-03-05")).toBe("Mar 5");
  });

  it("shows the same calendar day whatever the local time zone is", () => {
    expect(formatDateShort("2026-01-01")).toBe("Jan 1");
    expect(formatDateShort("2026-12-31")).toBe("Dec 31");
  });
});

describe("formatDateLong", () => {
  it("includes the weekday, month and day", () => {
    expect(formatDateLong("2026-03-14")).toBe("Saturday, March 14");
  });

  it("gets the weekday right across a month boundary", () => {
    expect(formatDateLong("2026-04-01")).toBe("Wednesday, April 1");
  });
});

describe("addDaysIso", () => {
  it("returns the same date when adding zero days", () => {
    expect(addDaysIso("2026-03-14", 0)).toBe("2026-03-14");
  });

  it("adds days inside a month", () => {
    expect(addDaysIso("2026-03-14", 1)).toBe("2026-03-15");
    expect(addDaysIso("2026-03-14", 10)).toBe("2026-03-24");
  });

  it("rolls over a month boundary", () => {
    expect(addDaysIso("2026-03-31", 1)).toBe("2026-04-01");
  });

  it("rolls over a year boundary", () => {
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("handles 29 February in a leap year and not in a normal year", () => {
    expect(addDaysIso("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDaysIso("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("subtracts days when the number is negative", () => {
    expect(addDaysIso("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("adds a long span, like the length of a trip", () => {
    expect(addDaysIso("2026-03-14", 365)).toBe("2027-03-14");
  });
});
