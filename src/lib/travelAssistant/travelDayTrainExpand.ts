/**
 * Expand stored rail PDFs into per-leg train rows for travel-day coach (8312 + 91312).
 * Never invents legs — only reads extractRailTicketLegs from stored originalEmailText.
 */

import { extractRailTicketLegs } from "@/lib/travelAssistant/railTicketExtract";
import {
  isBookedTrainReservation,
  trainReservationsOnDay,
  type TrainTicketSourceReservation,
} from "@/lib/travelAssistant/trainTicketHandoff";

function syntheticTrainId(confirmation: string, trainNumber: string): string {
  return `expanded-${confirmation}-${trainNumber}`;
}

/**
 * Trains on a calendar day, including extra legs parsed from combined ticket PDFs
 * when live storage only has one reservation row (e.g. FA 8312 with both legs in email).
 */
export function trainReservationsOnDayExpanded(
  reservations: TrainTicketSourceReservation[],
  dateKey: string,
): TrainTicketSourceReservation[] {
  const onDay = trainReservationsOnDay(reservations, dateKey);
  const byTrainNumber = new Map<string, TrainTicketSourceReservation>();

  for (const train of onDay) {
    const key = train.trainNumber?.trim() || train.id;
    byTrainNumber.set(key, train);
  }

  for (const train of onDay) {
    const sourceText = train.originalEmailText?.trim() ?? "";
    if (!sourceText) continue;
    const legs = extractRailTicketLegs(sourceText);
    for (const leg of legs) {
      const legDate = leg.localTime.slice(0, 10);
      if (legDate !== dateKey) continue;
      const trainNo = leg.trainNumber.trim();
      if (!trainNo || byTrainNumber.has(trainNo)) continue;
      const confirmation = leg.confirmationCode?.trim() || train.confirmationCode?.trim() || "rail";
      byTrainNumber.set(trainNo, {
        ...train,
        id: syntheticTrainId(confirmation, trainNo),
        title: leg.title,
        trainNumber: trainNo,
        localTime: leg.localTime,
        location: leg.location,
        confirmationCode: leg.confirmationCode || train.confirmationCode,
        timezone: leg.timezone || train.timezone,
      });
    }
  }

  return [...byTrainNumber.values()].sort((a, b) => (a.localTime ?? "").localeCompare(b.localTime ?? ""));
}

/** Any booked train on day — base rows or PDF-expanded legs. */
export function dayHasBookedTrains(
  reservations: TrainTicketSourceReservation[],
  dateKey: string,
): boolean {
  return trainReservationsOnDayExpanded(reservations, dateKey).length > 0;
}
