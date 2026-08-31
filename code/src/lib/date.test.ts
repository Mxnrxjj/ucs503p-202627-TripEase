import { describe, expect, it } from "vitest";
import { dayCountInclusive, parseDateInput, toDateInputValue } from "@/lib/date";

describe("parseDateInput / toDateInputValue", () => {
  it("round-trips a YYYY-MM-DD string", () => {
    expect(toDateInputValue(parseDateInput("2026-03-14"))).toBe("2026-03-14");
  });

  it("parses as a UTC calendar date, not local time", () => {
    const d = parseDateInput("2026-03-14");
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(2);
    expect(d.getUTCDate()).toBe(14);
    expect(d.getUTCHours()).toBe(0);
  });
});

describe("dayCountInclusive", () => {
  it("counts a single-day trip as 1", () => {
    const d = parseDateInput("2026-03-14");
    expect(dayCountInclusive(d, d)).toBe(1);
  });

  it("counts both endpoints", () => {
    expect(
      dayCountInclusive(parseDateInput("2026-03-14"), parseDateInput("2026-03-16")),
    ).toBe(3);
  });

  it("spans a month boundary correctly", () => {
    expect(
      dayCountInclusive(parseDateInput("2026-01-30"), parseDateInput("2026-02-02")),
    ).toBe(4);
  });

  it("crosses a DST transition without drifting", () => {
    // Europe/US DST changes in March; UTC math must be immune to it.
    expect(
      dayCountInclusive(parseDateInput("2026-03-07"), parseDateInput("2026-03-09")),
    ).toBe(3);
  });

  it("returns 0 for an inverted range", () => {
    expect(
      dayCountInclusive(parseDateInput("2026-03-16"), parseDateInput("2026-03-14")),
    ).toBe(0);
  });
});
