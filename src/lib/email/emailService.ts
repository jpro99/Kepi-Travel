import "server-only";

import { createElement, type ReactElement } from "react";
import { buildIncidentAutopilotPlan } from "@/lib/travelAssistant/incidentAutopilot";
import { getUserPlan } from "@/lib/billing/planGate";
import { logger } from "@/lib/logger";
import { getResendClient, getResendFromEmail, isResendConfigured } from "@/lib/email/resendClient";
import {
  DisruptionAlertEmail,
  type DisruptionAlertTemplateProps,
} from "@/lib/email/templates/disruptionAlert";
import {
  ReservationConfirmationEmail,
  type ReservationConfirmationTemplateProps,
} from "@/lib/email/templates/reservationConfirmation";
import {
  ReferralRewardEmail,
  type ReferralRewardTemplateProps,
} from "@/lib/email/templates/referralReward";
import { TripSummaryEmail, type TripSummaryReservationItem } from "@/lib/email/templates/tripSummary";
import { WeeklyDigestEmail, type WeeklyDigestTripItem } from "@/lib/email/templates/weeklyDigest";
import { kvStoreGet, kvStoreSet, kvStoreSetNx } from "@/lib/travelAssistant/kvStore";
import { getTrip, listTrips, type TravelTrip } from "@/lib/travelAssistant/tripStore";

const EMAIL_PREFS_KEY = "email-prefs";
const TRIP_SUMMARY_SENT_KEY_PREFIX = "email-sent/trip-summary";
const DISRUPTION_ALERT_SENT_KEY_PREFIX = "email-sent/disruption";
const RESERVATION_CONFIRMATION_SENT_KEY_PREFIX = "email-sent/reservation-confirmation";
const WEEKLY_DIGEST_SENT_KEY_PREFIX = "email-sent/weekly-digest";
const REFERRAL_REWARD_SENT_KEY_PREFIX = "email-sent/referral-reward";

export interface EmailPreferences {
  unsubscribed: boolean;
  unsubscribedAt: string | null;
  updatedAt: string;
}

export interface EmailSendResult {
  status: "sent" | "skipped";
  reason: string;
  messageId?: string | null;
}

export interface DisruptionEmailInput {
  tripId?: string | null;
  tripName?: string;
  destination?: string;
  affectedReservationId?: string;
  affectedReservationTitle: string;
  disruptionType: string;
  severity: string;
  detail: string;
  scenario?: "none" | "missed-flight" | "train-delay" | "ride-no-show";
  recommendations?: string[];
}

export interface ReferralRewardEmailInput {
  role: "referrer" | "friend";
  referralCode: string;
  awardedDays: number;
  totalDaysEarned?: number;
}

function resolveAppBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    "http://localhost:3000"
  );
}

function buildUnsubscribeLink(userId: string): string {
  const base = resolveAppBaseUrl().replace(/\/$/u, "");
  return `${base}/api/email/unsubscribe?userId=${encodeURIComponent(userId)}`;
}

function parseDateLike(value: string): number {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

function formatIsoForCalendar(valueMs: number): string {
  return new Date(valueMs).toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
}

function toWeekKey(date = new Date()): string {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNumber = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

async function fetchDestinationWeather(destination: string): Promise<string | null> {
  const normalizedDestination = destination.trim();
  if (!normalizedDestination) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`https://wttr.in/${encodeURIComponent(normalizedDestination)}?format=j1`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: { "User-Agent": "kepi-travel-assistant/1.0" },
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as {
      current_condition?: Array<{ temp_C?: string; weatherDesc?: Array<{ value?: string }> }>;
    };
    const current = payload.current_condition?.[0];
    const temperature = current?.temp_C?.trim();
    const description = current?.weatherDesc?.[0]?.value?.trim();
    if (!temperature && !description) {
      return null;
    }
    if (temperature && description) {
      return `${description}, ${temperature}C`;
    }
    return description || (temperature ? `${temperature}C` : null);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveUserEmail(userId: string): Promise<string | null> {
  try {
    const clerkServer = await import("@clerk/nextjs/server");
    const client = await clerkServer.clerkClient();
    const user = await client.users.getUser(userId);
    const primaryId = user.primaryEmailAddressId;
    const primaryAddress =
      user.emailAddresses.find((entry) => entry.id === primaryId) ?? user.emailAddresses[0] ?? null;
    const address = primaryAddress?.emailAddress?.trim();
    return address && address.length > 0 ? address : null;
  } catch (error) {
    logger.warn("Unable to resolve user email from Clerk.", {
      scope: "email/emailService",
      userId,
      error,
    });
    return null;
  }
}

async function getOrCreateEmailPreferences(userId: string): Promise<EmailPreferences> {
  const stored = await kvStoreGet<Partial<EmailPreferences>>(EMAIL_PREFS_KEY, { userId });
  const nowIso = new Date().toISOString();
  return {
    unsubscribed: Boolean(stored?.unsubscribed),
    unsubscribedAt: typeof stored?.unsubscribedAt === "string" ? stored.unsubscribedAt : null,
    updatedAt: typeof stored?.updatedAt === "string" ? stored.updatedAt : nowIso,
  };
}

export async function setEmailUnsubscribed(userId: string, unsubscribed: boolean): Promise<EmailPreferences> {
  const nextPreferences: EmailPreferences = {
    unsubscribed,
    unsubscribedAt: unsubscribed ? new Date().toISOString() : null,
    updatedAt: new Date().toISOString(),
  };
  await kvStoreSet(EMAIL_PREFS_KEY, nextPreferences, { userId });
  return nextPreferences;
}

export async function getEmailPreferences(userId: string): Promise<EmailPreferences> {
  return getOrCreateEmailPreferences(userId);
}

async function shouldSkipEmail(userId: string): Promise<{ skip: boolean; reason: string; email: string | null }> {
  if (!isResendConfigured()) {
    return { skip: true, reason: "resend-unconfigured", email: null };
  }
  const preferences = await getOrCreateEmailPreferences(userId);
  if (preferences.unsubscribed) {
    return { skip: true, reason: "user-unsubscribed", email: null };
  }
  const email = await resolveUserEmail(userId);
  if (!email) {
    return { skip: true, reason: "missing-user-email", email: null };
  }
  return { skip: false, reason: "ok", email };
}

async function sendEmail(args: {
  userId: string;
  subject: string;
  react: ReactElement;
}): Promise<EmailSendResult> {
  const eligibility = await shouldSkipEmail(args.userId);
  if (eligibility.skip) {
    return { status: "skipped", reason: eligibility.reason };
  }
  const client = getResendClient();
  if (!client || !eligibility.email) {
    return { status: "skipped", reason: "resend-client-unavailable" };
  }
  try {
    const response = await client.emails.send({
      from: getResendFromEmail(),
      to: [eligibility.email],
      subject: args.subject,
      react: args.react,
    });
    const messageId = response.data?.id ?? null;
    return { status: "sent", reason: "ok", messageId };
  } catch (error) {
    logger.error("Failed to send transactional email via Resend.", error instanceof Error ? error : undefined, {
      scope: "email/emailService",
      userId: args.userId,
      subject: args.subject,
    });
    return { status: "skipped", reason: "send-failed" };
  }
}

function mapTripReservationsForSummary(trip: TravelTrip): TripSummaryReservationItem[] {
  return trip.reservations.map((reservation) => {
    const latestReservationUpdate = trip.updateFeed?.find((feed) => feed.reservationId === reservation.id);
    return {
      id: reservation.id,
      type: reservation.type,
      title: reservation.title,
      provider: reservation.provider,
      localTime: reservation.localTime,
      timezone: reservation.timezone,
      location: reservation.location,
      confirmationCode: reservation.confirmationCode,
      flightStatus: latestReservationUpdate ? latestReservationUpdate.summary : null,
    };
  });
}

function buildGoogleCalendarUrl(args: {
  title: string;
  location: string;
  detail: string;
  startMs: number;
  endMs: number;
}): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: args.title,
    dates: `${formatIsoForCalendar(args.startMs)}/${formatIsoForCalendar(args.endMs)}`,
    location: args.location,
    details: args.detail,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function buildAppleCalendarDataUrl(args: {
  title: string;
  location: string;
  detail: string;
  startMs: number;
  endMs: number;
}): string {
  const icsPayload = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kepi//Travel Assistant//EN",
    "BEGIN:VEVENT",
    `UID:${Date.now()}-${Math.random().toString(16).slice(2)}@kepi`,
    `DTSTAMP:${formatIsoForCalendar(Date.now())}`,
    `DTSTART:${formatIsoForCalendar(args.startMs)}`,
    `DTEND:${formatIsoForCalendar(args.endMs)}`,
    `SUMMARY:${args.title.replace(/\r?\n/gu, " ")}`,
    `LOCATION:${args.location.replace(/\r?\n/gu, " ")}`,
    `DESCRIPTION:${args.detail.replace(/\r?\n/gu, " ")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\n");
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(icsPayload)}`;
}

function buildDisruptionRecommendations(disruption: DisruptionEmailInput): string[] {
  if (disruption.recommendations && disruption.recommendations.length > 0) {
    return disruption.recommendations.slice(0, 3);
  }
  const scenario =
    disruption.scenario === "missed-flight" ||
    disruption.scenario === "train-delay" ||
    disruption.scenario === "ride-no-show"
      ? disruption.scenario
      : "none";
  const generated = buildIncidentAutopilotPlan({
    tripStage: "recovery",
    tripStatus: disruption.severity === "critical" ? "red" : "yellow",
    activeScenario: scenario,
    unresolvedReviewCount: 0,
    blockingIssueCount: disruption.severity === "critical" ? 2 : 1,
    dueReminderCount: 1,
    pendingSyncCount: 1,
    canSyncItineraryNow: true,
    providerCircuitOpen: false,
    opsHealth: disruption.severity === "critical" ? "red" : "yellow",
    workerHealth: "degraded",
  });
  if (generated.length === 0) {
    return [
      "Switch to recovery mode and verify your updated departure timeline.",
      "Trigger reminder escalation for affected family members.",
      "Run a live provider refresh and confirm fallback reservations.",
    ];
  }
  return generated.slice(0, 3).map((entry) => entry.title);
}

async function sendTripSummaryCore(userId: string, trip: TravelTrip): Promise<EmailSendResult> {
  const dedupeKey = `${TRIP_SUMMARY_SENT_KEY_PREFIX}/${trip.id}/${new Date().toISOString().slice(0, 10)}`;
  const firstSend = await kvStoreSetNx(dedupeKey, new Date().toISOString(), { userId });
  if (!firstSend) {
    return { status: "skipped", reason: "already-sent-today" };
  }

  const weatherSummary = await fetchDestinationWeather(trip.destination);
  const subject = `Kepi Trip Summary: ${trip.name} (${trip.destination})`;
  const departureDateLabel = trip.startDate || "Upcoming";
  const appBase = resolveAppBaseUrl().replace(/\/$/u, "");
  const template = (
    createElement(TripSummaryEmail, {
      tripName: trip.name,
      destination: trip.destination,
      departureDateLabel,
      weatherSummary,
      reservations: mapTripReservationsForSummary(trip),
      appLink: `${appBase}/travel-assistant`,
      unsubscribeLink: buildUnsubscribeLink(userId),
    })
  );
  return sendEmail({ userId, subject, react: template });
}

export async function sendTripSummary(userId: string, tripId: string): Promise<EmailSendResult> {
  const trip = await getTrip(tripId, userId);
  if (!trip) {
    return { status: "skipped", reason: "trip-not-found" };
  }
  return sendTripSummaryCore(userId, trip);
}

export async function sendDisruptionAlert(
  userId: string,
  disruption: DisruptionEmailInput,
): Promise<EmailSendResult> {
  const dedupeBucket = Math.floor(Date.now() / (30 * 60 * 1000));
  const dedupeKey = `${DISRUPTION_ALERT_SENT_KEY_PREFIX}/${dedupeBucket}/${disruption.tripId ?? "global"}/${
    disruption.affectedReservationId ?? disruption.affectedReservationTitle
  }/${disruption.disruptionType}`;
  const firstSend = await kvStoreSetNx(dedupeKey, new Date().toISOString(), { userId });
  if (!firstSend) {
    return { status: "skipped", reason: "duplicate-disruption-window" };
  }

  const appBase = resolveAppBaseUrl().replace(/\/$/u, "");
  const appLink = disruption.tripId
    ? `${appBase}/travel-assistant?tripId=${encodeURIComponent(disruption.tripId)}&mode=recovery`
    : `${appBase}/travel-assistant`;
  const recommendationList = buildDisruptionRecommendations(disruption);
  const templateProps: DisruptionAlertTemplateProps = {
    tripName: disruption.tripName ?? "Active trip",
    destination: disruption.destination ?? "Unknown destination",
    affectedReservationTitle: disruption.affectedReservationTitle,
    disruptionType: disruption.disruptionType,
    severity: disruption.severity,
    detail: disruption.detail,
    recommendations: recommendationList,
    appLink,
    unsubscribeLink: buildUnsubscribeLink(userId),
  };

  return sendEmail({
    userId,
    subject: `Kepi Disruption Alert: ${disruption.disruptionType.replaceAll("-", " ")}`,
    react: createElement(DisruptionAlertEmail, templateProps),
  });
}

export async function sendReservationConfirmation(userId: string, reservationId: string): Promise<EmailSendResult> {
  const dedupeKey = `${RESERVATION_CONFIRMATION_SENT_KEY_PREFIX}/${reservationId}`;
  const firstSend = await kvStoreSetNx(dedupeKey, new Date().toISOString(), { userId });
  if (!firstSend) {
    return { status: "skipped", reason: "already-confirmed" };
  }

  const trips = await listTrips(userId);
  let matchedTrip: TravelTrip | null = null;
  let matchedReservation: TravelTrip["reservations"][number] | null = null;
  for (const trip of trips) {
    const reservation = trip.reservations.find((entry) => entry.id === reservationId);
    if (reservation) {
      matchedTrip = trip;
      matchedReservation = reservation;
      break;
    }
  }

  if (!matchedTrip || !matchedReservation) {
    return { status: "skipped", reason: "reservation-not-found" };
  }

  const startMs = parseDateLike(matchedReservation.localTime);
  const normalizedStartMs = Number.isNaN(startMs) ? Date.now() + 60 * 60 * 1000 : startMs;
  const normalizedEndMs =
    matchedReservation.type === "hotel" ? normalizedStartMs + 12 * 60 * 60 * 1000 : normalizedStartMs + 60 * 60 * 1000;

  const appBase = resolveAppBaseUrl().replace(/\/$/u, "");
  const calendarDetail = `Confirmation ${matchedReservation.confirmationCode}. Added by Kepi review queue approval.`;
  const templateProps: ReservationConfirmationTemplateProps = {
    tripName: matchedTrip.name,
    reservationTitle: matchedReservation.title,
    reservationType: matchedReservation.type,
    provider: matchedReservation.provider,
    localTime: matchedReservation.localTime,
    timezone: matchedReservation.timezone,
    location: matchedReservation.location,
    confirmationCode: matchedReservation.confirmationCode,
    googleCalendarUrl: buildGoogleCalendarUrl({
      title: matchedReservation.title,
      location: matchedReservation.location,
      detail: calendarDetail,
      startMs: normalizedStartMs,
      endMs: normalizedEndMs,
    }),
    appleCalendarUrl: buildAppleCalendarDataUrl({
      title: matchedReservation.title,
      location: matchedReservation.location,
      detail: calendarDetail,
      startMs: normalizedStartMs,
      endMs: normalizedEndMs,
    }),
    appLink: `${appBase}/travel-assistant?tripId=${encodeURIComponent(matchedTrip.id)}`,
    unsubscribeLink: buildUnsubscribeLink(userId),
  };

  return sendEmail({
    userId,
    subject: `Reservation confirmed: ${matchedReservation.title}`,
    react: createElement(ReservationConfirmationEmail, templateProps),
  });
}

export async function sendWeeklyDigest(userId: string): Promise<EmailSendResult> {
  const weekKey = toWeekKey();
  const dedupeKey = `${WEEKLY_DIGEST_SENT_KEY_PREFIX}/${weekKey}`;
  const firstSend = await kvStoreSetNx(dedupeKey, new Date().toISOString(), { userId });
  if (!firstSend) {
    return { status: "skipped", reason: "already-sent-this-week" };
  }

  const trips = await listTrips(userId);
  const nowMs = Date.now();
  const next14DaysMs = nowMs + 14 * 24 * 60 * 60 * 1000;
  const upcomingTrips = trips
    .filter((trip) => {
      const startMs = parseDateLike(`${trip.startDate}T09:00:00Z`);
      if (Number.isNaN(startMs)) return false;
      return startMs >= nowMs && startMs <= next14DaysMs;
    })
    .map<WeeklyDigestTripItem>((trip) => ({
      id: trip.id,
      name: trip.name,
      destination: trip.destination,
      startDate: trip.startDate,
      endDate: trip.endDate,
      reservationCount: trip.reservations.length,
    }));

  const pendingReviewCount = trips.reduce((total, trip) => total + (trip.reviewQueue?.length ?? 0), 0);
  const plan = await getUserPlan(userId);
  const appBase = resolveAppBaseUrl().replace(/\/$/u, "");
  return sendEmail({
    userId,
    subject: "Kepi Weekly Digest: Your next 14 days",
    react: createElement(WeeklyDigestEmail, {
      upcomingTrips,
      pendingReviewCount,
      isFreePlan: plan === "free",
      appLink: `${appBase}/travel-assistant`,
      billingLink: `${appBase}/billing`,
      unsubscribeLink: buildUnsubscribeLink(userId),
    }),
  });
}

export async function sendTripSummaryForUpcomingDeparture(
  userId: string,
  nowMs = Date.now(),
): Promise<EmailSendResult[]> {
  const trips = await listTrips(userId);
  const results: EmailSendResult[] = [];
  for (const trip of trips) {
    const reservationDepartureCandidates = trip.reservations
      .filter((reservation) => reservation.type === "flight" || reservation.type === "train" || reservation.type === "ride")
      .map((reservation) => parseDateLike(reservation.localTime))
      .filter((value) => !Number.isNaN(value))
      .sort((left, right) => left - right);
    const fallbackStartMs = parseDateLike(`${trip.startDate}T09:00:00Z`);
    const departureMs = reservationDepartureCandidates[0] ?? fallbackStartMs;
    if (Number.isNaN(departureMs)) continue;
    const diffMs = departureMs - nowMs;
    if (diffMs > 0 && diffMs <= 24 * 60 * 60 * 1000) {
      results.push(await sendTripSummaryCore(userId, trip));
    }
  }
  return results;
}

export async function sendReferralRewardConfirmation(
  userId: string,
  payload: ReferralRewardEmailInput,
): Promise<EmailSendResult> {
  const dedupeKey = `${REFERRAL_REWARD_SENT_KEY_PREFIX}/${payload.role}/${payload.referralCode}/${payload.awardedDays}/${new Date().toISOString().slice(0, 10)}`;
  const firstSend = await kvStoreSetNx(dedupeKey, new Date().toISOString(), { userId });
  if (!firstSend) {
    return { status: "skipped", reason: "already-sent-today" };
  }
  const appBase = resolveAppBaseUrl().replace(/\/$/u, "");
  const templateProps: ReferralRewardTemplateProps = {
    headline:
      payload.role === "referrer"
        ? "You earned more Kepi Pro time"
        : "Welcome to Kepi Pro trial perks",
    intro:
      payload.role === "referrer"
        ? "A friend joined Kepi with your referral code. Your account has been credited."
        : "Your friend invited you to Kepi. Your account has been credited with free Pro time.",
    awardedDays: payload.awardedDays,
    totalDaysEarned: payload.totalDaysEarned,
    referralCode: payload.referralCode,
    appLink: `${appBase}/billing`,
    unsubscribeLink: buildUnsubscribeLink(userId),
  };
  return sendEmail({
    userId,
    subject:
      payload.role === "referrer"
        ? `Referral reward: +${payload.awardedDays} Pro days`
        : `Referral activated: +${payload.awardedDays} Pro days`,
    react: createElement(ReferralRewardEmail, templateProps),
  });
}
