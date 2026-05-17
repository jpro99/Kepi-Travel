import { createFlightStatusProviderFromEnv } from "@/lib/travelAssistant/providers/flightStatusProvider";
import { createMockTravelUpdateProvider } from "@/lib/travelAssistant/providers/mockTransportProvider";
import { createRailStatusProviderFromEnv } from "@/lib/travelAssistant/railStatusProvider";
import { createRideStatusProviderFromEnv } from "@/lib/travelAssistant/rideStatusProvider";
import type {
  TravelConflictResolutionSummary,
  TravelUpdateConflict,
  TravelProviderReport,
  TravelUpdateCheckResult,
  TravelUpdateEvent,
  TravelUpdateMode,
  TravelUpdateProvider,
  UpdatableReservation,
} from "@/lib/travelAssistant/travelUpdateTypes";

export type {
  TravelProviderReport,
  TravelUpdateCheckResult,
  TravelUpdateEvent,
  TravelUpdateMode,
  TravelUpdateProvider,
  UpdatableReservation,
};

export interface TravelUpdateCheckOptions {
  providerOverride?: TravelUpdateProvider | null;
  providersOverride?: readonly TravelUpdateProvider[];
  includeMockFallback?: boolean;
  maxAttempts?: number;
  baseDelayMs?: number;
  cooldownMs?: number;
  failureThreshold?: number;
  nowMs?: number;
  disableDelay?: boolean;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 300;
const DEFAULT_COOLDOWN_MS = 60_000;
const DEFAULT_FAILURE_THRESHOLD = 2;
const circuitStateByProvider = new Map<string, { consecutiveFailures: number; openUntilMs: number }>();
const PROVIDER_PRIORITY: Record<string, number> = {
  "flight-status-provider": 100,
  "rail-status-provider": 95,
  "ride-status-provider": 90,
  "mock-transport-adapter": 40,
};

type ConflictDomain = "status" | "timing" | "location";

function resolveProviders(
  mode: TravelUpdateMode,
  options?: TravelUpdateCheckOptions,
): readonly TravelUpdateProvider[] {
  if (options?.providersOverride && options.providersOverride.length > 0) {
    return options.providersOverride;
  }
  if (options?.providerOverride) {
    return [options.providerOverride];
  }
  if (mode === "off") {
    return [];
  }
  if (mode === "mock") {
    return [createMockTravelUpdateProvider()];
  }

  const providers: TravelUpdateProvider[] = [];
  const flightProvider = createFlightStatusProviderFromEnv();
  const railProvider = createRailStatusProviderFromEnv();
  const rideProvider = createRideStatusProviderFromEnv();
  if (flightProvider) providers.push(flightProvider);
  if (railProvider) providers.push(railProvider);
  if (rideProvider) providers.push(rideProvider);

  const includeMockFallback = options?.includeMockFallback ?? true;
  if (providers.length === 0 && includeMockFallback) {
    providers.push(createMockTravelUpdateProvider());
  }
  return providers;
}

function dedupeUpdates(updates: readonly TravelUpdateEvent[]): TravelUpdateEvent[] {
  const seen = new Set<string>();
  const unique: TravelUpdateEvent[] = [];
  updates.forEach((update) => {
    const key = [
      update.provider,
      update.kind,
      update.target.reservationType,
      update.target.confirmationCode ?? "",
      update.target.titleHint ?? "",
      update.delayMinutes ?? "",
      update.updatedLocation ?? "",
      update.summary,
    ].join("|");
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(update);
  });
  return unique;
}

function normalizeToken(value: string | undefined): string {
  if (!value) return "";
  return value.trim().toUpperCase();
}

function buildTargetKey(update: TravelUpdateEvent): string {
  const confirmation = normalizeToken(update.target.confirmationCode);
  const title = normalizeToken(update.target.titleHint);
  if (confirmation) {
    return `${update.target.reservationType}|cc:${confirmation}`;
  }
  if (title) {
    return `${update.target.reservationType}|th:${title}`;
  }
  return `${update.target.reservationType}|fallback:${normalizeToken(update.summary)}|${normalizeToken(update.provider)}`;
}

function domainForUpdate(update: TravelUpdateEvent): ConflictDomain {
  if (update.kind === "delay") return "timing";
  if (update.kind === "gate-change" || update.kind === "platform-change" || update.kind === "pickup-change") {
    return "location";
  }
  return "status";
}

function severityScore(update: TravelUpdateEvent): number {
  if (update.severity === "critical") return 3;
  if (update.severity === "warning") return 2;
  return 1;
}

function providerPriority(update: TravelUpdateEvent): number {
  return PROVIDER_PRIORITY[update.provider] ?? 60;
}

function compareDomainSpecific(
  candidate: TravelUpdateEvent,
  existing: TravelUpdateEvent,
  domain: ConflictDomain,
): { winner: TravelUpdateEvent; loser: TravelUpdateEvent; reason: string } {
  if (domain === "status") {
    const candidateCancellation = candidate.kind === "cancellation";
    const existingCancellation = existing.kind === "cancellation";
    if (candidateCancellation !== existingCancellation) {
      return candidateCancellation
        ? { winner: candidate, loser: existing, reason: "Cancellation status overrides non-cancellation status." }
        : { winner: existing, loser: candidate, reason: "Cancellation status overrides non-cancellation status." };
    }
  }

  if (domain === "timing") {
    const candidateDelay = candidate.delayMinutes ?? 0;
    const existingDelay = existing.delayMinutes ?? 0;
    if (candidateDelay !== existingDelay) {
      return candidateDelay > existingDelay
        ? { winner: candidate, loser: existing, reason: "Larger delay delta selected for conservative scheduling." }
        : { winner: existing, loser: candidate, reason: "Larger delay delta selected for conservative scheduling." };
    }
  }

  const candidateSeverity = severityScore(candidate);
  const existingSeverity = severityScore(existing);
  if (candidateSeverity !== existingSeverity) {
    return candidateSeverity > existingSeverity
      ? { winner: candidate, loser: existing, reason: "Higher severity update selected." }
      : { winner: existing, loser: candidate, reason: "Higher severity update selected." };
  }

  const candidateProviderPriority = providerPriority(candidate);
  const existingProviderPriority = providerPriority(existing);
  if (candidateProviderPriority !== existingProviderPriority) {
    return candidateProviderPriority > existingProviderPriority
      ? { winner: candidate, loser: existing, reason: "Higher-priority provider selected." }
      : { winner: existing, loser: candidate, reason: "Higher-priority provider selected." };
  }

  const candidateStableKey = `${candidate.provider}|${candidate.kind}|${candidate.summary}`;
  const existingStableKey = `${existing.provider}|${existing.kind}|${existing.summary}`;
  return candidateStableKey.localeCompare(existingStableKey) >= 0
    ? {
        winner: candidate,
        loser: existing,
        reason: "Deterministic lexical tie-breaker applied.",
      }
    : {
        winner: existing,
        loser: candidate,
        reason: "Deterministic lexical tie-breaker applied.",
      };
}

function resolveConflictingUpdates(updates: readonly TravelUpdateEvent[]): {
  resolvedUpdates: TravelUpdateEvent[];
  summary: TravelConflictResolutionSummary;
} {
  const winnersByDomain = new Map<string, TravelUpdateEvent>();
  const conflicts: TravelUpdateConflict[] = [];

  updates.forEach((update) => {
    const domain = domainForUpdate(update);
    const targetKey = buildTargetKey(update);
    const slotKey = `${targetKey}|${domain}`;
    const existing = winnersByDomain.get(slotKey);
    if (!existing) {
      winnersByDomain.set(slotKey, update);
      return;
    }
    const decision = compareDomainSpecific(update, existing, domain);
    winnersByDomain.set(slotKey, decision.winner);
    conflicts.push({
      targetKey,
      domain,
      winnerProvider: decision.winner.provider,
      loserProvider: decision.loser.provider,
      winnerKind: decision.winner.kind,
      loserKind: decision.loser.kind,
      reason: decision.reason,
    });
  });

  const resolvedUpdates = [...winnersByDomain.values()];
  return {
    resolvedUpdates,
    summary: {
      incomingUpdates: updates.length,
      acceptedUpdates: resolvedUpdates.length,
      suppressedUpdates: Math.max(0, updates.length - resolvedUpdates.length),
      conflicts,
    },
  };
}

function jitteredDelay(baseDelayMs: number, attempt: number): number {
  const exponential = baseDelayMs * 2 ** Math.max(0, attempt - 1);
  const jitter = Math.floor(Math.random() * Math.max(25, baseDelayMs / 2));
  return exponential + jitter;
}

async function waitMs(value: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, value));
}

function normalizeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Unknown provider failure";
}

export function resetTravelUpdateCircuitState(): void {
  circuitStateByProvider.clear();
}

async function runProviderCheckWithResilience({
  provider,
  reservations,
  nowIso,
  options,
}: {
  provider: TravelUpdateProvider;
  reservations: readonly UpdatableReservation[];
  nowIso: string;
  options?: TravelUpdateCheckOptions;
}): Promise<{ updates: TravelUpdateEvent[]; report: TravelProviderReport }> {
  const maxAttempts = Math.max(1, options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const baseDelayMs = Math.max(50, options?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS);
  const cooldownMs = Math.max(5_000, options?.cooldownMs ?? DEFAULT_COOLDOWN_MS);
  const failureThreshold = Math.max(1, options?.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD);
  const nowMs = options?.nowMs ?? Date.now();

  const circuitState = circuitStateByProvider.get(provider.name) ?? {
    consecutiveFailures: 0,
    openUntilMs: 0,
  };

  if (circuitState.openUntilMs > nowMs) {
    return {
      updates: [],
      report: {
        provider: provider.name,
        attempts: 0,
        updateCount: 0,
        circuitOpen: true,
        error: `Circuit open until ${new Date(circuitState.openUntilMs).toISOString()}`,
      },
    };
  }

  let attempts = 0;
  let lastError: string | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    attempts = attempt;
    try {
      const updates = dedupeUpdates(await provider.fetchUpdates({ reservations, nowIso }));
      circuitStateByProvider.set(provider.name, { consecutiveFailures: 0, openUntilMs: 0 });
      return {
        updates,
        report: {
          provider: provider.name,
          attempts,
          updateCount: updates.length,
          circuitOpen: false,
          error: null,
        },
      };
    } catch (error) {
      lastError = normalizeError(error);
      if (attempt < maxAttempts && !options?.disableDelay) {
        await waitMs(jitteredDelay(baseDelayMs, attempt));
      }
    }
  }

  const nextConsecutiveFailures = circuitState.consecutiveFailures + 1;
  const openUntilMs =
    nextConsecutiveFailures >= failureThreshold ? nowMs + cooldownMs : circuitState.openUntilMs;
  circuitStateByProvider.set(provider.name, {
    consecutiveFailures: nextConsecutiveFailures,
    openUntilMs,
  });

  return {
    updates: [],
    report: {
      provider: provider.name,
      attempts,
      updateCount: 0,
      circuitOpen: openUntilMs > nowMs,
      error: lastError ?? "Provider update check failed",
    },
  };
}

export async function runTravelUpdateCheck({
  mode,
  reservations,
  nowIso,
  options,
}: {
  mode: TravelUpdateMode;
  reservations: readonly UpdatableReservation[];
  nowIso: string;
  options?: TravelUpdateCheckOptions;
}): Promise<TravelUpdateCheckResult> {
  const providers = resolveProviders(mode, options);
  if (providers.length === 0) {
    return {
      mode,
      provider: null,
      updates: [],
      attempts: 0,
      circuitOpen: false,
      error: null,
      providerReports: [],
      conflictResolution: {
        incomingUpdates: 0,
        acceptedUpdates: 0,
        suppressedUpdates: 0,
        conflicts: [],
      },
    };
  }

  const providerReports: TravelProviderReport[] = [];
  const aggregateUpdates: TravelUpdateEvent[] = [];

  for (const provider of providers) {
    const providerResult = await runProviderCheckWithResilience({
      provider,
      reservations,
      nowIso,
      options,
    });
    providerReports.push(providerResult.report);
    aggregateUpdates.push(...providerResult.updates);
  }

  const conflictResolution = resolveConflictingUpdates(dedupeUpdates(aggregateUpdates));
  const hasSuccessfulProvider = providerReports.some(
    (report) => report.error === null && !report.circuitOpen,
  );
  const firstError = providerReports.find((report) => report.error)?.error ?? null;
  return {
    mode,
    provider: providers.map((provider) => provider.name).join(", "),
    updates: conflictResolution.resolvedUpdates,
    attempts: providerReports.reduce((sum, report) => sum + report.attempts, 0),
    circuitOpen: providerReports.some((report) => report.circuitOpen),
    error: hasSuccessfulProvider ? null : firstError,
    providerReports,
    conflictResolution: conflictResolution.summary,
  };
}
