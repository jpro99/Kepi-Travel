import {
  CALENDAR_SYNC_BACKGROUND_RETRY_MS,
  filterCalendarSyncReservations,
  shouldRetryCalendarSyncResponse,
  toCalendarSyncReservationPayload,
  type CalendarSyncReservationPayload,
} from "@/lib/travelAssistant/calendarSyncPayload";

export type CalendarSyncSource = "manual" | "background";

export type CalendarSyncFetchResult = {
  ok: boolean;
  status: number;
  payload: {
    ok?: boolean;
    error?: string;
    created?: number;
    updated?: number;
    skipped?: number;
    failed?: number;
    unavailable?: boolean;
  };
};

type SyncableReservation = {
  id: string;
  type: CalendarSyncReservationPayload["type"];
  title: string;
  confirmationCode?: string;
  localTime: string;
  location: string;
  timezone: string;
  provider?: string;
  notes?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export async function postCalendarSyncRequest(
  reservations: readonly SyncableReservation[],
): Promise<CalendarSyncFetchResult> {
  const syncable = filterCalendarSyncReservations(reservations);
  if (syncable.length === 0) {
    return {
      ok: true,
      status: 200,
      payload: { ok: true, created: 0, updated: 0, skipped: 0, failed: 0, unavailable: true },
    };
  }

  const response = await fetch("/api/travel-updates/calendar-sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      reservations: syncable.map(toCalendarSyncReservationPayload),
    }),
  });

  let payload: CalendarSyncFetchResult["payload"] = {};
  try {
    payload = (await response.json()) as CalendarSyncFetchResult["payload"];
  } catch {
    payload = {};
  }

  return {
    ok: response.ok && payload.ok !== false,
    status: response.status,
    payload,
  };
}

function isTransientCalendarSyncFailure(result: CalendarSyncFetchResult): boolean {
  if (!result.ok && shouldRetryCalendarSyncResponse(result.status)) {
    return true;
  }
  return false;
}

export async function runCalendarSyncWithRetries(
  reservations: readonly SyncableReservation[],
  reservationIds?: readonly string[],
): Promise<CalendarSyncFetchResult> {
  const targets = filterCalendarSyncReservations(reservations, reservationIds);
  if (targets.length === 0) {
    return {
      ok: true,
      status: 200,
      payload: { ok: true, created: 0, updated: 0, skipped: 0, failed: 0, unavailable: true },
    };
  }

  let lastResult = await postCalendarSyncRequest(targets);
  if (lastResult.ok || !isTransientCalendarSyncFailure(lastResult)) {
    return lastResult;
  }

  for (const delayMs of CALENDAR_SYNC_BACKGROUND_RETRY_MS) {
    await sleep(delayMs);
    lastResult = await postCalendarSyncRequest(targets);
    if (lastResult.ok || !isTransientCalendarSyncFailure(lastResult)) {
      return lastResult;
    }
  }

  return lastResult;
}

export function formatCalendarSyncSummary(payload: CalendarSyncFetchResult["payload"]): string {
  return `Calendar sync complete: ${payload.created ?? 0} created, ${payload.updated ?? 0} updated, ${payload.skipped ?? 0} skipped${
    payload.failed && payload.failed > 0 ? `, ${payload.failed} failed` : ""
  }.`;
}
