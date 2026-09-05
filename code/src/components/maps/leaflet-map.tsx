"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import { ACTIVITY_CATEGORY_ICON } from "@/types/itinerary";
import { formatMoney } from "@/lib/utils";
import type { MapPoint } from "@/lib/services/map-points";

/**
 * The real map. Loaded only on the client (see `trip-map.tsx`, which
 * `dynamic()`-imports this with `ssr: false`) because Leaflet touches
 * `window` at module scope.
 *
 * Tiles come from OpenStreetMap, which needs no API key — that's deliberate:
 * the map has to keep working in mock mode, where there are no credentials
 * of any kind. Attribution is required by the tile providers' terms and is
 * rendered by Leaflet in the corner.
 */

/**
 * OpenStreetMap's standard tiles: genuinely keyless, unlike CARTO's basemaps,
 * which now return an "API KEY REQUIRED" watermark. There's no official dark
 * variant, so dark mode inverts the light tiles in CSS (see `dark-tiles`
 * below) rather than pulling in a second, key-gated provider.
 *
 * OSM's tile usage policy expects light, attributed use — fine for this app's
 * scale. A production deployment with real traffic should move to a paid tile
 * host (and only the two constants here would change).
 */
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribeToColorScheme(onChange: () => void): () => void {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** The OS colour scheme is external state, so it's read through the store API
 *  rather than mirrored into React state inside an effect. */
function useIsDark(): boolean {
  return useSyncExternalStore(
    subscribeToColorScheme,
    () => window.matchMedia(DARK_QUERY).matches,
    () => false,
  );
}

/**
 * Custom `divIcon` markers rather than Leaflet's default image pins: the
 * default icons need bundler-specific asset wiring to load at all, and these
 * carry more information anyway (order number, category, selected state).
 */
/** Marker HTML is built as a string, so anything interpolated into it — place
 *  names come from providers and from what travellers type — must be escaped. */
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function markerIcon(point: MapPoint, selected: boolean): L.DivIcon {
  const label =
    point.kind === "hotel" ? "🏨" : point.order !== null ? String(point.order) : ACTIVITY_CATEGORY_ICON[point.category ?? "sightseeing"];
  const base =
    "display:flex;align-items:center;justify-content:center;border-radius:9999px;font-weight:700;" +
    "font-family:ui-sans-serif,system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.25);border:2px solid #fff;";
  const style = selected
    ? `${base}width:34px;height:34px;background:#c2410c;color:#fff;font-size:14px;`
    : `${base}width:26px;height:26px;background:#ea580c;color:#fff;font-size:12px;`;
  const size = selected ? 34 : 26;
  const description = escapeHtml(
    point.dayNumber !== null ? `${point.name} — day ${point.dayNumber}, ${point.cityName}` : `${point.name} — ${point.cityName}`,
  );

  return L.divIcon({
    className: "tripease-marker",
    // Leaflet's `alt` only applies to image icons, so the accessible name for
    // a divIcon has to be set here. Markers are keyboard-focusable by default.
    html: `<div style="${style}" role="img" title="${description}" aria-label="${description}">${label}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

/**
 * Keeps the viewport fitted to whatever is currently filtered in.
 *
 * Leaflet measures its container once at mount and caches that size. This map
 * lives in a sticky column that can still be laid out (or hidden entirely on
 * mobile) at that moment, so it can easily mount at 0×0 — in which case
 * `fitBounds` computes a nonsense zoom. The ResizeObserver both re-measures
 * and re-fits once the container actually has a size, which is what makes the
 * map correct on first paint rather than only after a manual pan.
 */
function AutoViewport({
  points,
  selectedId,
  fitKey,
}: {
  points: MapPoint[];
  selectedId: string | null;
  /** Changes when the traveller switches filter — an explicit request to refit. */
  fitKey: string;
}) {
  const map = useMap();
  // Lets the resize observer below read the current selection without
  // re-subscribing every time that selection changes.
  const selectedRef = useRef(selectedId);
  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  const fit = useCallback(() => {
    if (points.length === 0) return;
    const size = map.getSize();
    if (size.x === 0 || size.y === 0) return;
    const bounds = L.latLngBounds(points.map((p) => [p.location.lat, p.location.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14, animate: false });
  }, [map, points]);

  useEffect(() => {
    // While something is selected, leave the viewport alone — refitting would
    // fight with the centring below every time the selection changes.
    if (selectedId) return;
    fit();
  }, [fit, selectedId]);

  // Switching filter is an explicit "show me this set" request, so it refits
  // even with a marker selected — otherwise the map would stay zoomed in on
  // the old selection while the marker set underneath it had changed.
  useEffect(() => {
    fit();
    // `fit` is intentionally not a dependency: this must run on filter changes
    // only, not every time the points array is rebuilt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  useEffect(() => {
    const observer = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
      if (!selectedRef.current) fit();
    });
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map, fit]);

  return null;
}

/**
 * Centres on the selected point, wherever the selection came from.
 *
 * Deliberately not animated: Leaflet's animated moves (`flyTo`) drive
 * themselves with `requestAnimationFrame`, which browsers throttle in
 * backgrounded or occluded tabs — the animation then never advances and the
 * map silently stays put. Centring is core to the roadmap↔map link, so it
 * uses the deterministic path instead of a prettier one that can no-op.
 */
function FocusSelected({ points, selectedId }: { points: MapPoint[]; selectedId: string | null }) {
  const map = useMap();
  const pointsRef = useRef(points);
  useEffect(() => {
    pointsRef.current = points;
  }, [points]);

  useEffect(() => {
    if (!selectedId) return;
    const point = pointsRef.current.find((p) => p.id === selectedId);
    if (!point) return;
    map.setView([point.location.lat, point.location.lng], Math.max(map.getZoom(), 14), { animate: false });
    // Depends on the selection only, deliberately: re-centring whenever the
    // points array was rebuilt would undo the refit that a filter change just
    // performed, leaving the map zoomed in on a stale selection.
  }, [map, selectedId]);

  return null;
}

export default function LeafletMap({
  points,
  routePoints,
  selectedId,
  onSelect,
  fitKey,
}: {
  points: MapPoint[];
  routePoints: MapPoint[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  fitKey: string;
}) {
  const dark = useIsDark();

  const center = useMemo<[number, number]>(() => {
    if (points.length === 0) return [13.7563, 100.5018];
    return [points[0].location.lat, points[0].location.lng];
  }, [points]);

  const routeLine = useMemo(
    () => routePoints.map((p) => [p.location.lat, p.location.lng] as [number, number]),
    [routePoints],
  );

  return (
    <MapContainer
      center={center}
      zoom={12}
      // Page-scroll stays with the page; the zoom control handles zooming.
      scrollWheelZoom={false}
      className={`h-full w-full rounded-2xl ${dark ? "tripease-map-dark" : ""}`}
      style={{ background: dark ? "#18181b" : "#f4f4f5" }}
    >
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />

      {routeLine.length > 1 ? (
        <Polyline positions={routeLine} pathOptions={{ color: "#ea580c", weight: 3, opacity: 0.6, dashArray: "6 8" }} />
      ) : null}

      {points.map((point) => (
        <Marker
          key={point.id}
          position={[point.location.lat, point.location.lng]}
          icon={markerIcon(point, point.id === selectedId)}
          eventHandlers={{ click: () => onSelect(point.id) }}
        >
          <Popup>
            <span className="block text-sm font-semibold text-zinc-900">{point.name}</span>
            <span className="block text-xs text-zinc-600">
              {point.cityName}
              {point.dayNumber !== null ? ` · Day ${point.dayNumber}` : " · Hotel"}
              {point.category ? ` · ${point.category}` : ""}
            </span>
            {point.estimatedCost !== null && point.estimatedCost > 0 ? (
              <span className="block text-xs text-zinc-600">
                {formatMoney(point.estimatedCost, point.currency)}
                {point.kind === "hotel" ? " / night" : ""} (est.)
              </span>
            ) : null}
            <span className="mt-1 block text-[11px] uppercase tracking-wide text-zinc-400">
              {point.verification === "live"
                ? "Live place data"
                : point.verification === "cited"
                  ? "Cited source"
                  : "Demo data"}
            </span>
          </Popup>
        </Marker>
      ))}

      <AutoViewport points={points} selectedId={selectedId} fitKey={fitKey} />
      <FocusSelected points={points} selectedId={selectedId} />
    </MapContainer>
  );
}
