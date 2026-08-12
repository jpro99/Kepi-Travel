/**
 * Consumer disruption copy: one calm next action, no alarmist headlines.
 * G20 — delay/connection help is factual; lab simulation stays out of production.
 */

export type DisruptionCalmKind = "cancel" | "delay" | "connection" | "none";

const ALARMIST =
  /\billegal\b|\bimpossible\b|rebook immediately|connection issue|flight problem|connection problem|flight issue/iu;

export function disruptionCopyIsCalm(text: string): boolean {
  return !ALARMIST.test(text);
}

export function showDisruptionLabControls(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  return nodeEnv !== "production";
}

export function disruptionCalmKind(input: {
  cancelled?: boolean;
  delayed?: boolean;
  delayMinutes?: number | null;
  connectionConflict?: boolean;
}): DisruptionCalmKind {
  if (input.cancelled) return "cancel";
  if (input.delayed || (typeof input.delayMinutes === "number" && input.delayMinutes > 0)) {
    return "delay";
  }
  if (input.connectionConflict) return "connection";
  return "none";
}

const BADGE_AMBER =
  "rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-500/20 dark:text-amber-100";

export function disruptionCalmBadge(kind: DisruptionCalmKind): {
  label: string;
  className: string;
} | null {
  if (kind === "cancel") return { label: "Cancelled", className: BADGE_AMBER };
  if (kind === "delay") return { label: "Delayed", className: BADGE_AMBER };
  if (kind === "connection") return { label: "Short layover", className: BADGE_AMBER };
  return null;
}

export function disruptionCalmFooterCta(kind: DisruptionCalmKind): string | null {
  if (kind === "connection") return "Review layover times →";
  if (kind === "delay" || kind === "cancel") return "Check this flight →";
  return null;
}

export function disruptionCalmHomeCopy(input: {
  kind: Exclude<DisruptionCalmKind, "none">;
  flightLabel: string;
  delayMinutes?: number | null;
  gate?: string | null;
}): { title: string; detail: string; ctaLabel: string } {
  const label = input.flightLabel.trim() || "Flight";
  if (input.kind === "cancel") {
    return {
      title: `${label} was cancelled`,
      detail: "Your airline handles rebooking on this ticket — Kepi will not invent replacement flights.",
      ctaLabel: "Open flight",
    };
  }
  if (input.kind === "delay") {
    const mins =
      typeof input.delayMinutes === "number" && input.delayMinutes > 0
        ? `${input.delayMinutes} min late`
        : "running late";
    return {
      title: `${label} is ${mins}`,
      detail: input.gate?.trim()
        ? `Check gate ${input.gate.trim()} and layover time before you leave.`
        : "Check gate and layover time before you leave.",
      ctaLabel: "Open flight",
    };
  }
  return {
    title: "Short layover",
    detail: "Worth a quick look — confirm times with your airline.",
    ctaLabel: "Review connection",
  };
}

export function itineraryConnectionSelfCheckQuestion(): string {
  return "Do your booked flights connect with enough time?";
}

export function connectionConflictCalmLine(count = 1): string {
  return count === 1
    ? "Short layover — worth a quick look."
    : `${count} short layovers — worth a quick look.`;
}
