// Disruption recovery engine — the feature that makes Kepi irreplaceable

export type DisruptionType =
  | "on_time"
  | "delayed"
  | "cancelled"
  | "gate_change"
  | "connection_at_risk"
  | "connection_missed"
  | "diverted";

export interface LiveFlightStatus {
  flightNumber: string;
  airlineIata: string;
  airlineName: string;
  origin: string;
  destination: string;
  scheduledDepart: string;
  estimatedDepart: string | null;
  actualDepart: string | null;
  scheduledArrive: string;
  estimatedArrive: string | null;
  actualArrive: string | null;
  delayMinutes: number;
  status: string; // "scheduled" | "active" | "landed" | "cancelled" | "delayed"
  gate?: string;
  terminal?: string;
  baggageClaim?: string;
}

export interface DisruptionAssessment {
  type: DisruptionType;
  severity: "none" | "watch" | "warning" | "critical";
  headline: string;
  detail: string;
  actionRequired: boolean;
  delayMinutes: number;
  newArrivalTime?: string;
  connectionMinutesRemaining?: number;
}

export interface AlternativeFlight {
  id: string;
  airline: string;
  airlineName: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departs: string;
  arrives: string;
  stops: number;
  price: number;
  currency: string;
  recommendation: "best" | "good" | "backup";
  reason: string;
}

// Minimum connection times by airport (minutes)
const MIN_CONNECTION_TIMES: Record<string, number> = {
  ORD: 60, ATL: 45, DFW: 45, LAX: 60, JFK: 75, LHR: 90,
  FRA: 45, CDG: 75, AMS: 50, MUC: 45, MAD: 60, FCO: 60,
  DEFAULT: 45,
};

function getMinConnection(airport: string): number {
  return MIN_CONNECTION_TIMES[airport.toUpperCase()] ?? MIN_CONNECTION_TIMES.DEFAULT;
}

export function assessDisruption(
  status: LiveFlightStatus,
  nextFlight?: { origin: string; scheduledDepart: string },
): DisruptionAssessment {
  const delay = status.delayMinutes;

  // Cancelled
  if (status.status === "cancelled") {
    return {
      type: "cancelled",
      severity: "critical",
      headline: `${status.flightNumber} is cancelled`,
      detail: "Your flight has been cancelled. Kepi found alternatives below — act now, seats fill fast.",
      actionRequired: true,
      delayMinutes: 0,
    };
  }

  // Diverted
  if (status.status === "diverted") {
    return {
      type: "diverted",
      severity: "critical",
      headline: `${status.flightNumber} has been diverted`,
      detail: "Your flight was diverted. Check with the airline for rebooking options.",
      actionRequired: true,
      delayMinutes: delay,
    };
  }

  // Check connection risk
  if (nextFlight && status.estimatedArrive) {
    const arrivalTime = new Date(status.estimatedArrive).getTime();
    const connectionDepart = new Date(nextFlight.scheduledDepart).getTime();
    const connectionMinutes = Math.floor((connectionDepart - arrivalTime) / 60000);
    const minRequired = getMinConnection(nextFlight.origin);

    if (connectionMinutes < 0) {
      return {
        type: "connection_missed",
        severity: "critical",
        headline: "You will miss your connection",
        detail: `${status.flightNumber} arrives too late. Your connecting flight departs before you land. Rebook now.`,
        actionRequired: true,
        delayMinutes: delay,
        newArrivalTime: status.estimatedArrive,
        connectionMinutesRemaining: connectionMinutes,
      };
    }

    if (connectionMinutes < minRequired) {
      return {
        type: "connection_at_risk",
        severity: connectionMinutes < minRequired / 2 ? "critical" : "warning",
        headline: `Connection at risk — only ${connectionMinutes} min`,
        detail: `${nextFlight.origin} requires ${minRequired} min minimum connection. You'll have ${connectionMinutes} min. Alternatives ready below.`,
        actionRequired: true,
        delayMinutes: delay,
        newArrivalTime: status.estimatedArrive,
        connectionMinutesRemaining: connectionMinutes,
      };
    }
  }

  // Gate change only
  if (delay < 15 && status.gate) {
    return {
      type: "gate_change",
      severity: "watch",
      headline: `Gate updated — ${status.gate}`,
      detail: "Gate change only — your flight is otherwise on time.",
      actionRequired: false,
      delayMinutes: 0,
    };
  }

  // Delay
  if (delay >= 60) {
    return {
      type: "delayed",
      severity: delay >= 120 ? "critical" : "warning",
      headline: `${status.flightNumber} delayed ${Math.floor(delay / 60)}h ${delay % 60}m`,
      detail: delay >= 120
        ? `Significant delay. New departure: ${status.estimatedDepart ? new Date(status.estimatedDepart).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "TBD"}. Consider alternatives.`
        : `Running behind. New departure: ${status.estimatedDepart ? new Date(status.estimatedDepart).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "TBD"}.`,
      actionRequired: delay >= 120,
      delayMinutes: delay,
      newArrivalTime: status.estimatedArrive ?? undefined,
    };
  }

  if (delay > 0) {
    return {
      type: "delayed",
      severity: "watch",
      headline: `${status.flightNumber} running ${delay} min late`,
      detail: "Minor delay — no action needed yet. Monitoring your connection.",
      actionRequired: false,
      delayMinutes: delay,
    };
  }

  return {
    type: "on_time",
    severity: "none",
    headline: "On time",
    detail: "Your flight is on schedule.",
    actionRequired: false,
    delayMinutes: 0,
  };
}

export function rankAlternatives(alternatives: AlternativeFlight[]): AlternativeFlight[] {
  return alternatives
    .sort((a, b) => {
      // Prioritize: fewest stops, then earliest departure, then price
      if (a.stops !== b.stops) return a.stops - b.stops;
      return new Date(a.departs).getTime() - new Date(b.departs).getTime();
    })
    .map((alt, i) => ({
      ...alt,
      recommendation: i === 0 ? "best" as const : i === 1 ? "good" as const : "backup" as const,
      reason: i === 0
        ? `Earliest available${alt.stops === 0 ? " · Nonstop" : ""}`
        : i === 1
        ? `Good option${alt.stops === 0 ? " · Nonstop" : " · 1 stop"}`
        : "Backup option",
    }));
}
