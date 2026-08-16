import type { SuggestionOutcomeEvent } from "@/lib/travelAssistant/mlReadiness/types";

/** Impressions required before a truthful action may be marked amplify. */
export const NEURO_MIN_IMPRESSIONS = 5;

/** Rolling digest window. */
export const NEURO_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Shopping CTAs stay last even when they get more taps than See routes.
 * Amplifying "Search flights" taught the old ghost hop card.
 */
export const NEURO_LOCKED_LAST_KEYS = new Set(["search-flights"]);

export interface NeuroActionScore {
  suggestionKey: string;
  impressions: number;
  clicks: number;
  accepts: number;
  dismisses: number;
  /** (clicks + accepts) / impressions. 0 when never shown. */
  score: number;
  amplify: boolean;
  lockedLast: boolean;
}

export interface NeuroWeeklyDigest {
  weekStart: string;
  weekEnd: string;
  minImpressions: number;
  travelerType: string | null;
  rankedActions: NeuroActionScore[];
  winners: NeuroActionScore[];
  losers: NeuroActionScore[];
  ghostsExcluded: number;
  scoredEvents: number;
  byTravelerType: Record<string, { winners: NeuroActionScore[]; rankedActions: NeuroActionScore[] }>;
}

export interface ScoreNeuroLoopOptions {
  now?: Date;
  travelerType?: string | null;
  minImpressions?: number;
  windowMs?: number;
}

export function isHonestNeuroEvent(event: Pick<SuggestionOutcomeEvent, "metadata">): boolean {
  return event.metadata?.honest !== false;
}

export function isNeuroLockedLast(suggestionKey: string): boolean {
  return NEURO_LOCKED_LAST_KEYS.has(suggestionKey);
}

function asFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function eventTimeMs(event: SuggestionOutcomeEvent): number {
  const parsed = Date.parse(event.recordedAt);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function inWindow(event: SuggestionOutcomeEvent, startMs: number, endMs: number): boolean {
  const at = eventTimeMs(event);
  return at >= startMs && at <= endMs;
}

function matchesTravelerType(event: SuggestionOutcomeEvent, travelerType: string | null | undefined): boolean {
  if (!travelerType) return true;
  return event.metadata?.travelerType === travelerType;
}

function engagementScore(impressions: number, clicks: number, accepts: number): number {
  if (impressions <= 0) return 0;
  return (clicks + accepts) / impressions;
}

function toActionScore(
  suggestionKey: string,
  counts: { impressions: number; clicks: number; accepts: number; dismisses: number },
  minImpressions: number,
): NeuroActionScore {
  const lockedLast = isNeuroLockedLast(suggestionKey);
  const score = engagementScore(counts.impressions, counts.clicks, counts.accepts);
  return {
    suggestionKey,
    impressions: counts.impressions,
    clicks: counts.clicks,
    accepts: counts.accepts,
    dismisses: counts.dismisses,
    score,
    amplify: !lockedLast && counts.impressions >= minImpressions && score > 0,
    lockedLast,
  };
}

function rankActions(actions: NeuroActionScore[]): NeuroActionScore[] {
  const unlocked = actions
    .filter((row) => !row.lockedLast)
    .sort((a, b) => b.score - a.score || b.impressions - a.impressions || a.suggestionKey.localeCompare(b.suggestionKey));
  const locked = actions
    .filter((row) => row.lockedLast)
    .sort((a, b) => b.score - a.score || a.suggestionKey.localeCompare(b.suggestionKey));
  return [...unlocked, ...locked];
}

function tallyActions(events: SuggestionOutcomeEvent[], minImpressions: number): NeuroActionScore[] {
  const byKey = new Map<string, { impressions: number; clicks: number; accepts: number; dismisses: number }>();
  for (const event of events) {
    const current = byKey.get(event.suggestionKey) ?? {
      impressions: 0,
      clicks: 0,
      accepts: 0,
      dismisses: 0,
    };
    if (event.outcome === "impression") current.impressions += 1;
    else if (event.outcome === "click") current.clicks += 1;
    else if (event.outcome === "accept") current.accepts += 1;
    else if (event.outcome === "dismiss") current.dismisses += 1;
    byKey.set(event.suggestionKey, current);
  }
  return rankActions(
    [...byKey.entries()].map(([suggestionKey, counts]) => toActionScore(suggestionKey, counts, minImpressions)),
  );
}

function pickWinners(ranked: NeuroActionScore[]): NeuroActionScore[] {
  return ranked.filter((row) => row.amplify).slice(0, 5);
}

function pickLosers(ranked: NeuroActionScore[], minImpressions: number): NeuroActionScore[] {
  return ranked
    .filter((row) => !row.lockedLast && row.impressions >= minImpressions && !row.amplify)
    .slice(0, 5);
}

/**
 * Weekly feedback loop: measure honest taps, rank winners, never amplify ghosts
 * or lock-last shopping CTAs above See routes / ground.
 */
export function scoreNeuroLoop(
  events: SuggestionOutcomeEvent[],
  options: ScoreNeuroLoopOptions = {},
): NeuroWeeklyDigest {
  const now = options.now ?? new Date();
  const windowMs = asFiniteNumber(options.windowMs, NEURO_WEEK_MS);
  const minImpressions = Math.max(1, Math.floor(asFiniteNumber(options.minImpressions, NEURO_MIN_IMPRESSIONS)));
  const travelerType = options.travelerType?.trim() || null;
  const endMs = now.getTime();
  const startMs = endMs - windowMs;

  const windowEvents = events.filter((event) => inWindow(event, startMs, endMs));
  const ghostsExcluded = windowEvents.filter((event) => !isHonestNeuroEvent(event)).length;
  const honest = windowEvents.filter(
    (event) => isHonestNeuroEvent(event) && matchesTravelerType(event, travelerType),
  );
  const rankedActions = tallyActions(honest, minImpressions);

  const byTravelerType: NeuroWeeklyDigest["byTravelerType"] = {};
  if (!travelerType) {
    const types = new Set<string>();
    for (const event of windowEvents) {
      if (!isHonestNeuroEvent(event)) continue;
      const type = event.metadata?.travelerType;
      if (typeof type === "string" && type.trim()) types.add(type.trim());
    }
    for (const type of [...types].sort()) {
      const typed = tallyActions(
        windowEvents.filter(
          (event) => isHonestNeuroEvent(event) && event.metadata?.travelerType === type,
        ),
        minImpressions,
      );
      byTravelerType[type] = {
        rankedActions: typed,
        winners: pickWinners(typed),
      };
    }
  }

  return {
    weekStart: new Date(startMs).toISOString(),
    weekEnd: now.toISOString(),
    minImpressions,
    travelerType,
    rankedActions,
    winners: pickWinners(rankedActions),
    losers: pickLosers(rankedActions, minImpressions),
    ghostsExcluded,
    scoredEvents: honest.length,
    byTravelerType,
  };
}

export function mergeNeuroOutcomeMetadata(
  metadata: Record<string, string | number | boolean | null> | undefined,
  fields: { travelerType?: unknown; variant?: unknown; honest?: unknown },
): Record<string, string | number | boolean | null> | undefined {
  const next: Record<string, string | number | boolean | null> = { ...(metadata ?? {}) };
  if (typeof fields.travelerType === "string" && fields.travelerType.trim()) {
    next.travelerType = fields.travelerType.trim();
  }
  if (typeof fields.variant === "string" && fields.variant.trim()) {
    next.variant = fields.variant.trim();
  }
  if (typeof fields.honest === "boolean") {
    next.honest = fields.honest;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}
