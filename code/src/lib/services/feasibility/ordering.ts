import type { Place } from "@/types/place";
import { haversineKm, isValidCoordinate } from "./geo";

/**
 * Geographic ordering, so a day doesn't criss-cross a city.
 *
 * Deliberately a heuristic rather than a solver: nearest-neighbour from a
 * starting point gets most of the benefit of a real TSP for the 2–4 stops a
 * day actually has, and stays fast, predictable and easy to reason about.
 */

/** Order places by repeatedly hopping to the nearest unvisited one. */
export function nearestNeighbourOrder<T extends { location?: Place["location"] }>(
  places: T[],
  start: Place["location"],
): T[] {
  const remaining = [...places];
  const ordered: T[] = [];
  let current = isValidCoordinate(start) ? start : null;

  // Anything unmapped can't be ordered geographically; keep it in its original
  // relative position at the end rather than dropping or guessing at it.
  const unmapped = remaining.filter((p) => !isValidCoordinate(p.location));
  const mapped = remaining.filter((p) => isValidCoordinate(p.location));

  while (mapped.length > 0) {
    let bestIndex = 0;
    if (current) {
      let bestDistance = Infinity;
      mapped.forEach((candidate, index) => {
        const distance = haversineKm(current, candidate.location);
        if (distance !== null && distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      });
    }
    const [next] = mapped.splice(bestIndex, 1);
    ordered.push(next);
    current = next.location ?? current;
  }

  return [...ordered, ...unmapped];
}

/**
 * Split a city's attractions into per-day groups that hang together
 * geographically, so one day is "the old town" and another is "the coast"
 * rather than both being half of each.
 *
 * Greedy: take the furthest-out unassigned place as a seed (which keeps the
 * outlying areas from being smeared across every day), then pull in its
 * nearest neighbours until the day is full.
 */
export function clusterByDay(places: Place[], dayCount: number, perDay: number): Place[][] {
  if (dayCount <= 0) return [];
  if (places.length === 0) return Array.from({ length: dayCount }, () => []);

  const mapped = places.filter((p) => isValidCoordinate(p.location));
  const unmapped = places.filter((p) => !isValidCoordinate(p.location));

  // Without coordinates there's nothing to cluster on — deal them out in the
  // order the provider ranked them, which already reflects preferences.
  if (mapped.length === 0) {
    return dealRoundRobin(places, dayCount, perDay);
  }

  const centre = mapped.reduce(
    (acc, p) => ({ lat: acc.lat + p.location!.lat / mapped.length, lng: acc.lng + p.location!.lng / mapped.length }),
    { lat: 0, lng: 0 },
  );

  const pool = [...mapped];
  const clusters: Place[][] = [];

  // Fair shares, not greedy fills. Taking `perDay` for each day in turn leaves
  // the last days empty whenever there aren't enough places to go round —
  // which showed up as a trip with two sights on day one and none on day five.
  const share = Math.floor(mapped.length / dayCount);
  const remainder = mapped.length % dayCount;

  for (let day = 0; day < dayCount; day++) {
    const cluster: Place[] = [];
    const target = Math.min(perDay, Math.max(1, share + (day < remainder ? 1 : 0)));
    if (pool.length === 0) {
      clusters.push(cluster);
      continue;
    }

    // Seed with whatever is furthest from the city centre, so outlying places
    // anchor their own day instead of being tacked onto a central one.
    let seedIndex = 0;
    let furthest = -1;
    pool.forEach((candidate, index) => {
      const distance = haversineKm(centre, candidate.location) ?? 0;
      if (distance > furthest) {
        furthest = distance;
        seedIndex = index;
      }
    });
    const [seed] = pool.splice(seedIndex, 1);
    cluster.push(seed);

    while (cluster.length < target && pool.length > 0) {
      const anchor = cluster[cluster.length - 1].location;
      let bestIndex = 0;
      let bestDistance = Infinity;
      pool.forEach((candidate, index) => {
        const distance = haversineKm(anchor, candidate.location);
        if (distance !== null && distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      });
      cluster.push(...pool.splice(bestIndex, 1));
    }

    clusters.push(cluster);
  }

  // Spread anything left over (unmapped, or beyond what the days needed).
  const leftovers = [...pool, ...unmapped];
  leftovers.forEach((place, index) => clusters[index % clusters.length].push(place));

  return clusters;
}

function dealRoundRobin(places: Place[], dayCount: number, perDay: number): Place[][] {
  const clusters: Place[][] = Array.from({ length: dayCount }, () => []);
  places.forEach((place, index) => {
    const target = clusters[index % dayCount];
    if (target.length < perDay || index >= dayCount * perDay) target.push(place);
  });
  return clusters;
}
