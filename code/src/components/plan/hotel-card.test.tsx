import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { HotelCard } from "@/components/plan/hotel-card";
import { buildThailandTrip } from "@/test-support/trip-fixture";
import { formatMoney } from "@/lib/utils";
import type { City } from "@/types/itinerary";

let base: City;

beforeAll(async () => {
  const trip = await buildThailandTrip();
  base = trip.cities[0];
});

const withNights = (nights: number, dayCount = 3): City => ({ ...base, dayCount, hotel: { ...base.hotel, nights } });

describe("HotelCard", () => {
  it("says there is no overnight stay, and offers nothing to edit, when the city has no nights", () => {
    render(<HotelCard city={withNights(0, 1)} currency="INR" travelers={1} onEdit={vi.fn()} />);
    expect(screen.getByText(`No overnight stay in ${base.name}.`)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("writes one night in the singular", () => {
    render(<HotelCard city={withNights(1)} currency="INR" travelers={1} onEdit={vi.fn()} />);
    expect(screen.getByRole("button").textContent).toContain("· 1 night ·");
  });

  it("writes several nights in the plural", () => {
    render(<HotelCard city={withNights(2)} currency="INR" travelers={1} onEdit={vi.fn()} />);
    expect(screen.getByRole("button").textContent).toContain("· 2 nights ·");
  });

  it("will not save more nights than the city has days, and says why", () => {
    const onEdit = vi.fn();
    render(<HotelCard city={withNights(2, 3)} currency="INR" travelers={1} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`Edit hotel in ${base.name}`) }));
    fireEvent.change(screen.getByLabelText("Nights"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(screen.getByRole("alert").textContent).toBe("This city has 3 days, so it can have at most 3 nights.");
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("saves a number of nights within the city's days", () => {
    const onEdit = vi.fn();
    render(<HotelCard city={withNights(2, 3)} currency="INR" travelers={1} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`Edit hotel in ${base.name}`) }));
    fireEvent.change(screen.getByLabelText("Nights"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ nights: 3 }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("prices one room for one or two people", () => {
    for (const travelers of [1, 2]) {
      const { unmount } = render(<HotelCard city={withNights(2)} currency="INR" travelers={travelers} onEdit={vi.fn()} />);
      const text = screen.getByRole("button").textContent ?? "";
      expect(text).not.toMatch(/rooms?\b/);
      expect(text).toContain(formatMoney(base.hotel.pricePerNight * 2, "INR"));
      unmount();
    }
  });

  it("books a room for every two people, and totals all of them", () => {
    render(<HotelCard city={withNights(2)} currency="INR" travelers={5} onEdit={vi.fn()} />);
    const text = screen.getByRole("button").textContent ?? "";
    expect(text).toContain("/room/night");
    expect(text).toContain("· 3 rooms ·");
    expect(text).toContain(formatMoney(base.hotel.pricePerNight * 2 * 3, "INR"));
  });

  it("says what an estimated price is based on", () => {
    render(<HotelCard city={withNights(2)} currency="INR" travelers={2} onEdit={vi.fn()} />);
    expect(screen.getByText(`Typical 4-star price in ${base.name}`)).toBeInTheDocument();
  });

  it("says when an estimated price was modelled from another city", () => {
    const city = withNights(2);
    const rateBasis = { tier: "mid" as const, basis: "modelled" as const, from: "Athens", includesTax: false, kind: "beach" as const };
    render(<HotelCard city={{ ...city, hotel: { ...city.hotel, rateBasis } }} currency="INR" travelers={2} onEdit={vi.fn()} />);
    expect(screen.getByText("Estimated 4-star price for a beach town, from Athens prices")).toBeInTheDocument();
  });

  it("says when a class's price was worked out from the city's 4-star", () => {
    const city = withNights(2);
    const rateBasis = { tier: "upscale" as const, basis: "city" as const, from: "Phuket", includesTax: false, derived: true as const };
    render(<HotelCard city={{ ...city, hotel: { ...city.hotel, rateBasis } }} currency="INR" travelers={2} onEdit={vi.fn()} />);
    expect(screen.getByText("Estimated 5-star price in Phuket, worked out from its 4-star")).toBeInTheDocument();
  });

  it("says nothing about a basis once the traveller has typed in the real price", () => {
    const city = withNights(2);
    render(
      <HotelCard city={{ ...city, hotel: { ...city.hotel, priceIsEstimate: false } }} currency="INR" travelers={2} onEdit={vi.fn()} />,
    );
    expect(screen.queryByText(/Typical|Based on|Rough|Estimated/)).not.toBeInTheDocument();
  });

  it("shows a hotel saved before prices had a basis without one", () => {
    const city = withNights(2);
    const { rateBasis: _dropped, ...oldHotel } = city.hotel;
    void _dropped;
    render(<HotelCard city={{ ...city, hotel: oldHotel }} currency="INR" travelers={2} onEdit={vi.fn()} />);
    expect(screen.queryByText(/Typical|Based on|Rough|Estimated/)).not.toBeInTheDocument();
    expect(screen.getByRole("button").textContent).toContain("/night");
  });

  it("asks for the price of one room when editing", () => {
    render(<HotelCard city={withNights(2)} currency="INR" travelers={4} onEdit={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`Edit hotel in ${base.name}`) }));
    expect(screen.getByLabelText("Price per room, per night")).toBeInTheDocument();
  });
});
