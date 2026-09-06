/**
 * Honest status line for Home next-flight card (Batch 1 / F13 trust).
 * F17 — provenance-aware; UNVERIFIED prompts official link, not fake live copy.
 */

import {
  formatDayOfDoorHonestLine,
  resolveFlightStatusDoor,
  resolveGateDoor,
  type FlightFactProvenance,
} from "@/lib/travelAssistant/dayOfDoorProvenance";

export type FlightStatusTrustInput = {
  flightStatus?: string;
  departureGate?: string;
  delayMinutes?: number | null;
  checkedAt?: string;
  busy?: boolean;
  error?: string | null;
  bookedStatus?: string;
  bookedGate?: string;
  pushStatus?: string;
  pushGate?: string;
  departureIata?: string;
};

export function flightStatusProvenance(
  status: FlightStatusTrustInput | undefined,
): FlightFactProvenance {
  if (!status) return "UNVERIFIED";
  const door = resolveFlightStatusDoor({
    bookedStatus: status.bookedStatus ?? status.flightStatus,
    liveStatus: status.flightStatus,
    liveCheckedAt: status.checkedAt,
    liveError: status.error,
    pushAlertStatus: status.pushStatus,
    departureIata: status.departureIata,
  });
  return door.provenance;
}

export function formatFlightStatusTrustLine(
  status: FlightStatusTrustInput | undefined,
  now: Date = new Date(),
): string | null {
  if (!status) {
    return "Status not checked yet — tap Check status on the flight.";
  }
  if (status.busy) {
    return "Checking live status…";
  }

  const statusDoor = resolveFlightStatusDoor({
    bookedStatus: status.bookedStatus,
    liveStatus: status.flightStatus,
    liveCheckedAt: status.checkedAt,
    liveError: status.error,
    pushAlertStatus: status.pushStatus,
    departureIata: status.departureIata,
  });

  if (status.error?.trim() && statusDoor.provenance === "UNVERIFIED") {
    const gateDoor = resolveGateDoor({
      bookedGate: status.bookedGate,
      liveGate: status.departureGate,
      pushGate: status.pushGate,
      departureIata: status.departureIata,
    });
    if (gateDoor.provenance === "UNVERIFIED") {
      return `Live status unavailable — ${gateDoor.officialLabel ?? "check airline or airport boards"}`;
    }
  }

  const parts: string[] = [];

  const gateDoor = resolveGateDoor({
    bookedGate: status.bookedGate,
    liveGate: status.departureGate,
    pushGate: status.pushGate,
    departureIata: status.departureIata,
  });
  if (gateDoor.line && gateDoor.provenance !== "UNVERIFIED") {
    parts.push(gateDoor.line);
  } else if (gateDoor.provenance === "UNVERIFIED" && status.departureIata) {
    parts.push("Gate unknown");
  }

  if (statusDoor.provenance !== "UNVERIFIED" && statusDoor.line) {
    parts.push(statusDoor.line);
  } else if (statusDoor.provenance === "UNVERIFIED") {
    parts.push(formatDayOfDoorHonestLine(statusDoor));
  }

  if (typeof status.delayMinutes === "number" && status.delayMinutes > 0) {
    parts.push(`+${status.delayMinutes} min`);
  }

  const checkedAt = status.checkedAt?.trim();
  if (checkedAt && statusDoor.provenance === "AIRPORT_FIDS_TEXT") {
    const ms = Date.parse(checkedAt);
    if (!Number.isNaN(ms)) {
      const minutesAgo = Math.max(0, Math.round((now.getTime() - ms) / 60_000));
      if (minutesAgo <= 1) parts.push("Updated just now");
      else if (minutesAgo < 60) parts.push(`Updated ${minutesAgo} min ago`);
      else parts.push(`Updated ${Math.round(minutesAgo / 60)}h ago`);
    }
  }

  return parts.length > 0 ? parts.join(" · ") : formatDayOfDoorHonestLine(statusDoor);
}
