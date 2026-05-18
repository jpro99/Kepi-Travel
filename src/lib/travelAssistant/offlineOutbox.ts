import { randomUUID } from "node:crypto";

export type OfflineOutboxStatus = "pending" | "synced" | "failed";

export interface OfflineOutboxEntry {
  id: string;
  key: string;
  message: string;
  fingerprint: string;
  reservationId: string | null;
  createdAt: string;
  status: OfflineOutboxStatus;
  attempts: number;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  syncedAt: string | null;
  error: string | null;
}

export interface OfflineOutboxSnapshot {
  entries: OfflineOutboxEntry[];
}

export function createOfflineOutboxSnapshot(): OfflineOutboxSnapshot {
  return { entries: [] };
}

function clampMaxEntries(value?: number): number {
  const candidate = value ?? 250;
  if (!Number.isFinite(candidate) || candidate < 20) return 20;
  if (candidate > 1000) return 1000;
  return Math.floor(candidate);
}

function toMs(iso: string | null): number {
  if (!iso) return Number.NaN;
  return Date.parse(iso);
}

export function countPendingOfflineOutboxEntries(snapshot: OfflineOutboxSnapshot): number {
  return snapshot.entries.filter((entry) => entry.status === "pending" || entry.status === "failed").length;
}

export function listPendingOfflineOutboxEntries(snapshot: OfflineOutboxSnapshot): OfflineOutboxEntry[] {
  return snapshot.entries.filter((entry) => entry.status === "pending" || entry.status === "failed");
}

export function appendOfflineOutboxEvent(args: {
  snapshot: OfflineOutboxSnapshot;
  nowIso: string;
  event: {
    key: string;
    message: string;
    fingerprint?: string;
    reservationId?: string | null;
  };
  dedupeWindowMs?: number;
  maxEntries?: number;
}): {
  snapshot: OfflineOutboxSnapshot;
  entry: OfflineOutboxEntry | null;
  duplicateSuppressed: boolean;
} {
  const dedupeWindowMs = args.dedupeWindowMs ?? 60_000;
  const maxEntries = clampMaxEntries(args.maxEntries);
  const nowMs = Date.parse(args.nowIso);
  const fingerprint = args.event.fingerprint ?? `${args.event.key}:${args.event.message.trim()}`;

  const duplicate = args.snapshot.entries.find((entry) => {
    if (entry.fingerprint !== fingerprint) return false;
    const ageMs = nowMs - Date.parse(entry.createdAt);
    return ageMs >= 0 && ageMs <= dedupeWindowMs;
  });
  if (duplicate) {
    return {
      snapshot: args.snapshot,
      entry: null,
      duplicateSuppressed: true,
    };
  }

  const entry: OfflineOutboxEntry = {
    id: randomUUID(),
    key: args.event.key,
    message: args.event.message,
    fingerprint,
    reservationId: args.event.reservationId ?? null,
    createdAt: args.nowIso,
    status: "pending",
    attempts: 0,
    lastAttemptAt: null,
    nextAttemptAt: null,
    syncedAt: null,
    error: null,
  };

  return {
    snapshot: {
      entries: [entry, ...args.snapshot.entries].slice(0, maxEntries),
    },
    entry,
    duplicateSuppressed: false,
  };
}

export function replayOfflineOutbox(args: {
  snapshot: OfflineOutboxSnapshot;
  nowIso: string;
  maxBatch?: number;
  backoffBaseMs?: number;
  backoffCapMs?: number;
  deliver?: (entry: OfflineOutboxEntry) => { ok: true } | { ok: false; error?: string };
}): {
  snapshot: OfflineOutboxSnapshot;
  replayed: number;
  failed: number;
  skipped: number;
} {
  const maxBatch = Math.max(1, Math.floor(args.maxBatch ?? 25));
  const backoffBaseMs = Math.max(250, Math.floor(args.backoffBaseMs ?? 2_000));
  const backoffCapMs = Math.max(backoffBaseMs, Math.floor(args.backoffCapMs ?? 120_000));
  const nowMs = Date.parse(args.nowIso);
  const deliver = args.deliver ?? (() => ({ ok: true as const }));

  const eligibleEntries = args.snapshot.entries
    .filter((entry) => entry.status === "pending" || entry.status === "failed")
    .filter((entry) => {
      const nextAttemptAtMs = toMs(entry.nextAttemptAt);
      return Number.isNaN(nextAttemptAtMs) || nextAttemptAtMs <= nowMs;
    })
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
    .slice(0, maxBatch);
  const eligibleSet = new Set(eligibleEntries.map((entry) => entry.id));

  let replayed = 0;
  let failed = 0;
  let skipped = 0;
  const updatedById = new Map<string, OfflineOutboxEntry>();
  eligibleEntries.forEach((entry) => {
    const outcome = deliver(entry);
    if (outcome.ok) {
      replayed += 1;
      updatedById.set(entry.id, {
        ...entry,
        status: "synced",
        attempts: entry.attempts + 1,
        lastAttemptAt: args.nowIso,
        nextAttemptAt: null,
        syncedAt: args.nowIso,
        error: null,
      });
      return;
    }

    failed += 1;
    const attemptNumber = entry.attempts + 1;
    const backoff = Math.min(backoffCapMs, backoffBaseMs * 2 ** Math.max(0, attemptNumber - 1));
    updatedById.set(entry.id, {
      ...entry,
      status: "failed",
      attempts: attemptNumber,
      lastAttemptAt: args.nowIso,
      nextAttemptAt: new Date(nowMs + backoff).toISOString(),
      error: outcome.error ?? "delivery-failed",
    });
  });

  const entries = args.snapshot.entries.map((entry) => {
    if (!eligibleSet.has(entry.id)) {
      if (entry.status === "pending" || entry.status === "failed") {
        skipped += 1;
      }
      return entry;
    }
    return updatedById.get(entry.id) ?? entry;
  });

  return {
    snapshot: { entries },
    replayed,
    failed,
    skipped,
  };
}
