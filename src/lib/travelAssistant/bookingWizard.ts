/** Guided trip booking phases — flights → hotels → excursions. */

export type BookingWizardPhase = "setup" | "flights" | "hotels" | "excursions" | "complete";

export interface BookingWizardProgress {
  phase: BookingWizardPhase;
  flightsDone: boolean;
  hotelsDone: boolean;
  excursionsDone: boolean;
  updatedAt: string;
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
  };
}

export function advanceBookingWizard(
  current: BookingWizardProgress,
  action: "complete-setup" | "done-flights" | "done-hotels" | "done-excursions" | "adjust",
): BookingWizardProgress {
  const now = new Date().toISOString();
  if (action === "adjust") {
    return { ...current, phase: "setup", updatedAt: now };
  }
  if (action === "complete-setup") {
    return { phase: "flights", flightsDone: false, hotelsDone: false, excursionsDone: false, updatedAt: now };
  }
  if (action === "done-flights") {
    return { ...current, phase: "hotels", flightsDone: true, updatedAt: now };
  }
  if (action === "done-hotels") {
    return { ...current, phase: "excursions", hotelsDone: true, updatedAt: now };
  }
  return { ...current, phase: "complete", excursionsDone: true, updatedAt: now };
}
