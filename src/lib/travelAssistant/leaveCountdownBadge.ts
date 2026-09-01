/**
 * Corner traffic + leave-by countdown for Map / Airport depart coach (I62).
 * Drive minutes only when a real OSRM/genome source is present — never invent traffic.
 */

export type LeaveCountdownBadgeModel = {
  /** Short headline, e.g. "Leave in 42 min" or "Leave now" */
  leaveHeadline: string;
  /** Drive honesty line, e.g. "Drive ~45 min (route — not live traffic)" */
  driveSubline: string | null;
  /** Minutes until leave-by (negative = already past). */
  minsUntilLeave: number | null;
  /** True when the badge should render (depart + away + leave-by known). */
  visible: boolean;
};

export function buildLeaveCountdownBadge(input: {
  leaveByUtcMs: number | null | undefined;
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
      leaveHeadline: "",
      driveSubline: null,
      minsUntilLeave: null,
      visible: false,
    };
  }

  const minsUntilLeave = Math.round((leaveByUtcMs - nowMs) / 60_000);
  // Show from 8h out through a short grace after leave-by.
  if (minsUntilLeave > 8 * 60 || minsUntilLeave < -30) {
    return {
      leaveHeadline: "",
      driveSubline: null,
      minsUntilLeave,
      visible: false,
    };
  }

  let leaveHeadline: string;
  if (minsUntilLeave <= 0) {
    leaveHeadline = "Leave now";
  } else if (minsUntilLeave < 60) {
    leaveHeadline = `Leave in ${minsUntilLeave} min`;
  } else {
    const h = Math.floor(minsUntilLeave / 60);
    const m = minsUntilLeave % 60;
    leaveHeadline = m === 0 ? `Leave in ${h}h` : `Leave in ${h}h ${m}m`;
  }

  const driveRaw = input.driveMinutes;
  const driveMinutes =
    typeof driveRaw === "number" && Number.isFinite(driveRaw) && driveRaw > 0
      ? Math.round(driveRaw)
      : null;
  const driveSubline =
    driveMinutes != null
      ? `Drive ~${driveMinutes} min (route — not live traffic)`
      : null;

  return {
    leaveHeadline,
    driveSubline,
    minsUntilLeave,
    visible: true,
  };
}
