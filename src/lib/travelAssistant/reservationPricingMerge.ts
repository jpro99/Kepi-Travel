import { shouldReplaceStoredSourceText } from "@/lib/travelAssistant/emailSourceText";

export interface ReservationPricingFields {
  quotedPriceUsd?: number;
  quotedPointsMiles?: number;
  quotedMilesEarned?: number;
  pointsProgram?: string;
  notes?: string;
  originalEmailText?: string;
  sourceEmailId?: string;
  sourceEmailSubject?: string;
}

function isEmptyPricingValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "number") return !Number.isFinite(value) || value <= 0;
  if (typeof value === "string") return value.trim().length === 0;
  return false;
}

/** Fill missing cash/miles/email source when the same booking is forwarded again. */
export function mergeReservationPricingFields<T extends ReservationPricingFields>(
  existing: T,
  incoming: T,
): T {
  const next = { ...existing };
  let changed = false;

  const fill = <K extends keyof ReservationPricingFields>(key: K) => {
    const existingValue = existing[key];
    const incomingValue = incoming[key];
    if (isEmptyPricingValue(existingValue) && !isEmptyPricingValue(incomingValue)) {
      (next as ReservationPricingFields)[key] = incomingValue as ReservationPricingFields[K];
      changed = true;
    }
  };

  fill("quotedPriceUsd");
  fill("quotedPointsMiles");
  fill("quotedMilesEarned");
  fill("pointsProgram");

  const existingSource = existing.originalEmailText?.trim() ?? "";
  const incomingSource = incoming.originalEmailText?.trim() ?? "";
  if (incomingSource && shouldReplaceStoredSourceText(existingSource, incomingSource)) {
    next.originalEmailText = incomingSource;
    changed = true;
  } else {
    fill("originalEmailText");
  }

  fill("sourceEmailId");
  fill("sourceEmailSubject");

  const incomingNotes = incoming.notes?.trim() ?? "";
  const existingNotes = existing.notes?.trim() ?? "";
  if (incomingNotes.length > 0 && !existingNotes.includes(incomingNotes.slice(0, 120))) {
    const mergedNotes = [existingNotes, incomingNotes].filter(Boolean).join("\n").trim();
    if (mergedNotes !== existingNotes) {
      next.notes = mergedNotes;
      changed = true;
    }
  }

  return changed ? next : existing;
}
