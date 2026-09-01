/**
 * Corner traffic + leave-home countdown for Map / Airport depart coach (I62).
 * Drive minutes only when a real OSRM/genome source is present — never invent traffic.
 *
 * leaveByUtcMs = be-at-airport time (airport buffer only, I32).
 * When driveMinutes is known, the countdown targets leave-home =
 * leaveByUtcMs − driveMinutes so traffic is included honestly.
 */

export type LeaveCountdownBadgeModel = {
  /** Top eyebrow, e.g. "Traffic" or "Leave by" */
  eyebrow: string;
  /** Primary line — traffic duration when known, else leave countdown */
  primaryLine: string;
  /** Secondary line — leave-home countdown when traffic known, else null */
  secondaryLine: string | null;
  /** Honesty footnote when traffic/drive is shown */
  honestyLine: string | null;
  /** Minutes until leave-home (or airport leave-by when no drive). Negative = past. */
  minsUntilLeave: number | null;
  /** True when the badge should render (depart + away + leave-by known). */
  visible: boolean;
};

function formatCountdown(minsUntil: number): string {
  if (minsUntil <= 0) return "Leave now";
  if (minsUntil < 60) return `Leave in ${minsUntil} min`;
  const h = Math.floor(minsUntil / 60);
  const m = minsUntil % 60;
  return m === 0 ? `Leave in ${h}h` : `Leave in ${h}h ${m}m`;
}

function formatDriveMinutes(driveMinutes: number): string {
  if (driveMinutes < 60) return `~${driveMinutes} min to airport`;
  const h = Math.floor(driveMinutes / 60);
  const m = driveMinutes % 60;
  if (m === 0) return `~${h}h to airport`;
  return `~${h}h ${m}m to airport`;
}

export function buildLeaveCountdownBadge(input: {
  /** Be-at-airport UTC (airport buffer only — I32). */
  leaveByUtcMs: number | null | undefined;
  /** Real OSRM/genome drive minutes; never invent. */
  driveMinutes?: number | null;
  nowMs?: number;
  /** Hide when already at/inside airport. */
  atAirport?: boolean;
}): LeaveCountdownBadgeModel {
  const nowMs = input.nowMs ?? Date.now();
  const leaveByUtcMs = input.leaveByUtcMs;
  if (
    input.atAirport ||
    leaveByUtcMs == null ||
    !Number.isFinite(leaveByUtcMs)
  ) {
    return {
      eyebrow: "",
      primaryLine: "",
      secondaryLine: null,
      honestyLine: null,
      minsUntilLeave: null,
      visible: false,
    };
  }

  const driveRaw = input.driveMinutes;
  const driveMinutes =
    typeof driveRaw === "number" && Number.isFinite(driveRaw) && driveRaw > 0
      ? Math.round(driveRaw)
      : null;

  // When we have a real drive ETA, count down to leave-home (airport arrive-by − drive).
  const leaveHomeUtcMs =
    driveMinutes != null ? leaveByUtcMs - driveMinutes * 60_000 : leaveByUtcMs;
  const minsUntilLeave = Math.round((leaveHomeUtcMs - nowMs) / 60_000);

  // Show from 8h out through a short grace after leave-home.
  if (minsUntilLeave > 8 * 60 || minsUntilLeave < -30) {
    return {
      eyebrow: "",
      primaryLine: "",
      secondaryLine: null,
      honestyLine: null,
      minsUntilLeave,
      visible: false,
    };
  }

  if (driveMinutes != null) {
    return {
      eyebrow: "Traffic",
      primaryLine: formatDriveMinutes(driveMinutes),
      secondaryLine: formatCountdown(minsUntilLeave),
      honestyLine: "Route estimate — not live traffic",
      minsUntilLeave,
      visible: true,
    };
  }

  return {
    eyebrow: "Leave by",
    primaryLine: formatCountdown(minsUntilLeave),
    secondaryLine: "Drive time not included yet",
    honestyLine: null,
    minsUntilLeave,
    visible: true,
  };
}
