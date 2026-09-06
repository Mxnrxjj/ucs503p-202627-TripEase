import type { LatLng } from "@/types/place";

/**
 * Straight-line geography. Pure, local, and free — no provider call is ever
 * made just to work out how far apart two places are, which matters when the
 * Places quota is 100 requests a day.
 */

const EARTH_RADIUS_KM = 6371;

/**
 * Coordinates must be real numbers in range. (0, 0) is technically valid
 * ocean, but as a *place* coordinate it is almost always a provider default
 * standing in for "unknown", so it's rejected rather than trusted.
 */
export function isValidCoordinate(point: LatLng | null | undefined): point is LatLng {
  if (!point) return false;
  const { lat, lng } = point;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

/**
 * Great-circle distance in kilometres, or null when either end has no usable
 * coordinates. Null means "unknown" and callers must handle it — never
 * substitute a guessed distance.
 */
export function haversineKm(a: LatLng | null | undefined, b: LatLng | null | undefined): number | null {
  if (!isValidCoordinate(a) || !isValidCoordinate(b)) return null;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The average position of a set of points, used to anchor a city that has no
 * hotel coordinates. Derived only from coordinates we actually have — a city
 * whose places are all unmapped stays null rather than getting a made-up centre.
 */
export function centroid(points: (LatLng | null | undefined)[]): LatLng | null {
  const valid = points.filter(isValidCoordinate);
  if (valid.length === 0) return null;
  const sum = valid.reduce((acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }), { lat: 0, lng: 0 });
  return { lat: sum.lat / valid.length, lng: sum.lng / valid.length };
}
