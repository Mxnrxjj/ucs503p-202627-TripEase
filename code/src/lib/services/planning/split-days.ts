/**
 * Split a trip's days across cities by relative weight, guaranteeing every
 * city gets at least one day and that the parts sum exactly to the whole.
 * Shared by the fallback planner and the itinerary generator so there's one
 * definition of "these days add up".
 */
export function splitDaysAcrossCities(dayCount: number, weights: number[]): number[] {
  if (weights.length === 0) return [];

  const totalWeight = weights.reduce((a, b) => a + b, 0) || weights.length;
  const raw = weights.map((w) => (w / totalWeight) * dayCount);
  const floors = raw.map((r) => Math.max(1, Math.floor(r)));

  let assigned = floors.reduce((a, b) => a + b, 0);

  // Hand out any leftover days to whoever was rounded down hardest.
  const fractional = raw.map((r, i) => ({ i, frac: r - Math.floor(r) }));
  fractional.sort((a, b) => b.frac - a.frac);
  let idx = 0;
  while (assigned < dayCount) {
    floors[fractional[idx % fractional.length].i] += 1;
    assigned += 1;
    idx += 1;
  }

  // Rounding up to a one-day minimum can overshoot on short trips with many
  // cities; take those days back off the largest allocations.
  while (assigned > dayCount) {
    const maxIdx = floors.indexOf(Math.max(...floors));
    if (floors[maxIdx] <= 1) break;
    floors[maxIdx] -= 1;
    assigned -= 1;
  }

  return floors;
}
