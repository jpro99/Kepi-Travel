import { google, type calendar_v3 } from "googleapis";
import { logger } from "@/lib/logger";
import { kvStoreDel, kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";
import type { UpdatableReservationType } from "@/lib/travelAssistant/travelUpdateTypes";

type CalendarReservation = {
  id: string;
  type: UpdatableReservationType;
  title: string;
  confirmationCode: string;
  localTime: string;
  location: string;
  timezone: string;
  provider?: string;
  notes?: string;
};

type CalendarEventsApi = {
  insert(args: {
    calendarId: string;
    requestBody: calendar_v3.Schema$Event;
  }): Promise<{ data: { id?: string | null } }>;
  patch(args: {
    calendarId: string;
    eventId: string;
    requestBody: calendar_v3.Schema$Event;
  }): Promise<{ data: { id?: string | null } }>;
  delete(args: {
    calendarId: string;
    eventId: string;
  }): Promise<unknown>;
  list(args: {
    calendarId: string;
    privateExtendedProperty?: string;
    maxResults?: number;
    singleEvents?: boolean;
    showDeleted?: boolean;
  }): Promise<{ data: { items?: Array<{ id?: string | null } | null> | null } }>;
};

type CalendarClient = {
  events: CalendarEventsApi;
};

export type CalendarSyncStatus = "created" | "updated" | "skipped" | "failed";

export type CalendarSyncResult = {
  reservationId: string;
  eventId: string | null;
  status: CalendarSyncStatus;
};

export type CalendarBulkSyncResult = {
  totalReservations: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  results: CalendarSyncResult[];
};

interface CalendarSyncRecord {
  reservationId: string;
  eventId: string;
  fingerprint: string;
  syncedAt: string;
}

const CALENDAR_SYNC_KEY_PREFIX = "travel/calendar-sync/events/";
const CALENDAR_RESERVATION_PROPERTY_KEY = "kepi-reservation-id";
const DEFAULT_CALENDAR_ID = "primary";
const RESERVATION_DURATION_MINUTES: Record<UpdatableReservationType, number> = {
  flight: 120,
  train: 90,
  ride: 45,
  hotel: 1440,
  dinner: 120,
};
const RESERVATION_TYPE_PRESENTATION: Record<UpdatableReservationType, { emoji: string; label: string }> = {
  flight: { emoji: "✈️", label: "Flight" },
  hotel: { emoji: "🏨", label: "Hotel" },
  train: { emoji: "🚂", label: "Rail" },
  ride: { emoji: "🚗", label: "Ride" },
  dinner: { emoji: "🍽️", label: "Dinner" },
};

let calendarClientOverride: CalendarClient | null = null;

export function setCalendarClientForTests(client: CalendarClient | null): void {
  calendarClientOverride = client;
}

function sanitizeEnvNameSegment(value: string): string {
  return value.toUpperCase().replaceAll(/[^A-Z0-9]/g, "_");
}

function resolveUserToken(userId: string, key: "GOOGLE_CALENDAR_REFRESH_TOKEN" | "GOOGLE_CALENDAR_ACCESS_TOKEN"): string | null {
  const scopedKey = `${key}_${sanitizeEnvNameSegment(userId)}`;
  return process.env[scopedKey]?.trim() || process.env[key]?.trim() || null;
}

function resolveCalendarOAuthConfig(): { clientId: string; clientSecret: string; redirectUri: string } | null {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) {
    return null;
  }
  return { clientId, clientSecret, redirectUri };
}

function resolveCalendarId(): string {
  return process.env.GOOGLE_CALENDAR_ID?.trim() || DEFAULT_CALENDAR_ID;
}

function createAuthorizedCalendarClient(userId: string): CalendarClient | null {
  if (calendarClientOverride) {
    return calendarClientOverride;
  }

  const oauthConfig = resolveCalendarOAuthConfig();
  if (!oauthConfig) {
    return null;
  }

  const refreshToken = resolveUserToken(userId, "GOOGLE_CALENDAR_REFRESH_TOKEN");
  const accessToken = resolveUserToken(userId, "GOOGLE_CALENDAR_ACCESS_TOKEN");
  if (!refreshToken && !accessToken) {
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(
    oauthConfig.clientId,
    oauthConfig.clientSecret,
    oauthConfig.redirectUri,
  );
  oauth2Client.setCredentials({
    access_token: accessToken ?? undefined,
    refresh_token: refreshToken ?? undefined,
  });

  return google.calendar({
    version: "v3",
    auth: oauth2Client,
  }) as unknown as CalendarClient;
}

function reservationSyncKey(reservationId: string): string {
  return `${CALENDAR_SYNC_KEY_PREFIX}${encodeURIComponent(reservationId)}`;
}

async function readSyncRecord(userId: string, reservationId: string): Promise<CalendarSyncRecord | null> {
  return kvStoreGet<CalendarSyncRecord>(reservationSyncKey(reservationId), { userId });
}

async function writeSyncRecord(args: {
  userId: string;
  reservationId: string;
  eventId: string;
  fingerprint: string;
}): Promise<void> {
  await kvStoreSet(
    reservationSyncKey(args.reservationId),
    {
      reservationId: args.reservationId,
      eventId: args.eventId,
      fingerprint: args.fingerprint,
      syncedAt: new Date().toISOString(),
    } satisfies CalendarSyncRecord,
    { userId: args.userId },
  );
}

async function deleteSyncRecord(userId: string, reservationId: string): Promise<void> {
  await kvStoreDel(reservationSyncKey(reservationId), { userId });
}

function toTitleCaseWord(value: string): string {
  return value.length === 0 ? value : `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function parseLocalDateTime(localTime: string): { year: number; month: number; day: number; hour: number; minute: number } | null {
  const parsed = localTime.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/u);
  if (!parsed) {
    return null;
  }
  return {
    year: Number(parsed[1]),
    month: Number(parsed[2]),
    day: Number(parsed[3]),
    hour: Number(parsed[4]),
    minute: Number(parsed[5]),
  };
}

function formatUtcDateTimeWithoutZone(value: Date): string {
  const year = value.getUTCFullYear();
  const month = `${value.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${value.getUTCDate()}`.padStart(2, "0");
  const hour = `${value.getUTCHours()}`.padStart(2, "0");
  const minute = `${value.getUTCMinutes()}`.padStart(2, "0");
  const second = `${value.getUTCSeconds()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
}

function deriveStartDateTime(localTime: string): string {
  const parsed = parseLocalDateTime(localTime);
  if (parsed) {
    const normalized = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, parsed.hour, parsed.minute, 0));
    return formatUtcDateTimeWithoutZone(normalized);
  }
  const fallback = Date.parse(localTime);
  if (!Number.isNaN(fallback)) {
    return formatUtcDateTimeWithoutZone(new Date(fallback));
  }
  return formatUtcDateTimeWithoutZone(new Date());
}

function deriveEndDateTime(startDateTime: string, reservationType: UpdatableReservationType): string {
  const start = Date.parse(`${startDateTime}Z`);
  if (Number.isNaN(start)) {
    return startDateTime;
  }
  const durationMinutes = RESERVATION_DURATION_MINUTES[reservationType] ?? 60;
  return formatUtcDateTimeWithoutZone(new Date(start + durationMinutes * 60_000));
}

function buildCalendarSummary(reservation: CalendarReservation): string {
  const presentation = RESERVATION_TYPE_PRESENTATION[reservation.type];
  const label = presentation?.label ?? toTitleCaseWord(reservation.type);
  const emoji = presentation?.emoji ?? "📍";
  return `${emoji} ${label} ${reservation.title}`.trim();
}

function buildDescription(reservation: CalendarReservation): string {
  const lines = [
    `Confirmation number: ${reservation.confirmationCode}`,
    `Booking reference: ${reservation.confirmationCode}`,
    `Kepi reservation ID: ${reservation.id}`,
  ];
  if (reservation.provider) {
    lines.push(`Provider: ${reservation.provider}`);
  }
  if (reservation.notes?.trim()) {
    lines.push(`Notes: ${reservation.notes.trim()}`);
  }
  return lines.join("\n");
}

function buildReservationFingerprint(reservation: CalendarReservation): string {
  return JSON.stringify({
    type: reservation.type,
    title: reservation.title,
    confirmationCode: reservation.confirmationCode,
    localTime: reservation.localTime,
    timezone: reservation.timezone,
    location: reservation.location,
    provider: reservation.provider ?? "",
    notes: reservation.notes ?? "",
  });
}

function buildCalendarEventRequest(reservation: CalendarReservation): calendar_v3.Schema$Event {
  const startDateTime = deriveStartDateTime(reservation.localTime);
  const endDateTime = deriveEndDateTime(startDateTime, reservation.type);
  return {
    summary: buildCalendarSummary(reservation),
    location: reservation.location,
    description: buildDescription(reservation),
    start: {
      dateTime: startDateTime,
      timeZone: reservation.timezone,
    },
    end: {
      dateTime: endDateTime,
      timeZone: reservation.timezone,
    },
    extendedProperties: {
      private: {
        [CALENDAR_RESERVATION_PROPERTY_KEY]: reservation.id,
      },
    },
  };
}

async function findEventIdByReservationId(args: {
  calendarClient: CalendarClient;
  calendarId: string;
  reservationId: string;
}): Promise<string | null> {
  const response = await args.calendarClient.events.list({
    calendarId: args.calendarId,
    privateExtendedProperty: `${CALENDAR_RESERVATION_PROPERTY_KEY}=${args.reservationId}`,
    maxResults: 1,
    singleEvents: true,
    showDeleted: false,
  });
  const match = response.data.items?.find((item) => typeof item?.id === "string" && item.id.length > 0);
  return match?.id ?? null;
}

async function syncReservationWithClient(args: {
  userId: string;
  reservation: CalendarReservation;
  calendarClient: CalendarClient;
}): Promise<CalendarSyncResult> {
  const reservation = args.reservation;
  const reservationId = reservation.id;
  const calendarId = resolveCalendarId();
  const fingerprint = buildReservationFingerprint(reservation);
  try {
    const existingRecord = await readSyncRecord(args.userId, reservationId);
    let eventId = existingRecord?.eventId ?? null;
    if (!eventId) {
      eventId = await findEventIdByReservationId({
        calendarClient: args.calendarClient,
        calendarId,
        reservationId,
      });
    }

    const eventBody = buildCalendarEventRequest(reservation);
    if (eventId) {
      const updateResponse = await args.calendarClient.events.patch({
        calendarId,
        eventId,
        requestBody: eventBody,
      });
      const resolvedEventId = updateResponse.data.id ?? eventId;
      await writeSyncRecord({
        userId: args.userId,
        reservationId,
        eventId: resolvedEventId,
        fingerprint,
      });
      return {
        reservationId,
        eventId: resolvedEventId,
        status: "updated",
      };
    }

    const createResponse = await args.calendarClient.events.insert({
      calendarId,
      requestBody: eventBody,
    });
    const createdEventId = createResponse.data.id;
    if (!createdEventId) {
      throw new Error("Calendar API did not return an event id.");
    }
    await writeSyncRecord({
      userId: args.userId,
      reservationId,
      eventId: createdEventId,
      fingerprint,
    });
    return {
      reservationId,
      eventId: createdEventId,
      status: "created",
    };
  } catch (error) {
    logger.warn("Calendar reservation sync failed; continuing without throwing.", {
      scope: "travelAssistant/calendarSyncService",
      userId: args.userId,
      reservationId,
      error,
    });
    return {
      reservationId,
      eventId: null,
      status: "failed",
    };
  }
}

export async function syncReservationToCalendar(userId: string, reservation: CalendarReservation): Promise<CalendarSyncResult> {
  const calendarClient = createAuthorizedCalendarClient(userId);
  if (!calendarClient) {
    logger.warn("Calendar sync unavailable; missing OAuth credentials or authorization token.", {
      scope: "travelAssistant/calendarSyncService",
      userId,
      reservationId: reservation.id,
    });
    return {
      reservationId: reservation.id,
      eventId: null,
      status: "failed",
    };
  }

  return syncReservationWithClient({
    userId,
    reservation,
    calendarClient,
  });
}

export async function deleteCalendarEvent(userId: string, reservationId: string): Promise<boolean> {
  const calendarClient = createAuthorizedCalendarClient(userId);
  if (!calendarClient) {
    logger.warn("Calendar delete unavailable; missing OAuth credentials or authorization token.", {
      scope: "travelAssistant/calendarSyncService",
      userId,
      reservationId,
    });
    return false;
  }

  const calendarId = resolveCalendarId();
  try {
    const existingRecord = await readSyncRecord(userId, reservationId);
    let eventId = existingRecord?.eventId ?? null;
    if (!eventId) {
      eventId = await findEventIdByReservationId({
        calendarClient,
        calendarId,
        reservationId,
      });
    }
    if (!eventId) {
      await deleteSyncRecord(userId, reservationId);
      return false;
    }

    await calendarClient.events.delete({
      calendarId,
      eventId,
    });
    await deleteSyncRecord(userId, reservationId);
    return true;
  } catch (error) {
    logger.warn("Calendar event delete failed; continuing without throwing.", {
      scope: "travelAssistant/calendarSyncService",
      userId,
      reservationId,
      error,
    });
    return false;
  }
}

export async function syncAllReservations(
  userId: string,
  reservations: readonly CalendarReservation[],
): Promise<CalendarBulkSyncResult> {
  const results: CalendarSyncResult[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const reservation of reservations) {
    const fingerprint = buildReservationFingerprint(reservation);
    const existingRecord = await readSyncRecord(userId, reservation.id);
    if (existingRecord?.fingerprint === fingerprint) {
      results.push({
        reservationId: reservation.id,
        eventId: existingRecord.eventId,
        status: "skipped",
      });
      skipped += 1;
      continue;
    }

    const syncResult = await syncReservationToCalendar(userId, reservation);
    results.push(syncResult);
    if (syncResult.status === "created") {
      created += 1;
    } else if (syncResult.status === "updated") {
      updated += 1;
    } else if (syncResult.status === "skipped") {
      skipped += 1;
    } else {
      failed += 1;
    }
  }

  return {
    totalReservations: reservations.length,
    created,
    updated,
    skipped,
    failed,
    results,
  };
}
