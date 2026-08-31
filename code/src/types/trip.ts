export type ExpenseCategory =
  | "accommodation"
  | "transport"
  | "food"
  | "activities"
  | "misc";

export interface CapturedPlace {
  placeId: string;
  label: string;
  lat: number;
  lng: number;
}

export interface Trip {
  id: string;
  ownerId: string;
  title: string;
  destination: CapturedPlace;
  startDate: Date;
  endDate: Date;
  dayCount: number;
  travellers: number;
  currency: string;
  places: CapturedPlace[];
  budget: Partial<Record<ExpenseCategory, number>>;
  totals: { plannedTotal: number; spentTotal: number };
  share: { enabled: boolean; token: string | null };
  createdAt: Date;
  updatedAt: Date;
}

export interface ItineraryItem {
  id: string;
  placeId: string;
  label: string;
  lat: number;
  lng: number;
  dayIndex: number;
  position: number;
  plannedTime: string | null;
  note: string | null;
}

export interface Expense {
  id: string;
  category: ExpenseCategory;
  amount: number;
  currency: string;
  incurredOn: Date;
  note: string | null;
  createdBy: string;
}
