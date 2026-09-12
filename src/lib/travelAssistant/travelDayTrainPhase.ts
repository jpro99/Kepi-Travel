/**
 * G55/G60 — travel-day train phase ends when booked rail is done (time or geofence).
 * Never keep "get on trains" copy after the last leg arrives at the airport.
 */

import { flightDepartureUtcMs } from "@/lib/travelAssistant/flightSort";
import {
  extractRailTicketLegs,
  findRailArrivalLocalTimeInSegment,
} from "@/lib/travelAssistant/railTicketExtract";
import type { TrainTicketSourceReservation } from "@/lib/travelAssistant/trainTicketHandoff";

const MS_PER_MIN = 60_000;
/** Buffer after scheduled rail arrival before airport phase (alight + walk). */
export const TRAIN_PHASE_COMPLETE_BUFFER_MS = 10 * MS_PER_MIN;

function toUtcMs(localTime: string, timezone?: string): number {
  const normalized = localTime.trim().replace("T", " ").slice(0, 16);
  const match = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/.exec(normalized);
  if (!match) return Number.NaN;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4] ?? 0);
  const minute = Number(match[5] ?? 0);
  const approxUtcMs = Date.UTC(year, month - 1, day, hour, minute);
  const tz = timezone?.trim();
  if (!tz) return approxUtcMs;
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(approxUtcMs)).map((p) => [p.type, p.value]),
    );
    const tzAsUtcMs = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
    );
    return approxUtcMs - (tzAsUtcMs - approxUtcMs);
  } catch {
    return approxUtcMs;
  }
}

function railSegmentForTrain(sourceText: string, trainNumber: string): string | null {
  const trainNo = trainNumber.trim();
  if (!trainNo || !sourceText.trim()) return null;
  const idx = sourceText.search(new RegExp(`\\b${trainNo}\\b`, "u"));
  if (idx < 0) return sourceText;
  const before = sourceText.slice(0, idx);
  const prevService = [...before.matchAll(
    /\b(Frecciargento|Frecciarossa|Frecciabianca|Regionale(?:\s+Veloce)?|Intercity|InterCity)\s+(\d{4,5})\b/giu,
  )].pop();
  const start = prevService?.index ?? Math.max(0, idx - 400);
  const after = sourceText.slice(idx);
  const nextService = after.slice(1).search(
    /\b(Frecciargento|Frecciarossa|Frecciabianca|Regionale(?:\s+Veloce)?|Intercity|InterCity)\s+\d{4,5}\b/iu,
  );
  const end = nextService >= 0 ? idx + 1 + nextService : sourceText.length;
  return sourceText.slice(start, end);
}

/** Scheduled end of a rail leg — ARRIVO from stored PDF when present, else dep + honest estimate. */
export function resolveTrainLegEndUtcMs(train: TrainTicketSourceReservation): number {
  const sourceText = train.originalEmailText?.trim() ?? "";
  const trainNo = train.trainNumber?.trim() ?? "";
  if (sourceText && trainNo) {
    const segment = railSegmentForTrain(sourceText, trainNo);
    if (segment) {
      const arrivalLocal = findRailArrivalLocalTimeInSegment(segment);
      if (arrivalLocal) {
        const ms = toUtcMs(arrivalLocal, train.timezone ?? "Europe/Rome");
        if (!Number.isNaN(ms)) return ms;
      }
    }
    const legs = extractRailTicketLegs(sourceText);
    const leg = legs.find((row) => row.trainNumber === trainNo);
    if (leg?.localTime) {
      const arrivalFromLeg = findRailArrivalLocalTimeInSegment(
        sourceText.slice(sourceText.indexOf(leg.trainNumber)),
      );
      if (arrivalFromLeg) {
        const ms = toUtcMs(arrivalFromLeg, leg.timezone || train.timezone || "Europe/Rome");
        if (!Number.isNaN(ms)) return ms;
      }
    }
  }

  const depMs = flightDepartureUtcMs({
    localTime: train.localTime,
    timezone: train.timezone ?? undefined,
    flightDepartureTime: train.localTime,
  });
  if (Number.isNaN(depMs)) return Number.NaN;
  const blob = `${train.location ?? ""} ${train.title ?? ""}`.toLowerCase();
  const isShortHop = /\b(regionale|aeroporto|airport|fnb|c\.le)\b/u.test(blob);
  const estimateMinutes = isShortHop ? 20 : 90;
  return depMs + estimateMinutes * MS_PER_MIN;
}

export function areTravelDayTrainsComplete(input: {
  trains: readonly TrainTicketSourceReservation[];
  nowMs: number;
  /** GPS geofence at today's departure airport — instant airport phase. */
  atFlightDepartureAirport?: boolean;
}): boolean {
  if (input.trains.length === 0) return true;
  if (input.atFlightDepartureAirport) return true;

  const lastTrain = input.trains[input.trains.length - 1];
  if (!lastTrain) return true;

  const endMs = resolveTrainLegEndUtcMs(lastTrain);
  if (Number.isNaN(endMs)) return false;
  return input.nowMs >= endMs + TRAIN_PHASE_COMPLETE_BUFFER_MS;
}

/** Parse ARRIVO date/time from a rail PDF segment (Trenitalia gospel tickets). */
export function parseRailArrivalFromFixtureText(text: string): string | null {
  return findRailArrivalLocalTimeInSegment(text);
}
