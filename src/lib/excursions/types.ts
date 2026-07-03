export type ExcursionCategory =
  | "cooking-class"
  | "food-tour"
  | "wine-tasting"
  | "cultural-tour"
  | "outdoor-adventure";

export interface ExcursionOffer {
  id: string;
  title: string;
  provider: string;
  category: ExcursionCategory;
  city: string;
  cityCodes: string[];
  country: string;
  durationMinutes: number;
  priceUsd: number;
  currency: "USD";
  rating: number;
  reviewCount: number;
  description: string;
  highlights: string[];
  includes: string[];
  meetingPoint: string;
  maxGuests: number;
  cancellable: boolean;
  imageEmoji: string;
}

export interface ExcursionSearchRequest {
  destination: string;
  date?: string;
  category?: ExcursionCategory | "all";
  query?: string;
}

export interface ExcursionBookRequest {
  excursionId: string;
  tripId?: string;
  date: string;
  time?: string;
  guests: number;
  guest: {
    firstName: string;
    lastName: string;
    email: string;
  };
}

export const EXCURSION_CATEGORY_LABELS: Record<ExcursionCategory, string> = {
  "cooking-class": "Cooking classes",
  "food-tour": "Food tours",
  "wine-tasting": "Wine & tastings",
  "cultural-tour": "Cultural tours",
  "outdoor-adventure": "Outdoor adventures",
};

export const EXCURSION_NOTE_PREFIX = "kepi-excursion:";

export function isExcursionReservation(notes: string | undefined): boolean {
  return Boolean(notes?.includes(EXCURSION_NOTE_PREFIX));
}

export function excursionCategoryFromNotes(notes: string | undefined): ExcursionCategory | null {
  if (!notes?.includes(EXCURSION_NOTE_PREFIX)) return null;
  const match = /kepi-excursion:([a-z-]+)/.exec(notes);
  if (!match) return null;
  const category = match[1] as ExcursionCategory;
  if (category in EXCURSION_CATEGORY_LABELS) return category;
  return null;
}
