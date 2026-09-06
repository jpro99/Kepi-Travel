/**
 * Day-of door honesty — provenance tiers for flight status, gate, bags, clubs.
 * F17 / G48: UNVERIFIED hides countdown; gate is STRING-only; no invented doors.
 */

import { getAirportWayfindingResource } from "@/lib/airportNav/officialWayfinding";
import { getAirportLayout } from "@/lib/airportNav/getLayout";
import { getAirportNav } from "@/lib/travelAssistant/airportNavigation";

export type FlightFactProvenance =
  | "SCHEDULED_ITINERARY"
  | "AIRPORT_FIDS_TEXT"
  | "ALERT_PUSH_STRING"
  | "UNVERIFIED";

export type DayOfDoorKind = "flight_status" | "gate" | "bags" | "clubs";

export interface DayOfDoorTruth {
  kind: DayOfDoorKind;
  provenance: FlightFactProvenance;
  /** User-facing line; null when unknown. */
  line: string | null;
  officialUrl: string | null;
  officialLabel: string | null;
  /** Countdown / live urgency only when provenance is verified. */
  showCountdown: boolean;
}

const ENROUTE_RE = /active|enroute|en-route|depart|approach|airborne|in.?flight|landed|arrived/iu;

function officialAirportLink(iata: string): { url: string; label: string } {
  const resource = getAirportWayfindingResource(iata);
  return {
    url: resource?.url ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${iata} airport flight information`)}`,
    label: resource?.official
      ? `Open official ${iata} airport info`
      : `Check ${iata} airport boards`,
  };
}

function isVerifiedProvenance(p: FlightFactProvenance): boolean {
  return p !== "UNVERIFIED";
}

/** Flight status line for Home / day-of — never fake a live claim. */
export function resolveFlightStatusDoor(input: {
  bookedStatus?: string | null;
  liveStatus?: string | null;
  liveCheckedAt?: string | null;
  liveError?: string | null;
  pushAlertStatus?: string | null;
  departureIata?: string | null;
}): DayOfDoorTruth {
  const iata = (input.departureIata ?? "").trim().toUpperCase();
  const official = iata ? officialAirportLink(iata) : { url: null, label: null };

  const push = (input.pushAlertStatus ?? "").trim();
  if (push) {
    return {
      kind: "flight_status",
      provenance: "ALERT_PUSH_STRING",
      line: push,
      officialUrl: official.url,
      officialLabel: official.label,
      showCountdown: true,
    };
  }

  const live = (input.liveStatus ?? "").trim();
  const checkedAt = (input.liveCheckedAt ?? "").trim();
  const hasLiveLookup = Boolean(checkedAt && !input.liveError?.trim());
  if (live && hasLiveLookup) {
    return {
      kind: "flight_status",
      provenance: "AIRPORT_FIDS_TEXT",
      line: live,
      officialUrl: official.url,
      officialLabel: official.label,
      showCountdown: !ENROUTE_RE.test(live),
    };
  }

  const booked = (input.bookedStatus ?? "").trim();
  if (booked) {
    return {
      kind: "flight_status",
      provenance: "SCHEDULED_ITINERARY",
      line: `Booked: ${booked}`,
      officialUrl: official.url,
      officialLabel: official.label,
      showCountdown: false,
    };
  }

  return {
    kind: "flight_status",
    provenance: "UNVERIFIED",
    line: null,
    officialUrl: official.url,
    officialLabel: official.label ?? "Check airline status",
    showCountdown: false,
  };
}

/** Gate STRING overlay — no invented gate DOT without a real string. */
export function resolveGateDoor(input: {
  bookedGate?: string | null;
  liveGate?: string | null;
  pushGate?: string | null;
  departureIata?: string | null;
}): DayOfDoorTruth {
  const iata = (input.departureIata ?? "").trim().toUpperCase();
  const official = iata ? officialAirportLink(iata) : { url: null, label: null };

  const push = (input.pushGate ?? "").trim();
  if (push) {
    return {
      kind: "gate",
      provenance: "ALERT_PUSH_STRING",
      line: `Gate ${push.toUpperCase()}`,
      officialUrl: official.url,
      officialLabel: official.label,
      showCountdown: true,
    };
  }

  const live = (input.liveGate ?? "").trim();
  if (live) {
    return {
      kind: "gate",
      provenance: "AIRPORT_FIDS_TEXT",
      line: `Gate ${live.toUpperCase()}`,
      officialUrl: official.url,
      officialLabel: official.label,
      showCountdown: true,
    };
  }

  const booked = (input.bookedGate ?? "").trim();
  if (booked) {
    return {
      kind: "gate",
      provenance: "SCHEDULED_ITINERARY",
      line: `Gate ${booked.toUpperCase()} (from confirmation)`,
      officialUrl: official.url,
      officialLabel: official.label,
      showCountdown: false,
    };
  }

  return {
    kind: "gate",
    provenance: "UNVERIFIED",
    line: "Gate unknown — check airport boards",
    officialUrl: official.url,
    officialLabel: official.label ?? "Open airport flight info",
    showCountdown: false,
  };
}

/** Bags — package Facts TEXT or live FIDS only. */
export function resolveBagsDoor(input: {
  iata: string;
  liveBaggage?: string | null;
  pushBaggage?: string | null;
}): DayOfDoorTruth {
  const code = input.iata.trim().toUpperCase();
  const official = officialAirportLink(code);

  const push = (input.pushBaggage ?? "").trim();
  if (push) {
    return {
      kind: "bags",
      provenance: "ALERT_PUSH_STRING",
      line: push,
      officialUrl: official.url,
      officialLabel: official.label,
      showCountdown: false,
    };
  }

  const live = (input.liveBaggage ?? "").trim();
  if (live) {
    return {
      kind: "bags",
      provenance: "AIRPORT_FIDS_TEXT",
      line: `Carousel ${live} — from live flight status`,
      officialUrl: official.url,
      officialLabel: official.label,
      showCountdown: false,
    };
  }

  const navNote = getAirportNav(code)?.arrivalInfo?.baggageCarousels?.[0]?.carouselNote?.trim();
  if (navNote) {
    return {
      kind: "bags",
      provenance: "SCHEDULED_ITINERARY",
      line: navNote,
      officialUrl: official.url,
      officialLabel: official.label,
      showCountdown: false,
    };
  }

  return {
    kind: "bags",
    provenance: "UNVERIFIED",
    line: null,
    officialUrl: official.url,
    officialLabel: official.label ?? `Check ${code} baggage info`,
    showCountdown: false,
  };
}

/** Clubs / lounges — named POIs on bundled layout or package Facts only. */
export function resolveClubsDoor(input: {
  iata: string;
  eligibleLoungeNames?: readonly string[];
}): DayOfDoorTruth {
  const code = input.iata.trim().toUpperCase();
  const official = officialAirportLink(code);
  const layout = getAirportLayout(code);
  const layoutLounges =
    layout?.pois
      ?.filter((poi) => poi.category === "lounge" && poi.name?.trim())
      .map((poi) => poi.name.trim()) ?? [];

  const eligible = (input.eligibleLoungeNames ?? []).map((n) => n.trim()).filter(Boolean);
  const named = [...new Set([...eligible, ...layoutLounges])];

  if (named.length > 0) {
    const preview = named.slice(0, 3).join(", ");
    const suffix = named.length > 3 ? ` +${named.length - 3} more` : "";
    return {
      kind: "clubs",
      provenance: "SCHEDULED_ITINERARY",
      line: `Lounges on file: ${preview}${suffix}`,
      officialUrl: official.url,
      officialLabel: official.label,
      showCountdown: false,
    };
  }

  return {
    kind: "clubs",
    provenance: "UNVERIFIED",
    line: null,
    officialUrl: official.url,
    officialLabel: official.label ?? `Check ${code} lounge directory`,
    showCountdown: false,
  };
}

/** Format minutes-to-departure only when gate/status provenance allows countdown. */
export function formatDayOfCountdownSuffix(
  minutesToDeparture: number | null | undefined,
  gateTruth: DayOfDoorTruth,
  statusTruth: DayOfDoorTruth,
): string | null {
  if (minutesToDeparture == null || !Number.isFinite(minutesToDeparture) || minutesToDeparture <= 0) {
    return null;
  }
  const verified =
    isVerifiedProvenance(gateTruth.provenance) || isVerifiedProvenance(statusTruth.provenance);
  if (!verified || !gateTruth.showCountdown && !statusTruth.showCountdown) {
    return null;
  }
  if (gateTruth.provenance === "UNVERIFIED" && statusTruth.provenance === "UNVERIFIED") {
    return null;
  }
  return `${Math.round(minutesToDeparture)}m to departure`;
}

export function formatDayOfDoorHonestLine(truth: DayOfDoorTruth): string {
  if (truth.line) return truth.line;
  return truth.officialLabel ?? "Check official airport info";
}
