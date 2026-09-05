export type ActivityCategory =
  | "sightseeing"
  | "food"
  | "adventure"
  | "beach"
  | "culture"
  | "relaxation"
  | "shopping"
  | "nightlife"
  | "transport";

export const ACTIVITY_CATEGORY_ICON: Record<ActivityCategory, string> = {
  sightseeing: "🏛",
  food: "🍜",
  adventure: "🏔",
  beach: "🏖",
  culture: "🛕",
  relaxation: "☕",
  shopping: "🛍",
  nightlife: "🌃",
  transport: "🚗",
};

export interface Activity {
  id: string;
  name: string;
  category: ActivityCategory;
  time: string;
  durationMinutes: number;
  description: string;
  estimatedCost: number;
  currency: string;
  referenceUrl: string | null;
  isDemoData: boolean;
}

export interface Hotel {
  name: string;
  pricePerNight: number;
  currency: string;
  nights: number;
  referenceUrl: string | null;
  isDemoData: boolean;
}

export interface TripDay {
  id: string;
  dayNumber: number;
  date: string;
  cityId: string;
  activities: Activity[];
}

export interface City {
  id: string;
  name: string;
  country: string;
  order: number;
  startDate: string;
  endDate: string;
  dayCount: number;
  hotel: Hotel;
  imageQuery: string;
}

export type TravelStyle =
  | "beaches"
  | "food"
  | "culture"
  | "adventure"
  | "nightlife"
  | "shopping"
  | "nature"
  | "relaxation";

export const TRAVEL_STYLES: { id: TravelStyle; label: string; icon: string }[] = [
  { id: "beaches", label: "Beaches", icon: "🏖" },
  { id: "food", label: "Food", icon: "🍜" },
  { id: "culture", label: "Culture", icon: "🏛" },
  { id: "adventure", label: "Adventure", icon: "🏔" },
  { id: "nightlife", label: "Nightlife", icon: "🌃" },
  { id: "shopping", label: "Shopping", icon: "🛍" },
  { id: "nature", label: "Nature", icon: "🌿" },
  { id: "relaxation", label: "Relaxation", icon: "☕" },
];

export type TravelerType = "solo" | "couple" | "family" | "friends" | "custom";

export const TRAVELER_TYPES: { id: TravelerType; label: string; defaultCount: number }[] = [
  { id: "solo", label: "Solo", defaultCount: 1 },
  { id: "couple", label: "Couple", defaultCount: 2 },
  { id: "family", label: "Family", defaultCount: 4 },
  { id: "friends", label: "Friends", defaultCount: 4 },
];
