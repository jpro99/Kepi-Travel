import type {
  TravelUpdateEvent,
  TravelUpdateProvider,
  UpdatableReservation,
} from "@/lib/travelAssistant/travelUpdateTypes";

function parseDateInput(value: string): number {
  if (!value) return Number.NaN;
  const parsed = Date.parse(value.replace(" ", "T"));
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

function deterministicHash(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function buildMockUpdates(
  reservation: UpdatableReservation,
  minutesUntil: number,
  hashSeed: number,
): TravelUpdateEvent[] {
  if (!["flight", "train", "ride"].includes(reservation.type)) {
    return [];
  }
  if (minutesUntil < -120) {
    return [];
  }

  if (reservation.type === "flight") {
    if (hashSeed % 41 === 0 && minutesUntil < 210 && minutesUntil > 40) {
      return [
        {
          provider: "mock-flight-ops",
          kind: "cancellation",
          severity: "critical",
          summary: `${reservation.title} cancelled by carrier`,
          detail: "Auto-rebooking required. Open recovery mode and contact airline desk.",
          target: {
            reservationType: "flight",
            confirmationCode: reservation.confirmationCode,
            titleHint: reservation.title,
          },
        },
      ];
    }
    if (minutesUntil < 210 && minutesUntil > 55) {
      const delayMinutes = 20 + (hashSeed % 36);
      return [
        {
          provider: "mock-flight-ops",
          kind: "delay",
          severity: delayMinutes >= 35 ? "critical" : "warning",
          summary: `${reservation.title} delayed ${delayMinutes} minutes`,
          detail: "Departure estimate shifted by carrier operations update.",
          target: {
            reservationType: "flight",
            confirmationCode: reservation.confirmationCode,
            titleHint: reservation.title,
          },
          delayMinutes,
        },
      ];
    }
    if (minutesUntil <= 55 && minutesUntil >= -10) {
      const gate = 8 + (hashSeed % 14);
      return [
        {
          provider: "mock-flight-ops",
          kind: "gate-change",
          severity: "warning",
          summary: `${reservation.title} gate moved to A${gate}`,
          detail: "Boarding gate changed. Notify all assigned members.",
          target: {
            reservationType: "flight",
            confirmationCode: reservation.confirmationCode,
            titleHint: reservation.title,
          },
          updatedLocation: `Gate A${gate}`,
        },
      ];
    }
    return [];
  }

  if (reservation.type === "train") {
    if (minutesUntil < 180 && minutesUntil > 35) {
      const delayMinutes = 8 + (hashSeed % 17);
      return [
        {
          provider: "mock-rail-ops",
          kind: "delay",
          severity: delayMinutes >= 18 ? "warning" : "info",
          summary: `${reservation.title} delayed ${delayMinutes} minutes`,
          detail: "Rail operations posted a revised departure estimate.",
          target: {
            reservationType: "train",
            confirmationCode: reservation.confirmationCode,
            titleHint: reservation.title,
          },
          delayMinutes,
        },
      ];
    }
    if (minutesUntil <= 35 && minutesUntil >= -15) {
      const platform = 2 + (hashSeed % 9);
      return [
        {
          provider: "mock-rail-ops",
          kind: "platform-change",
          severity: "warning",
          summary: `${reservation.title} moved to platform ${platform}`,
          detail: "Platform update issued by station control.",
          target: {
            reservationType: "train",
            confirmationCode: reservation.confirmationCode,
            titleHint: reservation.title,
          },
          updatedLocation: `Platform ${platform}`,
        },
      ];
    }
    return [];
  }

  if (minutesUntil < 75 && minutesUntil > -20) {
    return [
      {
        provider: "mock-mobility-ops",
        kind: "pickup-change",
        severity: "warning",
        summary: `${reservation.title} pickup zone adjusted`,
        detail: "Driver assigned a new pickup zone due to traffic restrictions.",
        target: {
          reservationType: "ride",
          confirmationCode: reservation.confirmationCode,
          titleHint: reservation.title,
        },
        updatedLocation: `${reservation.location} • Zone ${String.fromCharCode(65 + (hashSeed % 5))}`,
      },
    ];
  }
  return [];
}

export function createMockTravelUpdateProvider(): TravelUpdateProvider {
  return {
    name: "mock-transport-adapter",
    async fetchUpdates(args) {
      const nowMs = Date.parse(args.nowIso);
      const updates: TravelUpdateEvent[] = [];
      args.reservations.forEach((reservation) => {
        const reservationMs = parseDateInput(reservation.localTime);
        if (Number.isNaN(reservationMs)) return;
        const minutesUntil = Math.round((reservationMs - nowMs) / 60000);
        const hashSeed = deterministicHash(
          `${reservation.id}:${reservation.confirmationCode}:${reservation.localTime}:${args.nowIso.slice(0, 13)}`,
        );
        const candidateUpdates = buildMockUpdates(reservation, minutesUntil, hashSeed);
        updates.push(...candidateUpdates);
      });

      await new Promise((resolve) => setTimeout(resolve, 280));
      return updates;
    },
  };
}
