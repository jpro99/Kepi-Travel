/**
 * Kepi Airport Navigator — Boarding Pressure Index (spec §L.1).
 *
 * One continuously computed time budget behind every "calm urgency" behavior:
 *   spare = time-to-boarding-close − (security wait if landside) − walk-to-gate − buffer
 *
 * Everything reads from this: the header chip color, when Sprint Mode
 * self-suggests, lounge leave-by times, and Claude's spoken answers to
 * "do I have time for X?". One engine, many calm behaviors.
 *
 * Honesty: inputs carry their sources; the explanation line always shows
 * the math so the traveler can sanity-check it.
 */

export type BoardingVerdict = "comfortable" | "tight" | "sprint" | "at_risk";

export interface BoardingPressureInput {
  /** Minutes until scheduled departure. */
  minutesToDeparture: number;
  /** Boarding door typically closes this many minutes before departure. */
  boardingCloseLeadMin?: number;
  /** Current walk time to the gate, seconds — null when no route is computable. */
  walkToGateSeconds: number | null;
  /** Estimated security wait, seconds — 0 once airside. */
  securityWaitSeconds: number;
  throughSecurity: boolean;
  /** Personal slack — default 10 min. */
  bufferMin?: number;
}

export interface BoardingPressure {
  /** Minutes of slack after walk + security + buffer. Negative = at risk. */
  spareMinutes: number;
  verdict: BoardingVerdict;
  /** Minutes until the boarding door closes. */
  minutesToBoardingClose: number;
  /** Short human line, e.g. "32 min spare after the 9-min walk". */
  line: string;
  /** Full math, for the detail view / Claude context. */
  breakdown: string;
}

const DEFAULT_BOARDING_CLOSE_LEAD = 15;
const DEFAULT_BUFFER = 10;

export function computeBoardingPressure(input: BoardingPressureInput): BoardingPressure {
  const closeLead = input.boardingCloseLeadMin ?? DEFAULT_BOARDING_CLOSE_LEAD;
  const buffer = input.bufferMin ?? DEFAULT_BUFFER;
  const minutesToBoardingClose = input.minutesToDeparture - closeLead;
  const walkMin = input.walkToGateSeconds === null ? 0 : input.walkToGateSeconds / 60;
  const securityMin = input.throughSecurity ? 0 : input.securityWaitSeconds / 60;
  const spareExact = minutesToBoardingClose - walkMin - securityMin - buffer;
  const spareMinutes = Math.round(spareExact);

  let verdict: BoardingVerdict;
  if (spareMinutes >= 25) verdict = "comfortable";
  else if (spareMinutes >= 10) verdict = "tight";
  else if (spareMinutes >= 0) verdict = "sprint";
  else verdict = "at_risk";

  const walkPart = input.walkToGateSeconds === null ? "" : ` after the ${Math.max(1, Math.round(walkMin))}-min walk`;
  const securityPart = securityMin > 0 ? ` + ~${Math.round(securityMin)} min security` : "";
  const line =
    verdict === "at_risk"
      ? `Cutting it close — ${Math.abs(spareMinutes)} min short${walkPart}${securityPart}`
      : `${spareMinutes} min spare${walkPart}${securityPart}`;

  const breakdown =
    `boarding closes in ${Math.round(minutesToBoardingClose)} min` +
    ` − walk ${Math.round(walkMin)} min` +
    (securityMin > 0 ? ` − security ~${Math.round(securityMin)} min` : "") +
    ` − buffer ${buffer} min = ${spareMinutes} min spare`;

  return { spareMinutes, verdict, minutesToBoardingClose: Math.round(minutesToBoardingClose), line, breakdown };
}

export interface FitResult {
  fits: boolean;
  spareAfterMinutes: number;
  line: string;
}

/**
 * "Do I have time for X?" — the canonical answer.
 * Activity minutes come out of the spare budget; we keep a 5-min floor so
 * "fits" never means "fits with zero seconds to spare".
 */
export function canFitActivity(
  pressure: BoardingPressure,
  activity: { label: string; minutes: number },
): FitResult {
  const spareAfterMinutes = Math.round(pressure.spareMinutes - activity.minutes);
  const fits = spareAfterMinutes >= 5;
  const line = fits
    ? `Yes — ${activity.label} (~${activity.minutes} min) leaves you ${spareAfterMinutes} min of slack.`
    : pressure.spareMinutes > 0
    ? `Tight. ${activity.label} needs ~${activity.minutes} min but you only have ${pressure.spareMinutes} min spare — I'd skip it.`
    : `No — you're already ${Math.abs(pressure.spareMinutes)} min behind. Head to the gate.`;
  return { fits, spareAfterMinutes, line };
}
