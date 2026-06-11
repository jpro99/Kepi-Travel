export interface BoardingPressureInput {
  boardingCloseIso: string | null | undefined;
  walkSeconds: number;
  securityEstimateSeconds?: number;
  bufferSeconds?: number;
}

export type BoardingPressureLevel = "calm" | "watch" | "urgent" | "missed";

export interface BoardingPressureIndex {
  secondsRemaining: number | null;
  pressureSeconds: number | null;
  level: BoardingPressureLevel;
  suggestSprint: boolean;
  loungeAllowed: boolean;
  leaveByIso: string | null;
}

const DEFAULT_BUFFER_SECONDS = 8 * 60;

export function computeBoardingPressure(input: BoardingPressureInput): BoardingPressureIndex {
  const buffer = input.bufferSeconds ?? DEFAULT_BUFFER_SECONDS;
  const security = input.securityEstimateSeconds ?? 0;
  const walk = input.walkSeconds;

  if (!input.boardingCloseIso) {
    return {
      secondsRemaining: null,
      pressureSeconds: null,
      level: "calm",
      suggestSprint: false,
      loungeAllowed: true,
      leaveByIso: null,
    };
  }

  const closeMs = Date.parse(input.boardingCloseIso);
  if (Number.isNaN(closeMs)) {
    return {
      secondsRemaining: null,
      pressureSeconds: null,
      level: "calm",
      suggestSprint: false,
      loungeAllowed: true,
      leaveByIso: null,
    };
  }

  const secondsRemaining = Math.round((closeMs - Date.now()) / 1000);
  const pressureSeconds = secondsRemaining - walk - security - buffer;
  const leaveByMs = closeMs - (walk + buffer) * 1000;

  let level: BoardingPressureLevel = "calm";
  if (secondsRemaining <= 0) level = "missed";
  else if (pressureSeconds <= 5 * 60) level = "urgent";
  else if (pressureSeconds <= 15 * 60) level = "watch";

  return {
    secondsRemaining,
    pressureSeconds,
    level,
    suggestSprint: level === "urgent" || level === "watch",
    loungeAllowed: pressureSeconds > 20 * 60,
    leaveByIso: new Date(leaveByMs).toISOString(),
  };
}

export function formatMinutesLabel(totalSeconds: number | null): string {
  if (totalSeconds === null) return "—";
  if (totalSeconds <= 0) return "now";
  const minutes = Math.ceil(totalSeconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`;
}
