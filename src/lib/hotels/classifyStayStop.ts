export type StayStopKind = "connection" | "overnight_layover" | "destination";

/** What the engine suggests before the user decides. */
export type SuggestedStayIntent = "skip" | "ask" | "needs_hotel";

/** User-facing decision for a city stop. */
export type StayIntent = "unknown" | "needs_hotel" | "skip";

export interface StayStopClassification {
  stopKind: StayStopKind;
  suggestedIntent: SuggestedStayIntent;
  connectionHours: number | null;
  reason: string;
}

export interface ClassifyStayStopInput {
  arrivalDay: string;
  nextDepartureDay: string | null;
  arrivalMs?: number | null;
  nextDepartureMs?: number | null;
  hasNextFlight: boolean;
  /** Learned from prior trips — auto-skip obvious connections when true. */
  usuallySkipsConnections?: boolean;
}

function nightsBetween(fromDay: string, toDay: string): number {
  const from = Date.parse(`${fromDay}T12:00:00Z`);
  const to = Date.parse(`${toDay}T12:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

function parseLocalMs(value: string | null | undefined): number | null {
  if (!value?.trim()) return null;
  const normalized = value.trim().replace("T", " ").slice(0, 16);
  const match = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/.exec(normalized);
  if (!match) return null;
  const [, y, mo, d, h = "12", mi = "0"] = match;
  const ms = Date.UTC(+y, +mo - 1, +d, +h, +mi);
  return Number.isNaN(ms) ? null : ms;
}

/** Infer whether a flight stop is a connection, overnight layover, or real stay. */
export function classifyStayStop(input: ClassifyStayStopInput): StayStopClassification {
  const { arrivalDay, nextDepartureDay, hasNextFlight, usuallySkipsConnections } = input;

  if (!hasNextFlight || !nextDepartureDay) {
    return {
      stopKind: "destination",
      suggestedIntent: "needs_hotel",
      connectionHours: null,
      reason: "Final stop on this trip — plan a hotel unless you are heading home.",
    };
  }

  const arrivalMs = input.arrivalMs ?? parseLocalMs(arrivalDay);
  const nextDepartureMs = input.nextDepartureMs ?? parseLocalMs(nextDepartureDay);
  const connectionHours =
    arrivalMs != null && nextDepartureMs != null && nextDepartureMs > arrivalMs
      ? (nextDepartureMs - arrivalMs) / 3_600_000
      : null;

  const calendarNights = nightsBetween(arrivalDay, nextDepartureDay);

  // Same-day connection — classic hub (e.g. Seattle between long-hauls).
  if (calendarNights === 0) {
    if (connectionHours != null && connectionHours <= 10) {
      return {
        stopKind: "connection",
        suggestedIntent: "skip",
        connectionHours,
        reason: `Same-day connection (~${Math.round(connectionHours)}h) — you are catching another plane, not staying.`,
      };
    }
    return {
      stopKind: "connection",
      suggestedIntent: usuallySkipsConnections ? "skip" : "ask",
      connectionHours,
      reason: "Same-day stop — likely just connecting between flights.",
    };
  }

  // One calendar night — overnight layover (airport hotel optional).
  if (calendarNights === 1) {
    if (connectionHours != null && connectionHours <= 14) {
      return {
        stopKind: "overnight_layover",
        suggestedIntent: usuallySkipsConnections ? "skip" : "ask",
        connectionHours,
        reason: "Short overnight between flights — many travelers skip a hotel and stay airside.",
      };
    }
    return {
      stopKind: "overnight_layover",
      suggestedIntent: "ask",
      connectionHours,
      reason: "Overnight layover — only book a hotel if you plan to leave the airport.",
    };
  }

  // Multi-night gap — real destination stay.
  return {
    stopKind: "destination",
    suggestedIntent: "needs_hotel",
    connectionHours,
    reason: `${calendarNights} nights in this city — you will likely want a hotel.`,
  };
}

/** Resolve stored + suggested intent into the effective planner intent. */
export function resolveStayIntent(input: {
  classification: StayStopClassification;
  userIntent?: StayIntent | null;
  isBooked: boolean;
  usuallySkipsConnections?: boolean;
}): StayIntent {
  if (input.isBooked) return "needs_hotel";
  if (input.userIntent === "needs_hotel" || input.userIntent === "skip") return input.userIntent;

  const { suggestedIntent, stopKind, connectionHours } = input.classification;
  if (suggestedIntent === "needs_hotel") return "needs_hotel";
  if (suggestedIntent === "skip" && stopKind === "connection") {
    if (connectionHours != null && connectionHours <= 10) return "skip";
    return input.usuallySkipsConnections ? "skip" : "unknown";
  }
  if (suggestedIntent === "skip" && input.usuallySkipsConnections) return "skip";
  return "unknown";
}
