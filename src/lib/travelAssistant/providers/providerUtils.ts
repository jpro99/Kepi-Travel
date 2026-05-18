import { z } from "zod";

export const PROVIDER_TIMEOUT_MS = 6_000;
const MAX_DELAY_MINUTES = 12 * 60;

export function normalizeProviderCode(value: string): string {
  return value.trim().toUpperCase();
}

export function normalizeLocationToken(value: string): string {
  return value.trim().replaceAll(/\s+/g, " ").toUpperCase();
}

export function clampDelayMinutes(value: number | undefined): number | undefined {
  if (typeof value !== "number" || Number.isNaN(value)) return undefined;
  return Math.max(0, Math.min(MAX_DELAY_MINUTES, Math.round(value)));
}

export function ensureSummary(value: string | undefined, fallback: string): string {
  const clean = value?.trim();
  return clean && clean.length > 0 ? clean : fallback;
}

export function createTimeoutSignal(timeoutMs = PROVIDER_TIMEOUT_MS): AbortSignal {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(timeoutMs);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

export function parseProviderEvents<T>({
  payload,
  eventSchema,
}: {
  payload: unknown;
  eventSchema: z.ZodType<T>;
}): { validEvents: T[]; invalidCount: number; totalCount: number } {
  const envelope = z.object({ events: z.array(z.unknown()) }).parse(payload);
  const validEvents: T[] = [];
  let invalidCount = 0;
  envelope.events.forEach((rawEvent) => {
    const parsed = eventSchema.safeParse(rawEvent);
    if (!parsed.success) {
      invalidCount += 1;
      return;
    }
    validEvents.push(parsed.data);
  });
  return { validEvents, invalidCount, totalCount: envelope.events.length };
}
