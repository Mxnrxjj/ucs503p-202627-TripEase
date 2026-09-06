import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LeafletMap from "@/components/maps/leaflet-map";
import type { MapPoint } from "@/lib/services/map-points";

/**
 * Wheel behaviour and marker semantics.
 *
 * Leaflet does render in jsdom, so these drive the real component rather than
 * a stand-in. Nothing here asserts anything about tiles or projection — only
 * about the rules this app adds on top: who gets the wheel event, and what a
 * screen reader is told about a marker.
 */

function point(overrides: Partial<MapPoint> & { id: string }): MapPoint {
  return {
    kind: "activity",
    name: "Wat Arun",
    location: { lat: 13.7437, lng: 100.4889 },
    cityId: "city-a",
    cityName: "Bangkok",
    dayId: "day-1",
    dayNumber: 1,
    category: "culture",
    estimatedCost: 200,
    currency: "INR",
    verification: "live",
    order: 2,
    time: "10:00",
    durationMinutes: 90,
    rating: null,
    priceIsEstimate: true,
    address: null,
    referenceUrl: null,
    sourceName: null,
    ...overrides,
  };
}

function renderMap(overrides: Partial<React.ComponentProps<typeof LeafletMap>> = {}) {
  const onSelect = vi.fn();
  const utils = render(
    <div style={{ width: 600, height: 400 }}>
      <LeafletMap
        points={[point({ id: "a1" })]}
        routePoints={[]}
        selectedId={null}
        onSelect={onSelect}
        fitKey="all::"
        {...overrides}
      />
    </div>,
  );
  const container = utils.container.querySelector(".leaflet-container") as HTMLElement;
  return { ...utils, container, onSelect };
}

/** A wheel event that reports whether anything called preventDefault. */
function wheel(target: HTMLElement, init: WheelEventInit): boolean {
  const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("wheel over the map", () => {
  it("lets the page keep scrolling when Ctrl isn't held", () => {
    const { container } = renderMap();
    // Not cancelled means the browser scrolls the page as it normally would —
    // the map must never trap the reader halfway down the page.
    expect(wheel(container, { deltaY: 120 })).toBe(false);
  });

  it("takes the wheel for itself only when Ctrl is held", () => {
    const { container } = renderMap();
    expect(wheel(container, { deltaY: -120, ctrlKey: true })).toBe(true);
  });

  it("also accepts Cmd, for the Mac gesture", () => {
    const { container } = renderMap();
    expect(wheel(container, { deltaY: -120, metaKey: true })).toBe(true);
  });

  it("explains how to zoom when the wheel goes to the page", async () => {
    const { container } = renderMap();
    expect(screen.getByText(/Use Ctrl \+ scroll to zoom/)).toBeInTheDocument();

    wheel(container, { deltaY: 120 });
    await waitFor(() =>
      expect(screen.getByText(/Use Ctrl \+ scroll to zoom/).parentElement).toHaveClass("opacity-100"),
    );
  });

  it("says nothing when the traveller already knows to hold Ctrl", () => {
    const { container } = renderMap();
    wheel(container, { deltaY: 120, ctrlKey: true });
    expect(screen.getByText(/Use Ctrl \+ scroll to zoom/).parentElement).toHaveClass("opacity-0");
  });

  it("gets out of the way on its own", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { container } = renderMap();

    wheel(container, { deltaY: 120 });
    await waitFor(() =>
      expect(screen.getByText(/Use Ctrl \+ scroll to zoom/).parentElement).toHaveClass("opacity-100"),
    );

    vi.advanceTimersByTime(2000);
    await waitFor(() =>
      expect(screen.getByText(/Use Ctrl \+ scroll to zoom/).parentElement).toHaveClass("opacity-0"),
    );
  });

  it("keeps the hint out of the accessibility tree, since only a mouse can trigger it", () => {
    renderMap();
    const hint = screen.getByText(/Use Ctrl \+ scroll to zoom/).parentElement!;
    expect(hint).toHaveAttribute("aria-hidden", "true");
    expect(hint.className).toContain("pointer-events-none");
  });

  it("stops listening once the map is gone", () => {
    const { container, unmount } = renderMap();
    unmount();
    // The container is detached; dispatching must not throw or be handled.
    expect(wheel(container, { deltaY: -120, ctrlKey: true })).toBe(false);
  });
});

const MARKER_NAME = "Wat Arun — day 1, Bangkok";

describe("marker semantics", () => {
  it("gives every marker a name a screen reader can read", async () => {
    renderMap();
    expect(await screen.findByRole("button", { name: MARKER_NAME })).toBeInTheDocument();
  });

  it("names a hotel by its city rather than a day it doesn't have", async () => {
    renderMap({
      points: [
        point({ id: "hotel:city-a", kind: "hotel", name: "Riverside Hotel", dayNumber: null, dayId: null }),
      ],
    });
    expect(await screen.findByRole("button", { name: "Riverside Hotel — Bangkok" })).toBeInTheDocument();
  });

  it("reports which marker is selected", async () => {
    renderMap({ selectedId: "a1" });
    // Exact name, because the open card contributes a "Close Wat Arun" button.
    const marker = await screen.findByRole("button", { name: MARKER_NAME });
    expect(marker).toHaveAttribute("aria-pressed", "true");
  });

  it("opens the detail card for the selected marker", async () => {
    renderMap({ selectedId: "a1" });
    expect(await screen.findByRole("button", { name: "View activity" })).toBeInTheDocument();
    expect(screen.getByText("Day 1 · 10:00")).toBeInTheDocument();
  });

  it("reports an unselected marker as unpressed", async () => {
    renderMap();
    const marker = await screen.findByRole("button", { name: MARKER_NAME });
    expect(marker).toHaveAttribute("aria-pressed", "false");
  });

  it("can be reached by keyboard", async () => {
    renderMap();
    const marker = await screen.findByRole("button", { name: MARKER_NAME });
    expect(marker.tabIndex).toBe(0);
  });

  it("selects on Space, which a button role implies", async () => {
    const { onSelect } = renderMap();
    const marker = await screen.findByRole("button", { name: MARKER_NAME });
    marker.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
    expect(onSelect).toHaveBeenCalledWith("a1");
  });
});
