const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Parse a `YYYY-MM-DD` string (the value an `<input type="date">` produces) as a
 * UTC calendar date. Using UTC avoids the off-by-one that local-timezone parsing
 * causes for users west of Greenwich.
 */
export function parseDateInput(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Format a `Date` back to the `YYYY-MM-DD` an `<input type="date">` expects. */
export function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Number of calendar days a trip spans, counting both endpoints: a trip that
 * starts and ends on the same day is 1 day long. Returns 0 when the range is
 * inverted so callers can treat it as invalid.
 */
export function dayCountInclusive(start: Date, end: Date): number {
  const startUtc = Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate(),
  );
  const endUtc = Date.UTC(
    end.getUTCFullYear(),
    end.getUTCMonth(),
    end.getUTCDate(),
  );
  if (endUtc < startUtc) return 0;
  return Math.round((endUtc - startUtc) / MS_PER_DAY) + 1;
}
