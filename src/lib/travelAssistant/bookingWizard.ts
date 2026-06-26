/** Guided trip booking phases — flights → hotels → excursions. */

import { isTripShellConfigured } from "@/lib/travelAssistant/tripWindow";

export type BookingWizardPhase = "setup" | "flights" | "hotels" | "excursions" | "complete";

export interface BookingWizardProgress {
  phase: BookingWizardPhase;
  flightsDone: boolean;
  hotelsDone: boolean;
  excursionsDone: boolean;
  updatedAt: string;
  /** True when user explicitly opened setup to edit trip details. */
  setupEdit?: boolean;
}

export interface TripWizardPhaseInput {
  name?: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  bookingWizard?: unknown;
}

export const EMPTY_BOOKING_WIZARD: BookingWizardProgress = {
  phase: "setup",
  flightsDone: false,
  hotelsDone: false,
  excursionsDone: false,
  updatedAt: new Date(0).toISOString(),
};

export function normalizeBookingWizard(value: unknown): BookingWizardProgress {
  if (!value || typeof value !== "object") return { ...EMPTY_BOOKING_WIZARD, updatedAt: new Date().toISOString() };
  const record = value as Partial<BookingWizardProgress>;
  const phase = record.phase;
  const validPhase: BookingWizardPhase =
    phase === "flights" || phase === "hotels" || phase === "excursions" || phase === "complete" || phase === "setup"
      ? phase
      : "setup";
  return {
    phase: validPhase,
    flightsDone: Boolean(record.flightsDone),
    hotelsDone: Boolean(record.hotelsDone),
    excursionsDone: Boolean(record.excursionsDone),
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString(),
    setupEdit: Boolean(record.setupEdit),
  };
}

/** Resolve which wizard step to show when opening plan-my-trip. */
export function resolveBookingWizardPhase(trip: TripWizardPhaseInput | null | undefined): BookingWizardPhase {
  if (!trip || !isTripShellConfigured(trip)) {
    return "setup";
  }
  if (!trip.bookingWizard) {
    return "flights";
  }
  const wizard = normalizeBookingWizard(trip.bookingWizard);
  if (wizard.phase === "setup" && !wizard.setupEdit) {
    return "flights";
  }
  return wizard.phase;
}

export function advanceBookingWizard(
  current: BookingWizardProgress,
  action: "complete-setup" | "done-flights" | "done-hotels" | "done-excursions" | "adjust",
): BookingWizardProgress {
  const now = new Date().toISOString();
  if (action === "adjust") {
    return { ...current, phase: "setup", setupEdit: true, updatedAt: now };
  }
  if (action === "complete-setup") {
    return {
      phase: "flights",
      flightsDone: false,
      hotelsDone: false,
      excursionsDone: false,
      setupEdit: false,
      updatedAt: now,
    };
  }
  if (action === "done-flights") {
    return { ...current, phase: "hotels", flightsDone: true, updatedAt: now };
  }
  if (action === "done-hotels") {
    return { ...current, phase: "excursions", hotelsDone: true, updatedAt: now };
  }
  return { ...current, phase: "complete", excursionsDone: true, updatedAt: now };
}
