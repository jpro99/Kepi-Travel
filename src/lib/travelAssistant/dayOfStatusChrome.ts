/**
 * Day-of status chrome — badge-only soft updates; banner only for push cancel / gate-now.
 * Reinforces calm refresh: never block Home; no invented countdown without provenance.
 */

import {
  resolveFlightStatusDoor,
  resolveGateDoor,
  type FlightFactProvenance,
} from "@/lib/travelAssistant/dayOfDoorProvenance";

export interface DayOfStatusChromeInput {
  bookedStatus?: string | null;
  liveStatus?: string | null;
  liveCheckedAt?: string | null;
  liveError?: string | null;
  pushStatus?: string | null;
  pushGate?: string | null;
  bookedGate?: string | null;
  liveGate?: string | null;
  departureIata?: string | null;
}

export interface DayOfStatusBadge {
  label: string;
  tone: "neutral" | "watch" | "urgent";
  provenance: FlightFactProvenance;
}

export interface DayOfStatusBanner {
  title: string;
  body: string;
  kind: "cancel" | "gate-now";
}

export interface DayOfStatusChrome {
  badge: DayOfStatusBadge | null;
  banner: DayOfStatusBanner | null;
  showCountdown: boolean;
}

const CANCEL_RE = /\bcancel/i;
const GATE_NOW_RE = /\bgate\b.*\bnow\b|\bgate change\b|\bnew gate\b/i;

function isPushCancel(pushStatus: string): boolean {
  return CANCEL_RE.test(pushStatus);
}

function isPushGateNow(pushStatus: string, pushGate: string): boolean {
  if (pushGate.trim()) return true;
  return GATE_NOW_RE.test(pushStatus);
}

export function resolveDayOfStatusChrome(input: DayOfStatusChromeInput): DayOfStatusChrome {
  const pushStatus = (input.pushStatus ?? "").trim();
  const pushGate = (input.pushGate ?? "").trim();

  const statusDoor = resolveFlightStatusDoor({
    bookedStatus: input.bookedStatus,
    liveStatus: input.liveStatus,
    liveCheckedAt: input.liveCheckedAt,
    liveError: input.liveError,
    pushAlertStatus: pushStatus,
    departureIata: input.departureIata,
  });

  const gateDoor = resolveGateDoor({
    bookedGate: input.bookedGate,
    liveGate: input.liveGate,
    pushGate,
    departureIata: input.departureIata,
  });

  const showCountdown =
    statusDoor.showCountdown ||
    (gateDoor.showCountdown && gateDoor.provenance !== "UNVERIFIED");

  if (pushStatus && isPushCancel(pushStatus)) {
    return {
      badge: {
        label: "Cancelled",
        tone: "urgent",
        provenance: "ALERT_PUSH_STRING",
      },
      banner: {
        kind: "cancel",
        title: "Flight cancelled",
        body: pushStatus,
      },
      showCountdown: false,
    };
  }

  if (pushStatus && isPushGateNow(pushStatus, pushGate)) {
    const gateLabel = pushGate ? `Gate ${pushGate.toUpperCase()}` : gateDoor.line ?? "Gate update";
    return {
      badge: {
        label: pushGate ? `Gate ${pushGate.toUpperCase()}` : "Gate update",
        tone: "watch",
        provenance: "ALERT_PUSH_STRING",
      },
      banner: {
        kind: "gate-now",
        title: "Gate update",
        body: pushGate ? `${gateLabel} — ${pushStatus}` : pushStatus,
      },
      showCountdown: true,
    };
  }

  const badgeLine =
    gateDoor.provenance !== "UNVERIFIED" && gateDoor.line
      ? gateDoor.line.replace(/^Gate /u, "Gate ")
      : statusDoor.provenance !== "UNVERIFIED" && statusDoor.line
        ? statusDoor.line
        : null;

  if (!badgeLine) {
    return { badge: null, banner: null, showCountdown: false };
  }

  const provenance =
    gateDoor.provenance !== "UNVERIFIED" ? gateDoor.provenance : statusDoor.provenance;

  return {
    badge: {
      label: badgeLine,
      tone: provenance === "ALERT_PUSH_STRING" ? "watch" : "neutral",
      provenance,
    },
    banner: null,
    showCountdown,
  };
}
