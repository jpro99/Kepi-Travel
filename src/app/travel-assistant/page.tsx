"use client";

import { cache, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  enforceStatusFloor,
  evaluateTravelStatusGovernance,
} from "@/lib/travelAssistant/safetyPolicy";
import { evaluateReservationIntegrity } from "@/lib/travelAssistant/reservationIntegrity";
import {
  nextTripStage,
  shouldQuickAddGoToReview,
  shouldShowFocusPanel,
  type TripFlowStage,
} from "@/lib/travelAssistant/tripFlowControls";
import {
  appendOfflineOutboxEvent,
  countPendingOfflineOutboxEntries,
  createOfflineOutboxSnapshot,
  listPendingOfflineOutboxEntries,
  replayOfflineOutbox,
  type OfflineOutboxSnapshot,
} from "@/lib/travelAssistant/offlineOutbox";
import {
  parseTravelClientSessionState,
  stringifyTravelClientSessionState,
} from "@/lib/travelAssistant/clientSessionState";
import {
  buildIncidentAutopilotPlan,
  type IncidentAutopilotAction,
  type IncidentAutopilotRecommendation,
} from "@/lib/travelAssistant/incidentAutopilot";
import type {
  TravelOpsSnapshot,
  TravelUpdateAuditSummary,
  TravelConflictResolutionSummary,
  TravelProviderReport,
  TravelUpdateCheckResult,
  TravelUpdateEvent,
  TravelUpdateKind,
  TravelUpdateMode,
  TravelUpdateSeverity,
} from "@/lib/travelAssistant/travelUpdateTypes";
import { ConnectivityPanel } from "@/components/travelAssistant/ConnectivityPanel";
import { AISuggestionPanel } from "@/components/travelAssistant/AISuggestionPanel";
import { InstallPrompt } from "@/components/InstallPrompt";
import { QuickAddLane } from "@/components/travelAssistant/QuickAddLane";
import { ReservationList } from "@/components/travelAssistant/ReservationList";
import { ReviewQueue } from "@/components/travelAssistant/ReviewQueue";
import { TripOrientationCard } from "@/components/travelAssistant/TripOrientationCard";
import { JourneyFlowPanel } from "./components/JourneyFlowPanel";
import { TravelAssistantTopControls } from "./components/TravelAssistantTopControls";

const OpsPanel = lazy(async () => {
  const loadedModule = await import("@/components/travelAssistant/OpsPanel");
  return { default: loadedModule.OpsPanel };
});
const FamilyPanel = lazy(async () => {
  const loadedModule = await import("@/components/travelAssistant/FamilyPanel");
  return { default: loadedModule.FamilyPanel };
});
const DisruptionRecovery = lazy(async () => {
  const loadedModule = await import("@/components/travelAssistant/DisruptionRecovery");
  return { default: loadedModule.DisruptionRecovery };
});

type TripStage = TripFlowStage;
type TripStatus = "green" | "yellow" | "red";
type NetworkMode = "wifi" | "cellular" | "offline";
type ReservationType = "flight" | "hotel" | "train" | "ride" | "dinner";
type Confidence = "high" | "medium" | "low";
type GuidanceTone = "subtle" | "standard";
type MobileViewPanel = "essentials" | "timeline" | "recovery" | "family" | "all";
type DemoPresetId = "smooth-trip" | "moderate-delay" | "severe-disruption";
type VisibilityMode = "all-members" | "organizer-only";
type DisruptionScenario = "none" | "missed-flight" | "train-delay" | "ride-no-show";

interface LocationPoint {
  lat: number;
  lon: number;
  updatedAt: string;
}

interface FamilyMember {
  id: string;
  name: string;
  role: "organizer" | "adult" | "teen";
  color: string;
  sharingEnabled: boolean;
  visibility: VisibilityMode;
  location: LocationPoint;
}

interface ReservationDraft {
  type: ReservationType;
  title: string;
  provider: string;
  localTime: string;
  timezone: string;
  location: string;
  confirmationCode: string;
  assignedTo: string[];
  stage: TripStage;
  critical: boolean;
  confidence: Confidence;
  notes: string;
}

interface Reservation extends ReservationDraft {
  id: string;
  source: "imported" | "manual" | "review-accepted";
}

interface ReviewItem {
  id: string;
  reasons: string[];
  impact: string;
  draft: ReservationDraft;
  sourceEmailSubject: string;
}

interface ReadinessItem {
  id: string;
  category: string;
  title: string;
  complete: boolean;
  required: boolean;
}

interface EmailSample {
  id: string;
  sender: string;
  receivedAt: string;
  subject: string;
  body: string;
  parsed: ReservationDraft;
  confidence: Confidence;
  issues: string[];
}

interface GmailImportedReservation {
  messageId: string;
  sender: string;
  subject: string;
  receivedAt: string;
  body: string;
  reservation: {
    type: "flight" | "hotel" | "train" | "ride";
    title: string;
    provider: string;
    localTime: string;
    timezone: string;
    location: string;
    confirmationCode: string;
    confidence: Confidence;
    issues: string[];
  };
}

interface DrawerState {
  kind: "reservation" | "review";
  id: string;
}

interface ExportRow {
  owner: string;
  itemType: string;
  title: string;
  provider: string;
  localTime: string;
  timezone: string;
  location: string;
  confirmation: string;
  notes: string;
}

interface ReminderMilestone {
  label: string;
  thresholdMinutes: number;
}

interface TimelineIssue {
  id: string;
  severity: "high" | "medium";
  message: string;
  recommendation: string;
}

interface StageFlowCard {
  stage: TripStage;
  objective: string;
  easiestInput: string;
  mustConfirm: string;
  exitCheck: string;
}

interface UndoSnapshot {
  id: string;
  label: string;
  capturedAt: string;
  tripStage: TripStage;
  tripStatus: TripStatus;
  minutesToDeparture: number;
  activeScenario: DisruptionScenario;
  reservations: Reservation[];
  reviewQueue: ReviewItem[];
  readinessItems: ReadinessItem[];
}

interface UndoAuditEntry {
  id: string;
  action: string;
  undoneAt: string;
}

interface DemoPresetConfig {
  id: DemoPresetId;
  label: string;
  summary: string;
}

interface UpdateFeedItem {
  id: string;
  reservationId: string;
  kind: TravelUpdateKind;
  severity: TravelUpdateSeverity;
  summary: string;
  detail: string;
  provider: string;
  appliedAt: string;
}

const fetchInitialOpsSnapshotCached = cache(async (): Promise<TravelOpsSnapshot> => {
  const response = await fetch("/api/travel-updates/ops?limit=12", {
    method: "GET",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Ops API returned ${response.status}`);
  }
  return (await response.json()) as TravelOpsSnapshot;
});

function LazyPanelSkeleton({ label }: { label: string }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
      {label}
    </section>
  );
}

const STAGES: TripStage[] = ["readiness", "pre-departure", "airport", "arrival", "recovery"];
const STATUS_BADGE: Record<TripStatus, string> = {
  green: "bg-emerald-500/20 text-emerald-200 ring-emerald-400/40",
  yellow: "bg-amber-500/20 text-amber-200 ring-amber-400/40",
  red: "bg-red-500/20 text-red-200 ring-red-400/40",
};

const STAGE_LABEL: Record<TripStage, string> = {
  readiness: "Readiness",
  "pre-departure": "Pre-departure",
  airport: "Airport",
  arrival: "Arrival",
  recovery: "Recovery",
};

const STAGE_OBJECTIVES: Record<TripStage, string> = {
  readiness: "Capture every reservation quickly and resolve unknowns before they become risk.",
  "pre-departure": "Confirm leave-by timing, ownership, and transfer paths before heading out.",
  airport: "Keep live movement and gate/platform signals current with low-friction updates.",
  arrival: "Sequence pickup, hotel, and first-night plans while preserving per-person clarity.",
  recovery: "Minimize delay impact with scripted decisions and rapid itinerary re-sync.",
};

const STAGE_EASIEST_INPUT: Record<TripStage, string> = {
  readiness: "Forward confirmations by email, then one-tap route low-confidence items to review.",
  "pre-departure": "Use stage quick actions to run escalations instead of manual scanning.",
  airport: "Use one-tap voice capture for changes when movement is high and typing is slow.",
  arrival: "Apply per-person filtering before edits so only relevant cards are touched.",
  recovery: "Use scripted call flows and re-export updated static itinerary in one pass.",
};

const STATUS_LABEL: Record<TripStatus, string> = {
  green: "On time",
  yellow: "Behind",
  red: "Urgent",
};

const RESERVATION_TYPE_LABEL: Record<ReservationType, string> = {
  flight: "Flight",
  hotel: "Hotel",
  train: "Train",
  ride: "Ride",
  dinner: "Dinner",
};

const REMINDER_MILESTONES: ReminderMilestone[] = [
  { label: "T-24h", thresholdMinutes: 1440 },
  { label: "T-12h", thresholdMinutes: 720 },
  { label: "T-3h", thresholdMinutes: 180 },
  { label: "T-90m", thresholdMinutes: 90 },
  { label: "T-45m", thresholdMinutes: 45 },
];

const TYPE_REMINDER_THRESHOLDS: Record<ReservationType, number[]> = {
  flight: [1440, 720, 180, 90, 45],
  train: [720, 180, 60, 30],
  ride: [180, 60, 20],
  hotel: [1440, 240, 60],
  dinner: [180, 60, 30],
};
const UPDATE_REPLAY_WINDOW_MS = 30 * 60_000;
const SESSION_STORAGE_KEY = "travel-assistant-session-v1";
const DEMO_PRESETS: DemoPresetConfig[] = [
  {
    id: "smooth-trip",
    label: "Smooth trip",
    summary: "Green status, clean queue, readiness complete.",
  },
  {
    id: "moderate-delay",
    label: "Moderate delay",
    summary: "Yellow airport mode with manageable delay.",
  },
  {
    id: "severe-disruption",
    label: "Severe disruption",
    summary: "Red recovery mode with urgent actions.",
  },
];

const EMPTY_DRAFT: ReservationDraft = {
  type: "flight",
  title: "",
  provider: "",
  localTime: "",
  timezone: "America/New_York",
  location: "",
  confirmationCode: "",
  assignedTo: [],
  stage: "readiness",
  critical: true,
  confidence: "medium",
  notes: "",
};

const INITIAL_FAMILY: FamilyMember[] = [
  {
    id: "alex",
    name: "Alex",
    role: "organizer",
    color: "#7dd3fc",
    sharingEnabled: true,
    visibility: "all-members",
    location: { lat: 40.6428, lon: -73.7808, updatedAt: new Date().toISOString() },
  },
  {
    id: "jamie",
    name: "Jamie",
    role: "adult",
    color: "#f9a8d4",
    sharingEnabled: true,
    visibility: "all-members",
    location: { lat: 40.644, lon: -73.7822, updatedAt: new Date().toISOString() },
  },
  {
    id: "riley",
    name: "Riley",
    role: "teen",
    color: "#86efac",
    sharingEnabled: false,
    visibility: "organizer-only",
    location: { lat: 40.6416, lon: -73.776, updatedAt: new Date().toISOString() },
  },
];

const INITIAL_RESERVATIONS: Reservation[] = [
  {
    id: "res-flight-1",
    type: "flight",
    title: "DL 407 JFK -> SFO",
    provider: "Delta",
    localTime: "2026-06-22 08:15",
    timezone: "America/New_York",
    location: "Terminal 4, JFK",
    confirmationCode: "Y8Q4D2",
    assignedTo: ["alex", "jamie", "riley"],
    stage: "airport",
    critical: true,
    confidence: "high",
    notes: "Check-in opens 24h before departure.",
    source: "imported",
  },
  {
    id: "res-hotel-1",
    type: "hotel",
    title: "Grand Union Hotel",
    provider: "Marriott",
    localTime: "2026-06-22 16:00",
    timezone: "America/Los_Angeles",
    location: "Union Square, San Francisco",
    confirmationCode: "MZ-10881",
    assignedTo: ["alex", "jamie", "riley"],
    stage: "arrival",
    critical: true,
    confidence: "high",
    notes: "Late check-in approved.",
    source: "imported",
  },
  {
    id: "res-train-1",
    type: "train",
    title: "Coastline Express SFO -> Palo Alto",
    provider: "Caltrain",
    localTime: "2026-06-23 09:40",
    timezone: "America/Los_Angeles",
    location: "SFO Transit Station • Platform 4",
    confirmationCode: "CT-7730",
    assignedTo: ["alex", "jamie"],
    stage: "arrival",
    critical: true,
    confidence: "high",
    notes: "Morning transfer to meeting district.",
    source: "imported",
  },
  {
    id: "res-dinner-1",
    type: "dinner",
    title: "Family dinner reservation",
    provider: "Luna Kitchen",
    localTime: "2026-06-22 19:30",
    timezone: "America/Los_Angeles",
    location: "Mission District",
    confirmationCode: "LK-5521",
    assignedTo: ["alex", "jamie"],
    stage: "arrival",
    critical: true,
    confidence: "medium",
    notes: "Riley may join after game event.",
    source: "manual",
  },
];

const INITIAL_REVIEW_QUEUE: ReviewItem[] = [
  {
    id: "review-1",
    reasons: ["Possible duplicate confirmation code", "Arrival time missing"],
    impact: "Airport pickup timing unknown",
    sourceEmailSubject: "Ride confirmation: Bay City Shuttle",
    draft: {
      type: "ride",
      title: "Airport transfer (needs review)",
      provider: "Bay City Shuttle",
      localTime: "2026-06-22",
      timezone: "America/Los_Angeles",
      location: "SFO pickup zone",
      confirmationCode: "BAY-2217",
      assignedTo: ["alex", "jamie", "riley"],
      stage: "arrival",
      critical: true,
      confidence: "low",
      notes: "Missing exact pickup minute from email.",
    },
  },
  {
    id: "review-2",
    reasons: ["Could conflict with primary flight", "Terminal mention ambiguous"],
    impact: "May trigger wrong check-in location",
    sourceEmailSubject: "Flight update - please verify terminal",
    draft: {
      type: "flight",
      title: "DL 407 terminal update",
      provider: "Delta",
      localTime: "2026-06-22 08:15",
      timezone: "America/New_York",
      location: "Terminal ???",
      confirmationCode: "Y8Q4D2",
      assignedTo: ["alex", "jamie", "riley"],
      stage: "airport",
      critical: true,
      confidence: "low",
      notes: "Email mentions gate change but terminal string is truncated.",
    },
  },
];

const INITIAL_CHECKLIST: ReadinessItem[] = [
  { id: "ready-flight", category: "Flights", title: "Flight confirmation codes verified", complete: true, required: true },
  { id: "ready-hotel", category: "Hotels", title: "Hotel check-in and check-out confirmed", complete: true, required: true },
  { id: "ready-transport", category: "Transportation", title: "Airport transfer planned with fallback", complete: false, required: true },
  { id: "ready-passport", category: "Passport", title: "Passport validity verified", complete: true, required: true },
  { id: "ready-checkin", category: "Check-in timing", title: "Online check-in reminders set", complete: false, required: true },
  { id: "ready-arrival", category: "Arrival transfer", title: "Pickup location pinned", complete: false, required: true },
  { id: "ready-essentials", category: "Essentials", title: "Medication and chargers packed", complete: false, required: false },
  { id: "ready-night", category: "First-night", title: "First meal and sleep plan prepared", complete: true, required: false },
];

const EMAIL_SAMPLES: EmailSample[] = [
  {
    id: "email-1",
    sender: "reservations@delta.com",
    receivedAt: "2026-06-20T10:42:00-04:00",
    subject: "Your upcoming flight DL 407",
    body: [
      "Passenger: Alex Parker",
      "Flight: DL 407",
      "From: JFK Terminal 4",
      "To: SFO Terminal 2",
      "Departure: Jun 22 2026 08:15 AM EDT",
      "Confirmation: Y8Q4D2",
      "Gate updates will be sent before departure.",
    ].join("\n"),
    confidence: "high",
    issues: [],
    parsed: {
      type: "flight",
      title: "DL 407 JFK -> SFO",
      provider: "Delta",
      localTime: "2026-06-22 08:15",
      timezone: "America/New_York",
      location: "JFK Terminal 4",
      confirmationCode: "Y8Q4D2",
      assignedTo: ["alex", "jamie", "riley"],
      stage: "airport",
      critical: true,
      confidence: "high",
      notes: "High-confidence parse from confirmation email.",
    },
  },
  {
    id: "email-2",
    sender: "alerts@baycityshuttle.com",
    receivedAt: "2026-06-21T09:11:00-07:00",
    subject: "Bay City Shuttle details",
    body: [
      "Thanks for booking Bay City Shuttle.",
      "Pickup: SFO airport transportation zone.",
      "Your booking code is BAY-2217.",
      "A reminder with exact pickup time will be sent once your flight lands.",
      "If delayed, reply with your new arrival time.",
    ].join("\n"),
    confidence: "low",
    issues: ["Missing exact pickup time", "Potential overlap with hotel transfer booking"],
    parsed: {
      type: "ride",
      title: "Bay City Shuttle pickup",
      provider: "Bay City Shuttle",
      localTime: "2026-06-22",
      timezone: "America/Los_Angeles",
      location: "SFO transportation zone",
      confirmationCode: "BAY-2217",
      assignedTo: ["alex", "jamie", "riley"],
      stage: "arrival",
      critical: true,
      confidence: "low",
      notes: "Needs review before activation due to missing exact pickup minute.",
    },
  },
];

function defaultStageForReservationType(type: "flight" | "hotel" | "train" | "ride"): TripStage {
  if (type === "flight" || type === "train") return "airport";
  if (type === "hotel" || type === "ride") return "arrival";
  return "readiness";
}

function nextId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatClock(iso: string | null): string {
  if (!iso) return "Never synced";
  return new Date(iso).toLocaleString();
}

function parseDateInput(value: string): number {
  if (!value) return Number.NaN;
  const parsed = Date.parse(value.replace(" ", "T"));
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

function formatDateTimeLocal(valueMs: number): string {
  const value = new Date(valueMs);
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  const hours = `${value.getHours()}`.padStart(2, "0");
  const minutes = `${value.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function normalizeText(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

function buildUpdateReplayKey(update: TravelUpdateEvent): string {
  return [
    update.provider,
    update.kind,
    update.target.reservationType,
    update.target.confirmationCode ?? "",
    update.target.titleHint ?? "",
    update.delayMinutes ?? "",
    update.updatedLocation ?? "",
    update.summary,
  ].join("|");
}

function csvEscape(value: string): string {
  const clean = value.replaceAll('"', '""');
  return `"${clean}"`;
}

function buildCsv(rows: ExportRow[]): string {
  const header = [
    "Owner",
    "Item Type",
    "Title",
    "Provider",
    "Local Time",
    "Timezone",
    "Location",
    "Confirmation",
    "Notes",
  ];
  const body = rows.map((row) =>
    [
      row.owner,
      row.itemType,
      row.title,
      row.provider,
      row.localTime,
      row.timezone,
      row.location,
      row.confirmation,
      row.notes,
    ]
      .map(csvEscape)
      .join(","),
  );
  return [header.join(","), ...body].join("\n");
}

function toCalendarSyncReservationPayload(reservation: Reservation): {
  id: string;
  type: ReservationType;
  title: string;
  confirmationCode: string;
  localTime: string;
  location: string;
  timezone: string;
  provider: string;
  notes: string;
} {
  return {
    id: reservation.id,
    type: reservation.type,
    title: reservation.title,
    confirmationCode: reservation.confirmationCode,
    localTime: reservation.localTime,
    location: reservation.location,
    timezone: reservation.timezone,
    provider: reservation.provider,
    notes: reservation.notes,
  };
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatThresholdLabel(minutes: number): string {
  if (minutes % 60 === 0) {
    return `T-${minutes / 60}h`;
  }
  return `T-${minutes}m`;
}

function buildPremiumItineraryHtml({
  rows,
  generatedAt,
  stageLabel,
  statusLabel,
  confidenceScore,
  scopeLabel,
}: {
  rows: ExportRow[];
  generatedAt: string;
  stageLabel: string;
  statusLabel: string;
  confidenceScore: number | null;
  scopeLabel: string;
}): string {
  const tableRows = rows
    .map((row) => {
      return `<tr>
        <td>${escapeHtml(row.owner)}</td>
        <td>${escapeHtml(row.itemType)}</td>
        <td>${escapeHtml(row.title)}</td>
        <td>${escapeHtml(row.provider)}</td>
        <td>${escapeHtml(row.localTime)}</td>
        <td>${escapeHtml(row.timezone)}</td>
        <td>${escapeHtml(row.location)}</td>
        <td>${escapeHtml(row.confirmation)}</td>
        <td>${escapeHtml(row.notes)}</td>
      </tr>`;
    })
    .join("");

  const confidenceMarkup =
    confidenceScore === null
      ? ""
      : `<span class="chip">Confidence score: ${Math.round(confidenceScore)}</span>`;

  return [
    "<html><head><meta charset='utf-8'><title>Travel Itinerary</title>",
    "<style>",
    "body { font-family: 'Inter', 'Segoe UI', system-ui, sans-serif; color: #0f172a; margin: 0; background: #f8fafc; }",
    ".wrap { padding: 28px; }",
    ".hero { border: 1px solid #cbd5e1; border-radius: 18px; background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 55%, #111827 100%); color: #e2e8f0; padding: 20px; }",
    ".hero h1 { margin: 0 0 8px; font-size: 24px; }",
    ".hero p { margin: 0; font-size: 13px; color: #cbd5e1; }",
    ".chips { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 8px; }",
    ".chip { display: inline-block; font-size: 12px; background: rgba(148, 163, 184, 0.2); border: 1px solid rgba(148, 163, 184, 0.4); border-radius: 999px; padding: 4px 10px; }",
    ".section { margin-top: 16px; border: 1px solid #dbeafe; border-radius: 14px; background: #ffffff; padding: 16px; }",
    ".section h2 { margin: 0 0 8px; font-size: 15px; color: #0f172a; }",
    ".meta { margin: 0; font-size: 12px; color: #475569; }",
    "table { width: 100%; border-collapse: collapse; margin-top: 12px; }",
    "th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; font-size: 12px; vertical-align: top; }",
    "th { background: #eff6ff; color: #1e293b; font-weight: 600; }",
    "tfoot td { font-size: 11px; color: #475569; background: #f8fafc; }",
    "</style></head><body>",
    "<div class='wrap'>",
    "<div class='hero'>",
    "<h1>Adaptive Travel Assistant - Premium Static Itinerary</h1>",
    "<p>Logistics-first execution snapshot for travel day reliability.</p>",
    "<div class='chips'>",
    `<span class='chip'>Generated: ${escapeHtml(generatedAt)}</span>`,
    `<span class='chip'>Stage: ${escapeHtml(stageLabel)}</span>`,
    `<span class='chip'>Status: ${escapeHtml(statusLabel)}</span>`,
    `<span class='chip'>Scope: ${escapeHtml(scopeLabel)}</span>`,
    confidenceMarkup,
    "</div></div>",
    "<div class='section'>",
    "<h2>Static copy safety note</h2>",
    "<p class='meta'>This document is a point-in-time export. Re-check the live app before critical transitions (check-in, gate changes, transfers, and shared meeting points).</p>",
    "<table>",
    "<thead><tr><th>Owner</th><th>Type</th><th>Title</th><th>Provider</th><th>Local Time</th><th>Timezone</th><th>Location</th><th>Confirmation</th><th>Notes</th></tr></thead>",
    `<tbody>${tableRows}</tbody>`,
    "<tfoot><tr><td colspan='9'>Timezone labels and assignment owners are included to reduce missed-event risk in static handoffs.</td></tr></tfoot>",
    "</table></div></div></body></html>",
  ].join("");
}

function canViewerSeeMember(viewer: FamilyMember, target: FamilyMember): boolean {
  if (!target.sharingEnabled) return false;
  if (target.visibility === "all-members") return true;
  return viewer.role === "organizer" || viewer.id === target.id;
}

function normalizeCoordinates(members: FamilyMember[]): Array<{ member: FamilyMember; x: number; y: number }> {
  if (members.length === 0) return [];
  const lats = members.map((m) => m.location.lat);
  const lons = members.map((m) => m.location.lon);
  const latMin = Math.min(...lats) - 0.001;
  const latMax = Math.max(...lats) + 0.001;
  const lonMin = Math.min(...lons) - 0.001;
  const lonMax = Math.max(...lons) + 0.001;
  return members.map((member) => {
    const x = ((member.location.lon - lonMin) / (lonMax - lonMin || 1)) * 100;
    const y = ((latMax - member.location.lat) / (latMax - latMin || 1)) * 100;
    return { member, x, y };
  });
}

function appendUniqueNote(existing: string, note: string): string {
  if (existing.includes(note)) {
    return existing;
  }
  return `${existing}\n${note}`.trim();
}

export default function TravelAssistantPage() {
  const updateMode: TravelUpdateMode =
    (process.env.NEXT_PUBLIC_TRAVEL_UPDATES_MODE ?? "auto").toLowerCase() === "off"
      ? "off"
      : (process.env.NEXT_PUBLIC_TRAVEL_UPDATES_MODE ?? "auto").toLowerCase() === "mock"
        ? "mock"
        : "auto";
  const [tripStage, setTripStage] = useState<TripStage>("readiness");
  const [tripStatus, setTripStatus] = useState<TripStatus>("yellow");
  const [networkMode, setNetworkMode] = useState<NetworkMode>("wifi");
  const [wifiOnlySync, setWifiOnlySync] = useState(false);
  const [allowCellularLocationUpdates, setAllowCellularLocationUpdates] = useState(true);
  const [showFamilyMap, setShowFamilyMap] = useState(true);
  const [selectedFamilyMemberId, setSelectedFamilyMemberId] = useState("alex");
  const [personalTimelineOnly, setPersonalTimelineOnly] = useState(false);
  const [mobileSimpleView, setMobileSimpleView] = useState(true);
  const [mobileViewPanel, setMobileViewPanel] = useState<MobileViewPanel>("essentials");
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [lastDemoPresetAppliedAt, setLastDemoPresetAppliedAt] = useState<string | null>(null);
  const [lastDemoPresetId, setLastDemoPresetId] = useState<DemoPresetId | null>(null);
  const [activeScenario, setActiveScenario] = useState<DisruptionScenario>("none");
  const [minutesToDeparture, setMinutesToDeparture] = useState(165);
  const [offlineOutbox, setOfflineOutbox] = useState<OfflineOutboxSnapshot>(() =>
    createOfflineOutboxSnapshot(),
  );
  const [lastOutboxReplayAt, setLastOutboxReplayAt] = useState<string | null>(null);
  const [lastSessionRestoreAt, setLastSessionRestoreAt] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(new Date().toISOString());
  const [lastReminderSentAt, setLastReminderSentAt] = useState<string | null>(null);
  const [lastVoiceCaptureAt, setLastVoiceCaptureAt] = useState<string | null>(null);
  const [voiceCaptureCount, setVoiceCaptureCount] = useState(0);
  const [lastProviderCheckAt, setLastProviderCheckAt] = useState<string | null>(null);
  const [lastProviderError, setLastProviderError] = useState<string | null>(null);
  const [lastProviderAttempts, setLastProviderAttempts] = useState(0);
  const [providerCircuitOpen, setProviderCircuitOpen] = useState(false);
  const [autoTransportUpdates, setAutoTransportUpdates] = useState(true);
  const [isProviderCheckRunning, setIsProviderCheckRunning] = useState(false);
  const [toast, setToastRaw] = useState<string | null>(null);
  const [guidanceTone, setGuidanceTone] = useState<GuidanceTone>("subtle");
  const [suppressedNudgeCount, setSuppressedNudgeCount] = useState(0);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [queuedProviderUpdates, setQueuedProviderUpdates] = useState<TravelUpdateEvent[]>([]);
  const [updateFeed, setUpdateFeed] = useState<UpdateFeedItem[]>([]);
  const [providerReports, setProviderReports] = useState<TravelProviderReport[]>([]);
  const [lastAuditSummary, setLastAuditSummary] = useState<TravelUpdateAuditSummary | null>(null);
  const [lastConflictSummary, setLastConflictSummary] = useState<TravelConflictResolutionSummary | null>(null);
  const [opsSnapshot, setOpsSnapshot] = useState<TravelOpsSnapshot | null>(null);
  const [opsError, setOpsError] = useState<string | null>(null);
  const [calendarSyncInFlight, setCalendarSyncInFlight] = useState(false);
  const [calendarSyncMessage, setCalendarSyncMessage] = useState<string | null>(null);
  const [calendarSyncTone, setCalendarSyncTone] = useState<"neutral" | "success" | "error">("neutral");
  const [opsExpanded, setOpsExpanded] = useState(false);
  const [opsLoading, setOpsLoading] = useState(false);
  const [opsActionPending, setOpsActionPending] = useState<
    "run-background-once" | "run-background-dry" | "reset-circuits" | "trigger-alert-sweep" | null
  >(
    null,
  );
  const [autopilotActionPending, setAutopilotActionPending] = useState<IncidentAutopilotAction | null>(null);
  const recentAppliedUpdateKeysRef = useRef<Map<string, number>>(new Map());
  const opsFetchInFlightRef = useRef(false);
  const sessionHydratedRef = useRef(false);
  const drawerContainerRef = useRef<HTMLDivElement | null>(null);
  const drawerCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusedElementBeforeDrawerRef = useRef<HTMLElement | null>(null);
  const toastPolicyRef = useRef<{
    tone: GuidanceTone;
    lastMessage: string | null;
    lastShownAtMs: number;
  }>({
    tone: "subtle",
    lastMessage: null,
    lastShownAtMs: 0,
  });

  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>(INITIAL_FAMILY);
  const [reservations, setReservations] = useState<Reservation[]>(INITIAL_RESERVATIONS);
  const [reviewQueue, setReviewQueue] = useState<ReviewItem[]>(INITIAL_REVIEW_QUEUE);
  const [readinessItems, setReadinessItems] = useState<ReadinessItem[]>(INITIAL_CHECKLIST);
  const [emailSamples, setEmailSamples] = useState<EmailSample[]>(EMAIL_SAMPLES);

  const [selectedEmailId, setSelectedEmailId] = useState(EMAIL_SAMPLES[0]?.id ?? "");
  const [activeDrawer, setActiveDrawer] = useState<DrawerState | null>(null);
  const [drawerDraft, setDrawerDraft] = useState<ReservationDraft>(EMPTY_DRAFT);
  const [mergeTargetByReview, setMergeTargetByReview] = useState<Record<string, string>>({});
  const [stageFocusMode, setStageFocusMode] = useState(true);
  const [quickAddText, setQuickAddText] = useState("");
  const [quickAddType, setQuickAddType] = useState<ReservationType>("ride");
  const [quickAddConfidence, setQuickAddConfidence] = useState<Confidence>("medium");
  const [undoStack, setUndoStack] = useState<UndoSnapshot[]>([]);
  const [undoAuditTrail, setUndoAuditTrail] = useState<UndoAuditEntry[]>([]);
  const [lastAppliedAutopilotRecommendationTitle, setLastAppliedAutopilotRecommendationTitle] = useState<
    string | null
  >(null);
  const [exportScope, setExportScope] = useState<"full-trip" | "selected-person">("full-trip");
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");

  const selectedFamilyMember = useMemo(
    () => familyMembers.find((member) => member.id === selectedFamilyMemberId) ?? familyMembers[0],
    [familyMembers, selectedFamilyMemberId],
  );

  const selectedEmail = useMemo(
    () => emailSamples.find((sample) => sample.id === selectedEmailId) ?? emailSamples[0],
    [emailSamples, selectedEmailId],
  );

  const cloneForUndo = useCallback(
    <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T,
    [],
  );

  const pushUndoSnapshot = useCallback(
    (label: string): void => {
      const snapshot: UndoSnapshot = {
        id: nextId("undo"),
        label,
        capturedAt: new Date().toISOString(),
        tripStage,
        tripStatus,
        minutesToDeparture,
        activeScenario,
        reservations: cloneForUndo(reservations),
        reviewQueue: cloneForUndo(reviewQueue),
        readinessItems: cloneForUndo(readinessItems),
      };
      setUndoStack((previous) => [snapshot, ...previous].slice(0, 25));
    },
    [
      activeScenario,
      cloneForUndo,
      minutesToDeparture,
      readinessItems,
      reservations,
      reviewQueue,
      tripStage,
      tripStatus,
    ],
  );

  const restoreUndoSnapshot = useCallback(
    (snapshot: UndoSnapshot): void => {
      setTripStage(snapshot.tripStage);
      setTripStatus(snapshot.tripStatus);
      setMinutesToDeparture(snapshot.minutesToDeparture);
      setActiveScenario(snapshot.activeScenario);
      setReservations(cloneForUndo(snapshot.reservations));
      setReviewQueue(cloneForUndo(snapshot.reviewQueue));
      setReadinessItems(cloneForUndo(snapshot.readinessItems));
      setUndoAuditTrail((previous) =>
        [
          {
            id: nextId("undo-audit"),
            action: snapshot.label,
            undoneAt: new Date().toISOString(),
          },
          ...previous,
        ].slice(0, 20),
      );
    },
    [cloneForUndo],
  );

  const undoLastCriticalChange = useCallback((): void => {
    const latest = undoStack[0];
    if (!latest) {
      setToastRaw("No critical changes to undo.");
      return;
    }
    setUndoStack((previous) => previous.slice(1));
    restoreUndoSnapshot(latest);
    setToastRaw("Reverted the most recent critical change.");
  }, [restoreUndoSnapshot, undoStack]);

  const providerEligibleReservations = useMemo(
    () =>
      reservations
        .filter((reservation) => reservation.type === "flight" || reservation.type === "train" || reservation.type === "ride")
        .map((reservation) => ({
          id: reservation.id,
          type: reservation.type,
          title: reservation.title,
          confirmationCode: reservation.confirmationCode,
          localTime: reservation.localTime,
          location: reservation.location,
          timezone: reservation.timezone,
        })),
    [reservations],
  );

  const canSyncItineraryNow = networkMode === "wifi" || (!wifiOnlySync && networkMode === "cellular");
  const canSendLocationNow =
    networkMode === "wifi" || (networkMode === "cellular" && allowCellularLocationUpdates);

  useEffect(() => {
    toastPolicyRef.current.tone = guidanceTone;
  }, [guidanceTone]);

  const setToast = useCallback((message: string | null, options?: { force?: boolean }): void => {
    if (message === null) {
      setToastRaw(null);
      return;
    }
    const normalized = message.trim();
    if (!normalized) return;

    const now = Date.now();
    const policy = toastPolicyRef.current;
    const dedupeWindowMs = policy.tone === "subtle" ? 18_000 : 8_000;
    const cooldownMs = policy.tone === "subtle" ? 3_200 : 1_500;
    const isDuplicate = normalized === policy.lastMessage && now - policy.lastShownAtMs < dedupeWindowMs;
    const isCoolingDown = now - policy.lastShownAtMs < cooldownMs;
    const isCritical = /\b(error|failed|cannot|unauthorized|blocked|timeout)\b/i.test(normalized);
    if (!options?.force && !isCritical && (isDuplicate || isCoolingDown)) {
      setSuppressedNudgeCount((count) => count + 1);
      return;
    }

    policy.lastMessage = normalized;
    policy.lastShownAtMs = now;
    setToastRaw(normalized);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeoutMs = guidanceTone === "subtle" ? 2000 : 2800;
    const timeout = window.setTimeout(() => setToastRaw(null), timeoutMs);
    return () => window.clearTimeout(timeout);
  }, [guidanceTone, toast]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const restored = parseTravelClientSessionState(raw);
      if (!restored) {
        return;
      }
      setTripStage(restored.tripStage);
      setTripStatus(restored.tripStatus);
      setNetworkMode(restored.networkMode);
      setWifiOnlySync(restored.wifiOnlySync);
      setAllowCellularLocationUpdates(restored.allowCellularLocationUpdates);
      setShowFamilyMap(restored.showFamilyMap);
      setSelectedFamilyMemberId(restored.selectedFamilyMemberId);
      setPersonalTimelineOnly(restored.personalTimelineOnly);
      setGuidanceTone(restored.guidanceTone);
      setStageFocusMode(restored.stageFocusMode);
      setOfflineOutbox(restored.offlineOutbox);
      setReservations(restored.reservations as Reservation[]);
      setReviewQueue(restored.reviewQueue as ReviewItem[]);
      setReadinessItems(restored.readinessItems as ReadinessItem[]);
      setLastSessionRestoreAt(restored.savedAt);
      setToastRaw("Recovered previous trip session.");
    } finally {
      sessionHydratedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!sessionHydratedRef.current) return;
    const snapshot = {
      version: 1 as const,
      savedAt: new Date().toISOString(),
      tripStage,
      tripStatus,
      networkMode,
      wifiOnlySync,
      allowCellularLocationUpdates,
      showFamilyMap,
      selectedFamilyMemberId,
      personalTimelineOnly,
      guidanceTone,
      stageFocusMode,
      offlineOutbox,
      reservations,
      reviewQueue,
      readinessItems,
    };
    try {
      window.localStorage.setItem(SESSION_STORAGE_KEY, stringifyTravelClientSessionState(snapshot));
    } catch {
      // Ignore persistence failures in restricted storage contexts.
    }
  }, [
    allowCellularLocationUpdates,
    guidanceTone,
    networkMode,
    offlineOutbox,
    personalTimelineOnly,
    readinessItems,
    reservations,
    reviewQueue,
    selectedFamilyMemberId,
    showFamilyMap,
    stageFocusMode,
    tripStage,
    tripStatus,
    wifiOnlySync,
  ]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = (): void => {
      const compact = media.matches;
      setIsCompactViewport(compact);
      setMobileSimpleView(compact);
      setMobileViewPanel((previous) => {
        if (compact) {
          return previous === "all" ? "essentials" : previous;
        }
        return "all";
      });
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!canSendLocationNow) return;
      setFamilyMembers((prev) =>
        prev.map((member) => {
          if (!member.sharingEnabled) return member;
          const deltaLat = (Math.random() - 0.5) * 0.0015;
          const deltaLon = (Math.random() - 0.5) * 0.0015;
          return {
            ...member,
            location: {
              lat: member.location.lat + deltaLat,
              lon: member.location.lon + deltaLon,
              updatedAt: new Date().toISOString(),
            },
          };
        }),
      );
    }, 18000);
    return () => window.clearInterval(timer);
  }, [canSendLocationNow]);

  const unresolvedReviewCount = reviewQueue.length;
  const unresolvedReadinessCount = readinessItems.filter((item) => item.required && !item.complete).length;
  const pendingOutboxEntries = useMemo(() => listPendingOfflineOutboxEntries(offlineOutbox), [offlineOutbox]);
  const pendingOutboxCount = countPendingOfflineOutboxEntries(offlineOutbox);
  const pendingSyncCount = queuedProviderUpdates.length + pendingOutboxCount;
  const pendingOutboxByReservationId = useMemo(() => {
    const counts = new Map<string, number>();
    pendingOutboxEntries.forEach((entry) => {
      if (!entry.reservationId) return;
      counts.set(entry.reservationId, (counts.get(entry.reservationId) ?? 0) + 1);
    });
    return counts;
  }, [pendingOutboxEntries]);
  const hasGlobalOutboxPending = useMemo(
    () => pendingOutboxEntries.some((entry) => entry.reservationId === null),
    [pendingOutboxEntries],
  );
  const reservationTypeById = useMemo(() => {
    return new Map(reservations.map((reservation) => [reservation.id, reservation.type]));
  }, [reservations]);
  const flightLiveStatusByReservationId = useMemo(() => {
    const statusMap = new Map<string, "on-time" | "delayed" | "cancelled">();
    updateFeed.forEach((entry) => {
      if (reservationTypeById.get(entry.reservationId) !== "flight") {
        return;
      }
      if (statusMap.has(entry.reservationId)) {
        return;
      }
      if (entry.kind === "cancellation") {
        statusMap.set(entry.reservationId, "cancelled");
        return;
      }
      if (entry.kind === "delay") {
        statusMap.set(entry.reservationId, "delayed");
        return;
      }
      if (entry.kind === "on-time") {
        statusMap.set(entry.reservationId, "on-time");
      }
    });
    return statusMap;
  }, [reservationTypeById, updateFeed]);
  const railLiveStatusByReservationId = useMemo(() => {
    const statusMap = new Map<string, "on-time" | "delayed" | "cancelled">();
    updateFeed.forEach((entry) => {
      if (reservationTypeById.get(entry.reservationId) !== "train") {
        return;
      }
      if (statusMap.has(entry.reservationId)) {
        return;
      }
      if (entry.kind === "cancellation") {
        statusMap.set(entry.reservationId, "cancelled");
        return;
      }
      if (entry.kind === "delay") {
        statusMap.set(entry.reservationId, "delayed");
        return;
      }
      if (entry.kind === "on-time") {
        statusMap.set(entry.reservationId, "on-time");
      }
    });
    return statusMap;
  }, [reservationTypeById, updateFeed]);
  const visibleReservations = useMemo(() => {
    const fromMs = parseDateInput(exportFrom);
    const toMs = parseDateInput(exportTo);
    return reservations.filter((reservation) => {
      if (personalTimelineOnly && !reservation.assignedTo.includes(selectedFamilyMember.id)) {
        return false;
      }
      const reservationMs = parseDateInput(reservation.localTime);
      if (!Number.isNaN(fromMs) && !Number.isNaN(reservationMs) && reservationMs < fromMs) {
        return false;
      }
      if (!Number.isNaN(toMs) && !Number.isNaN(reservationMs) && reservationMs > toMs) {
        return false;
      }
      return true;
    });
  }, [exportFrom, exportTo, personalTimelineOnly, reservations, selectedFamilyMember.id]);

  const visibleFamilyMarkers = useMemo(() => {
    const viewer = selectedFamilyMember;
    const visibleMembers = familyMembers.filter((member) => canViewerSeeMember(viewer, member));
    return normalizeCoordinates(visibleMembers);
  }, [familyMembers, selectedFamilyMember]);

  const primaryActions = useMemo(() => {
    const shared = {
      readiness: [
        "Resolve review queue before locking timeline",
        "Verify transfer fallback and first-night logistics",
        "Export static backup itinerary",
      ],
      "pre-departure": [
        "Run final checklist with who-is-where status",
        "Confirm leave-by time against current traffic",
        "Push family sync update before departure",
      ],
      airport: [
        "Monitor gate/terminal and share live location",
        "Keep critical contacts one tap away",
        "Watch yellow/red escalation prompts",
      ],
      arrival: [
        "Confirm pickup and hotel check-in sequence",
        "Split schedules by person while preserving group milestones",
        "Validate dinner and late-evening logistics",
      ],
      recovery: [
        "Call priority contacts in scripted order",
        "Apply decision path for missed-flight scenario",
        "Rebuild timeline and re-share updated itinerary",
      ],
    };
    return shared[tripStage];
  }, [tripStage]);

  const leaveByMinutes = useMemo(() => {
    const base = 55;
    const riskPenalty = unresolvedReviewCount * 12 + (tripStatus === "red" ? 25 : tripStatus === "yellow" ? 10 : 0);
    return base + riskPenalty;
  }, [tripStatus, unresolvedReviewCount]);

  const criticalReservations = useMemo(
    () =>
      reservations
        .filter((reservation) => reservation.critical)
        .map((reservation) => ({ reservation, timeMs: parseDateInput(reservation.localTime) }))
        .filter((item) => !Number.isNaN(item.timeMs))
        .sort((left, right) => left.timeMs - right.timeMs),
    [reservations],
  );

  const nextCriticalReservation = useMemo(() => {
    if (criticalReservations.length === 0) return null;
    return criticalReservations.find((item) => item.timeMs >= nowMs) ?? criticalReservations[0];
  }, [criticalReservations, nowMs]);

  const minutesUntilNextCritical = useMemo(() => {
    if (!nextCriticalReservation) return null;
    return Math.round((nextCriticalReservation.timeMs - nowMs) / 60000);
  }, [nextCriticalReservation, nowMs]);

  const reminderLadder = useMemo(() => {
    return REMINDER_MILESTONES.map((milestone) => {
      if (minutesUntilNextCritical === null) {
        return { ...milestone, state: "inactive" as const, detail: "No critical events" };
      }
      if (minutesUntilNextCritical < 0) {
        return { ...milestone, state: "missed" as const, detail: "Event already passed" };
      }
      if (minutesUntilNextCritical <= milestone.thresholdMinutes) {
        return { ...milestone, state: "due" as const, detail: "Dispatch now" };
      }
      const remaining = minutesUntilNextCritical - milestone.thresholdMinutes;
      return { ...milestone, state: "upcoming" as const, detail: `Due in ${remaining} min` };
    });
  }, [minutesUntilNextCritical]);

  const perReservationEscalations = useMemo(() => {
    return reservations
      .map((reservation) => {
        const eventMs = parseDateInput(reservation.localTime);
        if (Number.isNaN(eventMs)) {
          return {
            id: reservation.id,
            title: reservation.title,
            type: reservation.type,
            minutesUntil: Number.NaN,
            timezone: reservation.timezone,
            confidence: reservation.confidence,
            level: "invalid" as const,
            guidance: "Cannot evaluate reminders until local time is corrected.",
            nextThreshold: null as number | null,
          };
        }

        const minutesUntil = Math.round((eventMs - nowMs) / 60000);
        const thresholds = TYPE_REMINDER_THRESHOLDS[reservation.type];
        const dueThreshold = thresholds.find((threshold) => minutesUntil <= threshold && minutesUntil > -30);
        const nextThreshold = thresholds.find((threshold) => minutesUntil > threshold) ?? null;

        if (minutesUntil < -30) {
          return {
            id: reservation.id,
            title: reservation.title,
            type: reservation.type,
            minutesUntil,
            timezone: reservation.timezone,
            confidence: reservation.confidence,
            level: "expired" as const,
            guidance: "Event has passed. Confirm if completion updates were logged.",
            nextThreshold: null as number | null,
          };
        }

        if (dueThreshold !== undefined) {
          const urgency =
            reservation.type === "flight" && dueThreshold <= 90
              ? "critical"
              : dueThreshold <= 60
                ? "high"
                : "medium";
          return {
            id: reservation.id,
            title: reservation.title,
            type: reservation.type,
            minutesUntil,
            timezone: reservation.timezone,
            confidence: reservation.confidence,
            level: urgency as "critical" | "high" | "medium",
            guidance: `Dispatch ${formatThresholdLabel(dueThreshold)} reminder now.`,
            nextThreshold: dueThreshold,
          };
        }

        return {
          id: reservation.id,
          title: reservation.title,
          type: reservation.type,
          minutesUntil,
          timezone: reservation.timezone,
          confidence: reservation.confidence,
          level: "upcoming" as const,
          guidance:
            nextThreshold === null
              ? "No additional checkpoints configured."
              : `${formatThresholdLabel(nextThreshold)} checkpoint is upcoming.`,
          nextThreshold,
        };
      })
      .sort((left, right) => {
        if (Number.isNaN(left.minutesUntil) && Number.isNaN(right.minutesUntil)) return 0;
        if (Number.isNaN(left.minutesUntil)) return 1;
        if (Number.isNaN(right.minutesUntil)) return -1;
        return left.minutesUntil - right.minutesUntil;
      });
  }, [nowMs, reservations]);

  const timelineIssues = useMemo<TimelineIssue[]>(() => {
    const issues: TimelineIssue[] = [];

    reservations.forEach((reservation) => {
      const parsedTime = parseDateInput(reservation.localTime);
      if (Number.isNaN(parsedTime)) {
        issues.push({
          id: `invalid-time-${reservation.id}`,
          severity: "high",
          message: `${reservation.title} has an invalid local time format.`,
          recommendation: "Correct the local time before confirming this segment.",
        });
      }
      if (!reservation.timezone.includes("/")) {
        issues.push({
          id: `timezone-${reservation.id}`,
          severity: "high",
          message: `${reservation.title} is missing a canonical timezone identifier.`,
          recommendation: "Use an IANA timezone such as America/New_York.",
        });
      }
      if (reservation.critical && reservation.confidence === "low") {
        issues.push({
          id: `confidence-${reservation.id}`,
          severity: "high",
          message: `${reservation.title} is critical but still low confidence.`,
          recommendation: "Keep this item in review until key fields are verified.",
        });
      }
    });

    const confirmationMap = new Map<string, Reservation[]>();
    reservations.forEach((reservation) => {
      const key = reservation.confirmationCode.trim();
      if (!key) return;
      const existing = confirmationMap.get(key) ?? [];
      existing.push(reservation);
      confirmationMap.set(key, existing);
    });
    confirmationMap.forEach((group, confirmationCode) => {
      if (group.length < 2) return;
      const distinctLocations = new Set(group.map((item) => item.location)).size;
      const distinctTimes = new Set(group.map((item) => item.localTime)).size;
      if (distinctLocations > 1 || distinctTimes > 1) {
        issues.push({
          id: `duplicate-code-${confirmationCode}`,
          severity: "medium",
          message: `Confirmation ${confirmationCode} appears in multiple reservations with conflicting details.`,
          recommendation: "Merge or correct duplicate cards before departure.",
        });
      }
    });

    familyMembers.forEach((member) => {
      const assigned = reservations
        .filter((reservation) => reservation.assignedTo.includes(member.id))
        .map((reservation) => ({ reservation, timeMs: parseDateInput(reservation.localTime) }))
        .filter((item) => !Number.isNaN(item.timeMs))
        .sort((left, right) => left.timeMs - right.timeMs);
      for (let index = 0; index < assigned.length - 1; index += 1) {
        const current = assigned[index];
        const next = assigned[index + 1];
        const minuteGap = Math.abs(next.timeMs - current.timeMs) / 60000;
        if (minuteGap <= 90 && current.reservation.location !== next.reservation.location) {
          issues.push({
            id: `conflict-${member.id}-${current.reservation.id}-${next.reservation.id}`,
            severity: "medium",
            message: `${member.name} has near-overlapping commitments (${current.reservation.title} and ${next.reservation.title}).`,
            recommendation: "Adjust assigned schedules or add transfer buffers.",
          });
        }
      }
    });

    return issues;
  }, [familyMembers, reservations]);

  const blockingIssueCount = timelineIssues.filter((issue) => issue.severity === "high").length;
  const dueReminderCount = reminderLadder.filter((item) => item.state === "due").length;
  const smartEscalationDueCount = perReservationEscalations.filter(
    (item) => item.level === "critical" || item.level === "high" || item.level === "medium",
  ).length;
  const operationalConfidenceScore = useMemo(() => {
    const rawScore =
      100 -
      unresolvedReviewCount * 8 -
      unresolvedReadinessCount * 7 -
      blockingIssueCount * 14 -
      smartEscalationDueCount * 2 -
      (tripStatus === "red" ? 10 : tripStatus === "yellow" ? 4 : 0);
    return Math.max(0, Math.min(100, rawScore));
  }, [blockingIssueCount, smartEscalationDueCount, tripStatus, unresolvedReadinessCount, unresolvedReviewCount]);

  const stageIndex = STAGES.indexOf(tripStage);
  const stageFlowCards = useMemo<StageFlowCard[]>(() => {
    return STAGES.map((stage) => {
      const mustConfirm =
        stage === "readiness"
          ? `${unresolvedReviewCount} review items and ${unresolvedReadinessCount} required checklist items unresolved.`
          : stage === "pre-departure"
            ? `Leave-by buffer ${leaveByMinutes} min with ${blockingIssueCount} high-severity timeline blockers.`
            : stage === "airport"
              ? `${dueReminderCount} due reminders and ${smartEscalationDueCount} smart escalations need attention.`
              : stage === "arrival"
                ? `Per-person schedule for ${selectedFamilyMember.name} remains ${personalTimelineOnly ? "focused" : "group-visible"}.`
                : `Disruption mode ${activeScenario === "none" ? "inactive" : `active: ${activeScenario.replace("-", " ")}`}.`;

      const exitCheck =
        stage === "readiness"
          ? "All required checklist + review blockers resolved."
          : stage === "pre-departure"
            ? "Leave-by time confirmed and transfer fallback documented."
            : stage === "airport"
              ? "Latest updates synced and all due reminders dispatched."
              : stage === "arrival"
                ? "Pickup + check-in + first-night sequence confirmed."
                : "Recovery decisions executed and refreshed itinerary shared.";

      return {
        stage,
        objective: STAGE_OBJECTIVES[stage],
        easiestInput: STAGE_EASIEST_INPUT[stage],
        mustConfirm,
        exitCheck,
      };
    });
  }, [
    activeScenario,
    blockingIssueCount,
    dueReminderCount,
    leaveByMinutes,
    personalTimelineOnly,
    selectedFamilyMember.name,
    smartEscalationDueCount,
    unresolvedReadinessCount,
    unresolvedReviewCount,
  ]);

  const nextBestFlowAction = useMemo(() => {
    if (unresolvedReviewCount > 0) {
      return "Clear or merge review queue items first so uncertain imports never block later stages.";
    }
    if (tripStage === "readiness" && unresolvedReadinessCount > 0) {
      return "Finish required readiness checks before moving to pre-departure mode.";
    }
    if (tripStage === "pre-departure" && blockingIssueCount > 0) {
      return "Fix timeline blockers and reconfirm leave-by time before departure.";
    }
    if (tripStage === "airport" && (dueReminderCount > 0 || smartEscalationDueCount > 0)) {
      return "Dispatch due reminders and run smart escalation now to avoid misses.";
    }
    if (tripStage === "arrival" && !personalTimelineOnly) {
      return `Switch to ${selectedFamilyMember.name}'s personal view to confirm individual handoffs.`;
    }
    if (tripStage === "recovery" && activeScenario === "none") {
      return "No disruption is active. Keep this stage for incident handling only.";
    }
    return "Flow is clear. Keep inputs lightweight and run a quick status evaluation.";
  }, [
    activeScenario,
    blockingIssueCount,
    dueReminderCount,
    personalTimelineOnly,
    selectedFamilyMember.name,
    smartEscalationDueCount,
    tripStage,
    unresolvedReadinessCount,
    unresolvedReviewCount,
  ]);
  const nextStage = useMemo(() => nextTripStage(tripStage), [tripStage]);
  const nextStageAction = useMemo(() => {
    if (primaryActions.length === 0) {
      return nextBestFlowAction;
    }
    return primaryActions[0];
  }, [nextBestFlowAction, primaryActions]);

  const showOpsSection = shouldShowFocusPanel({
    panel: "ops",
    stage: tripStage,
    focusMode: stageFocusMode,
  });
  const showAntiMissSection = shouldShowFocusPanel({
    panel: "anti-miss",
    stage: tripStage,
    focusMode: stageFocusMode,
  });
  const showCollaborationSection = shouldShowFocusPanel({
    panel: "collaboration",
    stage: tripStage,
    focusMode: stageFocusMode,
  });
  const showRecoverySection = shouldShowFocusPanel({
    panel: "recovery",
    stage: tripStage,
    focusMode: stageFocusMode,
  });
  const shouldRenderMobilePanel = useCallback(
    (panel: Exclude<MobileViewPanel, "all">): boolean => {
      if (!isCompactViewport || !mobileSimpleView) {
        return true;
      }
      return mobileViewPanel === panel;
    },
    [isCompactViewport, mobileSimpleView, mobileViewPanel],
  );
  const incidentAutopilotRecommendations = useMemo(
    () =>
      buildIncidentAutopilotPlan({
        tripStage,
        tripStatus,
        activeScenario,
        unresolvedReviewCount,
        blockingIssueCount,
        dueReminderCount,
        pendingSyncCount,
        canSyncItineraryNow,
        providerCircuitOpen,
        opsHealth: opsSnapshot?.health ?? null,
        workerHealth: opsSnapshot?.worker.health ?? null,
      }),
    [
      activeScenario,
      blockingIssueCount,
      canSyncItineraryNow,
      dueReminderCount,
      opsSnapshot?.health,
      opsSnapshot?.worker,
      pendingSyncCount,
      providerCircuitOpen,
      tripStage,
      tripStatus,
      unresolvedReviewCount,
    ],
  );

  const statusGovernance = useMemo(
    () =>
      evaluateTravelStatusGovernance({
        unresolvedRequiredChecklistCount: unresolvedReadinessCount,
        highSeverityTimelineIssueCount: blockingIssueCount,
        runtimeSnapshotIsStale: opsSnapshot?.runtime.isStale ?? false,
        runtimeSnapshotStaleMinutes: opsSnapshot?.runtime.staleMinutes ?? 0,
        backgroundRunActive: opsSnapshot?.backgroundState.activeRun !== null,
        backgroundRunLastStatus: opsSnapshot?.backgroundState.lastRun?.status ?? null,
        backgroundWorkerHealth: opsSnapshot?.worker.health,
        backgroundWorkerReason: opsSnapshot?.worker.reasons[0],
      }),
    [blockingIssueCount, opsSnapshot, unresolvedReadinessCount],
  );

  const applyGovernedStatus = useCallback(
    (desiredStatus: TripStatus, source: "manual" | "auto"): void => {
      if (source === "manual" && desiredStatus !== tripStatus) {
        pushUndoSnapshot(`Status set to ${desiredStatus.toUpperCase()}`);
      }
      const enforcedStatus = enforceStatusFloor(desiredStatus, statusGovernance);
      setTripStatus(enforcedStatus);
      if (enforcedStatus !== desiredStatus) {
        const primaryBlocker = statusGovernance.blockers[0];
        const reason = primaryBlocker ? `${primaryBlocker.reason} ${primaryBlocker.remediation}` : "Governance floor active.";
        setToast(`Cannot proceed with ${desiredStatus.toUpperCase()} status. ${reason}`);
      } else if (source === "auto" && desiredStatus === "green") {
        setToast("Trip status promoted to ON TIME by auto-evaluation.");
      }
    },
    [pushUndoSnapshot, setToast, statusGovernance, tripStatus],
  );

  const applyProviderUpdates = useCallback((updates: TravelUpdateEvent[], providerName: string): number => {
    if (updates.length === 0) return 0;

    const appliedAt = new Date().toISOString();
    const appliedAtMs = Date.parse(appliedAt);
    const replayState = recentAppliedUpdateKeysRef.current;
    replayState.forEach((seenAtMs, key) => {
      if (appliedAtMs - seenAtMs > UPDATE_REPLAY_WINDOW_MS) {
        replayState.delete(key);
      }
    });
    const appliedFeed: UpdateFeedItem[] = [];
    let criticalUpdateApplied = false;

    setReservations((previousReservations) => {
      return previousReservations.map((reservation) => {
        const normalizedTitle = normalizeText(reservation.title);
        const matchingUpdates = updates.filter((update) => {
          if (update.target.reservationType !== reservation.type) return false;
          const replayKey = buildUpdateReplayKey(update);
          if (replayState.has(replayKey)) return false;
          if (update.target.confirmationCode) {
            return update.target.confirmationCode === reservation.confirmationCode;
          }
          if (update.target.titleHint) {
            return normalizeText(update.target.titleHint) === normalizedTitle;
          }
          return false;
        });
        if (matchingUpdates.length === 0) return reservation;

        const nextReservation = { ...reservation };
        matchingUpdates.forEach((update) => {
          const replayKey = buildUpdateReplayKey(update);
          if (update.kind === "delay" && update.delayMinutes) {
            const parsedTime = parseDateInput(nextReservation.localTime);
            if (!Number.isNaN(parsedTime)) {
              nextReservation.localTime = formatDateTimeLocal(parsedTime + update.delayMinutes * 60000);
            }
          }
          if (update.updatedLocation) {
            nextReservation.location = update.updatedLocation;
          }
          if (update.kind === "cancellation") {
            criticalUpdateApplied = true;
            nextReservation.confidence = "high";
          }
          nextReservation.notes = `${nextReservation.notes}\n[${providerName}] ${update.summary}`.trim();
          appliedFeed.push({
            id: nextId("feed"),
            reservationId: reservation.id,
            kind: update.kind,
            severity: update.severity,
            summary: update.summary,
            detail: update.detail,
            provider: providerName,
            appliedAt,
          });
          replayState.set(replayKey, appliedAtMs);
        });

        return nextReservation;
      });
    });

    if (criticalUpdateApplied) {
      setTripStatus("red");
      setTripStage("recovery");
    }

    if (appliedFeed.length > 0) {
      setUpdateFeed((previous) => [...appliedFeed, ...previous].slice(0, 30));
      setLastSyncAt(appliedAt);
    }
    return appliedFeed.length;
  }, []);

  const fetchOpsSnapshot = useCallback(async (trigger: "auto" | "manual" = "auto"): Promise<void> => {
    if (opsFetchInFlightRef.current && trigger === "auto") {
      return;
    }
    opsFetchInFlightRef.current = true;
    setOpsLoading(true);
    try {
      const response = await fetch("/api/travel-updates/ops?limit=12", {
        method: "GET",
      });
      if (!response.ok) {
        throw new Error(`Ops API returned ${response.status}`);
      }
      const snapshot = (await response.json()) as TravelOpsSnapshot;
      setOpsSnapshot(snapshot);
      setOpsError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown ops status error";
      setOpsError(message);
      if (trigger === "manual") {
        setToast(`Ops status unavailable: ${message}`);
      }
    } finally {
      setOpsLoading(false);
      opsFetchInFlightRef.current = false;
    }
  }, [setToast]);

  useEffect(() => {
    let active = true;
    const loadInitialOpsSnapshot = async (): Promise<void> => {
      try {
        const snapshot = await fetchInitialOpsSnapshotCached();
        if (!active) return;
        setOpsSnapshot(snapshot);
        setOpsError(null);
      } catch (error) {
        if (!active) return;
        const message = error instanceof Error ? error.message : "Unknown ops status error";
        setOpsError(message);
      }
    };
    void loadInitialOpsSnapshot();
    return () => {
      active = false;
    };
  }, []);

  const runOpsControlAction = useCallback(
    async (
      action: "run-background-once" | "reset-circuits" | "trigger-alert-sweep",
      options?: { dryRun?: boolean },
    ): Promise<void> => {
      const dryRun = options?.dryRun ?? false;
      const pendingKey = action === "run-background-once" && dryRun ? "run-background-dry" : action;
      setOpsActionPending(pendingKey);
      const idempotencyKey = `${action}:${dryRun ? "dry" : "live"}:${Math.floor(Date.now() / 15000)}`;
      try {
        const response = await fetch("/api/travel-updates/ops/control", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body:
            action === "run-background-once"
              ? JSON.stringify({ action, mode: updateMode, timeoutMs: 45000, dryRun, idempotencyKey })
              : action === "trigger-alert-sweep"
                ? JSON.stringify({ action, force: true, idempotencyKey })
                : JSON.stringify({ action, idempotencyKey }),
        });

        const payload = (await response.json()) as {
          ok?: boolean;
          error?: string;
          replayed?: boolean;
          backgroundRun?: { status?: string; result?: { audit?: { newUpdates?: number; duplicateUpdates?: number } } };
        };
        if (!response.ok || payload.ok === false) {
          throw new Error(payload.error ?? `Ops control action failed with ${response.status}`);
        }

        if (action === "reset-circuits") {
          setToast(
            payload.replayed
              ? "Replayed prior circuit reset action (idempotent)."
              : "Provider circuits reset. Next checks will re-evaluate upstream health.",
          );
        } else if (action === "trigger-alert-sweep") {
          setToast(payload.replayed ? "Replayed prior alert sweep action." : "Manual alert sweep completed.");
        } else {
          const newUpdates = payload.backgroundRun?.result?.audit?.newUpdates ?? 0;
          const duplicateUpdates = payload.backgroundRun?.result?.audit?.duplicateUpdates ?? 0;
          const modeLabel = dryRun ? "Dry-run background check" : "Background run";
          const replayPrefix = payload.replayed ? "Replayed: " : "";
          setToast(`${replayPrefix}${modeLabel} completed (${newUpdates} new / ${duplicateUpdates} duplicate updates).`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown ops control failure";
        setToast(`Ops action failed: ${message}`);
      } finally {
        setOpsActionPending(null);
        void fetchOpsSnapshot("manual");
      }
    },
    [fetchOpsSnapshot, setToast, updateMode],
  );

  const runProviderCheck = useCallback(async (trigger: "auto" | "manual"): Promise<void> => {
    if (isProviderCheckRunning) {
      return;
    }
    if (updateMode === "off") {
      if (trigger === "manual") {
        setToast("Provider adapter disabled. Set NEXT_PUBLIC_TRAVEL_UPDATES_MODE=mock to test.");
      }
      return;
    }

    setIsProviderCheckRunning(true);
    try {
      const response = await fetch("/api/travel-updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: updateMode,
          reservations: providerEligibleReservations,
          nowIso: new Date(nowMs).toISOString(),
        }),
      });
      if (!response.ok) {
        throw new Error(`Transport updates API returned ${response.status}`);
      }
      const result = (await response.json()) as TravelUpdateCheckResult;
      setLastProviderCheckAt(new Date().toISOString());
      setLastProviderAttempts(result.attempts);
      setProviderCircuitOpen(result.circuitOpen);
      setLastProviderError(result.error);
      setProviderReports(result.providerReports);
      setLastAuditSummary(result.audit ?? null);
      setLastConflictSummary(result.conflictResolution ?? null);

      if (result.circuitOpen) {
        if (trigger === "manual") {
          setToast(result.error ?? "Provider circuit is open. Please retry later.");
        }
        return;
      }
      if (result.error) {
        if (trigger === "manual") {
          setToast(`Provider check failed: ${result.error}`);
        }
        return;
      }

      if (result.updates.length === 0) {
        if (trigger === "manual") {
          if (result.audit && result.audit.duplicateUpdates > 0) {
            setToast(
              `No net-new updates (${result.audit.duplicateUpdates} duplicate events suppressed by idempotency).`,
            );
          } else {
            setToast("No new transport updates right now.");
          }
        }
        return;
      }

      if (!canSyncItineraryNow) {
        setQueuedProviderUpdates((previous) => [...previous, ...result.updates]);
        setToast(`Queued ${result.updates.length} provider updates until sync is allowed.`);
        return;
      }

      const appliedCount = applyProviderUpdates(result.updates, result.provider ?? "provider");
      if (appliedCount > 0) {
        setToast(
          `Applied ${appliedCount} live transport updates${result.attempts > 1 ? ` (after ${result.attempts} attempts)` : ""}.`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown provider adapter failure";
      setLastProviderCheckAt(new Date().toISOString());
      setLastProviderAttempts(0);
      setProviderCircuitOpen(false);
      setLastProviderError(message);
      setProviderReports([]);
      setLastAuditSummary(null);
      setLastConflictSummary(null);
      if (trigger === "manual") {
        setToast(`Provider check failed: ${message}`);
      }
    } finally {
      void fetchOpsSnapshot("auto");
      setIsProviderCheckRunning(false);
    }
  }, [
    applyProviderUpdates,
    canSyncItineraryNow,
    fetchOpsSnapshot,
    isProviderCheckRunning,
    nowMs,
    providerEligibleReservations,
    setToast,
    updateMode,
  ]);

  useEffect(() => {
    if (!autoTransportUpdates) return;
    if (updateMode === "off") return;
    const timer = window.setInterval(() => {
      void runProviderCheck("auto");
    }, 90_000);
    return () => window.clearInterval(timer);
  }, [autoTransportUpdates, runProviderCheck, updateMode]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void fetchOpsSnapshot("auto");
    }, 120_000);
    return () => window.clearInterval(timer);
  }, [fetchOpsSnapshot]);

  const replayPendingOutbox = useCallback(
    (_reason: string, nowIso = new Date().toISOString()): number => {
      let replayed = 0;
      setOfflineOutbox((previous) => {
        const result = replayOfflineOutbox({
          snapshot: previous,
          nowIso,
          maxBatch: 60,
        });
        replayed = result.replayed;
        return result.snapshot;
      });
      if (replayed > 0) {
        setLastOutboxReplayAt(nowIso);
        setLastSyncAt(nowIso);
      }
      return replayed;
    },
    [],
  );

  const queueMutation = useCallback(
    (
      message: string,
      options?: {
        key?: string;
        reservationId?: string | null;
        fingerprint?: string;
      },
    ): void => {
      const nowIso = new Date().toISOString();
      let duplicateSuppressed = false;
      setOfflineOutbox((previous) => {
        const appended = appendOfflineOutboxEvent({
          snapshot: previous,
          nowIso,
          event: {
            key: options?.key ?? "mutation",
            message,
            fingerprint: options?.fingerprint,
            reservationId: options?.reservationId ?? null,
          },
        });
        duplicateSuppressed = appended.duplicateSuppressed;
        if (!canSyncItineraryNow) {
          return appended.snapshot;
        }
        const replayed = replayOfflineOutbox({
          snapshot: appended.snapshot,
          nowIso,
          maxBatch: 60,
        });
        if (replayed.replayed > 0) {
          setLastOutboxReplayAt(nowIso);
          setLastSyncAt(nowIso);
        }
        return replayed.snapshot;
      });
      if (duplicateSuppressed) {
        return;
      }
      if (canSyncItineraryNow) {
        setToast(`${message} Synced.`);
        return;
      }
      setToast(`${message} Queued until sync is allowed.`);
    },
    [canSyncItineraryNow, setToast],
  );

  const drainQueuedProviderUpdates = (isSyncAllowed: boolean, reason: string): number => {
    if (!isSyncAllowed || queuedProviderUpdates.length === 0) {
      return 0;
    }
    const appliedCount = applyProviderUpdates(queuedProviderUpdates, "queued-provider-updates");
    setQueuedProviderUpdates([]);
    setToast(`Applied ${appliedCount} queued provider updates (${reason}).`);
    return appliedCount;
  };

  const handleNetworkModeChange = (nextMode: NetworkMode): void => {
    setNetworkMode(nextMode);
    const syncAllowed = nextMode === "wifi" || (!wifiOnlySync && nextMode === "cellular");
    drainQueuedProviderUpdates(syncAllowed, "network changed");
    if (syncAllowed) {
      const replayed = replayPendingOutbox("network changed");
      if (replayed > 0) {
        setToast(`Replayed ${replayed} queued actions after network change.`);
      }
    }
  };

  const handleWifiOnlySyncToggle = (nextValue: boolean): void => {
    setWifiOnlySync(nextValue);
    const syncAllowed = networkMode === "wifi" || (!nextValue && networkMode === "cellular");
    drainQueuedProviderUpdates(syncAllowed, "Wi-Fi policy changed");
    if (syncAllowed) {
      const replayed = replayPendingOutbox("Wi-Fi policy changed");
      if (replayed > 0) {
        setToast(`Replayed ${replayed} queued actions after policy change.`);
      }
    }
  };

  const flushPendingSync = (): void => {
    if (networkMode === "offline") {
      setToast("Still offline. Pending updates remain queued.");
      return;
    }
    const appliedFromQueue = drainQueuedProviderUpdates(true, "manual sync");
    const replayedActions = replayPendingOutbox("manual sync");
    setLastSyncAt(new Date().toISOString());
    setToast(
      appliedFromQueue > 0 || replayedActions > 0
        ? `Manual sync completed. Applied ${appliedFromQueue} queued provider updates and replayed ${replayedActions} actions.`
        : "Manual sync completed.",
    );
  };

  const evaluateStatus = (): void => {
    if (
      minutesToDeparture <= 75 ||
      unresolvedReviewCount >= 2 ||
      unresolvedReadinessCount >= 2 ||
      blockingIssueCount > 0
    ) {
      applyGovernedStatus("red", "auto");
      return;
    }
    if (minutesToDeparture <= 160 || unresolvedReadinessCount > 0) {
      applyGovernedStatus("yellow", "auto");
      return;
    }
    applyGovernedStatus("green", "auto");
  };

  const advanceTripStage = (): void => {
    const nextStage = nextTripStage(tripStage);
    if (nextStage === tripStage) {
      setToast("Trip already at final stage.");
      return;
    }
    pushUndoSnapshot(`Stage advanced to ${nextStage}`);
    setTripStage(nextStage);
    setToast(`Moved to ${STAGE_LABEL[nextStage]} stage.`);
  };

  const applyDemoPreset = (preset: DemoPresetId): void => {
    pushUndoSnapshot(`Applied demo preset: ${preset}`);
    const appliedAt = new Date().toISOString();
    setLastDemoPresetAppliedAt(appliedAt);
    setLastDemoPresetId(preset);

    if (preset === "smooth-trip") {
      setTripStage("pre-departure");
      setTripStatus("green");
      setActiveScenario("none");
      setMinutesToDeparture(180);
      setNetworkMode("wifi");
      setWifiOnlySync(false);
      setAllowCellularLocationUpdates(true);
      setReadinessItems((previous) =>
        previous.map((item) => (item.required ? { ...item, complete: true } : item)),
      );
      setReviewQueue([]);
      setReservations((previous) =>
        previous.map((reservation) =>
          reservation.critical
            ? {
                ...reservation,
                confidence: "high",
                notes: appendUniqueNote(reservation.notes, "[Demo] Smooth trip confirmation complete."),
              }
            : reservation,
        ),
      );
      setToast("Demo preset applied: smooth trip.");
      return;
    }

    if (preset === "moderate-delay") {
      setTripStage("airport");
      setTripStatus("yellow");
      setActiveScenario("train-delay");
      setMinutesToDeparture(95);
      setNetworkMode("cellular");
      setWifiOnlySync(true);
      setAllowCellularLocationUpdates(true);
      setReservations((previous) => {
        const targetIndex = previous.findIndex(
          (reservation) =>
            reservation.type === "flight" || reservation.type === "train" || reservation.type === "ride",
        );
        return previous.map((reservation, index) => {
          if (index !== targetIndex) {
            return reservation;
          }
          const baseMs = parseDateInput(reservation.localTime);
          return {
            ...reservation,
            localTime: Number.isNaN(baseMs) ? reservation.localTime : formatDateTimeLocal(baseMs + 40 * 60_000),
            confidence: "medium",
            notes: appendUniqueNote(
              reservation.notes,
              "[Demo] Moderate delay simulated. Confirm transfer and meeting times.",
            ),
          };
        });
      });
      setReviewQueue((previous) => {
        if (previous.length > 0) {
          return previous;
        }
        return [
          {
            id: nextId("review"),
            reasons: ["Delay caused uncertainty in transfer handoff timing."],
            impact: "Transfer and dinner windows might shift by 20-40 minutes.",
            sourceEmailSubject: "Demo preset: moderate delay",
            draft: {
              type: "ride",
              title: "Airport transfer timing check",
              provider: "Rideshare",
              localTime: formatDateTimeLocal(Date.now() + 2 * 60 * 60_000),
              timezone: "America/Los_Angeles",
              location: "Airport pickup zone",
              confirmationCode: "DMO-4021",
              assignedTo: [selectedFamilyMember.id],
              stage: "arrival",
              critical: true,
              confidence: "medium",
              notes: "Verify updated pickup estimate after arrival delay.",
            },
          },
        ];
      });
      setToast("Demo preset applied: moderate delay scenario.");
      return;
    }

    setTripStage("recovery");
    setTripStatus("red");
    setActiveScenario("missed-flight");
    setMinutesToDeparture(30);
    setNetworkMode("offline");
    setWifiOnlySync(true);
    setAllowCellularLocationUpdates(false);
    setReadinessItems((previous) =>
      previous.map((item, index) => (item.required && index < 2 ? { ...item, complete: false } : item)),
    );
    setReviewQueue((previous) => {
      if (previous.length >= 2) {
        return previous;
      }
      return [
        {
          id: nextId("review"),
          reasons: ["Missed-flight recovery requires confirmation of rebooked segment details."],
          impact: "Incorrect rebook timing can propagate to hotel and transfer misses.",
          sourceEmailSubject: "Demo preset: severe disruption rebook",
          draft: {
            type: "flight",
            title: "Rebooked flight pending confirmation",
            provider: "Airline desk",
            localTime: formatDateTimeLocal(Date.now() + 4 * 60 * 60_000),
            timezone: "America/Los_Angeles",
            location: "Updated gate pending",
            confirmationCode: "DMO-RBK1",
            assignedTo: [selectedFamilyMember.id],
            stage: "recovery",
            critical: true,
            confidence: "low",
            notes: "Validate final departure and arrival before publishing live.",
          },
        },
        ...previous,
      ];
    });
    setReservations((previous) =>
      previous.map((reservation) =>
        reservation.critical
          ? {
              ...reservation,
              confidence: "high",
              notes: appendUniqueNote(reservation.notes, "[Demo] Severe disruption protocol active."),
            }
          : reservation,
      ),
    );
    setToast("Demo preset applied: severe disruption scenario.");
  };

  const triggerReminderDispatch = (): void => {
    const dueCheckpoints = reminderLadder.filter((item) => item.state === "due" || item.state === "missed");
    if (dueCheckpoints.length === 0) {
      setToast("No due reminders to dispatch right now.");
      return;
    }
    setLastReminderSentAt(new Date().toISOString());
    queueMutation(`Dispatched ${dueCheckpoints.length} reminder checkpoints.`);
  };

  const runSmartEscalation = (): void => {
    const dueItems = perReservationEscalations.filter(
      (item) => item.level === "critical" || item.level === "high" || item.level === "medium",
    );
    if (dueItems.length === 0) {
      setToast("Smart reminder engine found no due escalations.");
      return;
    }
    pushUndoSnapshot("Smart escalation updates");
    if (dueItems.some((item) => item.level === "critical")) {
      applyGovernedStatus("red", "auto");
      setTripStage("airport");
    } else if (dueItems.some((item) => item.level === "high") && tripStatus === "green") {
      applyGovernedStatus("yellow", "auto");
    }
    setLastReminderSentAt(new Date().toISOString());
    queueMutation(`Smart escalation pushed for ${dueItems.length} reservation checkpoints.`);
  };

  const simulateDisruption = (scenario: Exclude<DisruptionScenario, "none">): void => {
    pushUndoSnapshot(`Disruption simulation (${scenario})`);
    setActiveScenario(scenario);
    setTripStage("recovery");

    if (scenario === "missed-flight") {
      applyGovernedStatus("red", "manual");
      setMinutesToDeparture(35);
      queueMutation("Simulation: missed flight recovery triggered.");
      return;
    }
    if (scenario === "train-delay") {
      applyGovernedStatus("yellow", "manual");
      setMinutesToDeparture(85);
      queueMutation("Simulation: train delay recovery triggered.");
      return;
    }
    applyGovernedStatus("red", "manual");
    setMinutesToDeparture(50);
    queueMutation("Simulation: ride no-show recovery triggered.");
  };

  const clearScenarioSimulation = (): void => {
    if (activeScenario !== "none") {
      pushUndoSnapshot("Clear disruption simulation");
    }
    setActiveScenario("none");
    setToast("Disruption simulation cleared.");
  };

  const quarantineDraftToReview = useCallback(
    (draft: ReservationDraft, context: { sourceEmailSubject: string; impact: string; prependReason?: string }): void => {
      const integrity = evaluateReservationIntegrity(draft);
      const reasons = integrity.issues.map((issue) => issue.message);
      const combinedReasons = context.prependReason ? [context.prependReason, ...reasons] : reasons;
      const queueItem: ReviewItem = {
        id: nextId("review"),
        reasons: combinedReasons.length > 0 ? combinedReasons : ["Manual review required before activation."],
        impact: context.impact,
        sourceEmailSubject: context.sourceEmailSubject,
        draft,
      };
      setReviewQueue((prev) => [queueItem, ...prev]);
      setToast("Unsafe reservation data quarantined to review queue.");
    },
    [setToast],
  );

  const handleVoiceQuickCapture = (): void => {
    pushUndoSnapshot("Voice capture queued");
    const capturedAt = new Date().toISOString();
    const draft: ReservationDraft = {
      type: tripStage === "airport" ? "ride" : "dinner",
      title:
        tripStage === "airport"
          ? `Voice capture: transfer update (${selectedFamilyMember.name})`
          : `Voice capture: plan update (${selectedFamilyMember.name})`,
      provider: "Voice intake",
      localTime: formatDateTimeLocal(nowMs + 2 * 60 * 60 * 1000),
      timezone: tripStage === "arrival" ? "America/Los_Angeles" : "America/New_York",
      location: "Needs confirmation from voice transcript",
      confirmationCode: `VOICE-${String(voiceCaptureCount + 1).padStart(3, "0")}`,
      assignedTo: [selectedFamilyMember.id],
      stage: tripStage,
      critical: tripStage === "airport" || tripStage === "recovery",
      confidence: "low",
      notes: "Captured from one-tap voice input. Validate key fields before live activation.",
    };
    const queueItem: ReviewItem = {
      id: nextId("review"),
      reasons: [
        "Voice capture requires transcript confirmation.",
        "Validate local time, timezone, and exact location before publish.",
      ],
      impact: "Fast voice input preserved context while moving; pending structured validation.",
      sourceEmailSubject: `Voice capture ${capturedAt}`,
      draft,
    };
    setReviewQueue((prev) => [queueItem, ...prev]);
    setVoiceCaptureCount((count) => count + 1);
    setLastVoiceCaptureAt(capturedAt);
    queueMutation("One-tap voice capture added to review queue.", {
      key: "voice-capture",
      fingerprint: `voice:${capturedAt}`,
    });
  };

  const handleQuickAdd = (source: "email-paste" | "manual"): void => {
    const normalizedText = quickAddText.trim();
    if (!normalizedText) {
      setToast("Add a quick note first so we can route it safely.");
      return;
    }
    const draftConfidence =
      source === "email-paste" && quickAddConfidence === "high" ? "medium" : quickAddConfidence;
    const draft: ReservationDraft = {
      type: quickAddType,
      title: normalizedText.slice(0, 80),
      provider: source === "email-paste" ? "Quick email intake" : "Quick manual add",
      localTime: formatDateTimeLocal(nowMs + 2 * 60 * 60 * 1000),
      timezone: tripStage === "arrival" ? "America/Los_Angeles" : "America/New_York",
      location: "Confirm exact location",
      confirmationCode: `${source === "email-paste" ? "EM" : "MAN"}-${Date.now().toString().slice(-6)}`,
      assignedTo: [selectedFamilyMember.id],
      stage: tripStage,
      critical: tripStage === "airport" || tripStage === "recovery",
      confidence: draftConfidence,
      notes:
        source === "email-paste"
          ? "Quick add from pasted email text. Verify fields before relying on timeline."
          : "Quick manual add created from universal input bar.",
    };
    const routeToReview = shouldQuickAddGoToReview({
      confidence: draft.confidence,
      inputText: normalizedText,
    });
    pushUndoSnapshot(routeToReview ? "Quick add routed to review queue" : "Quick add published to timeline");
    if (routeToReview) {
      setReviewQueue((prev) => [
        {
          id: nextId("review"),
          reasons: ["Quick add needs verification before live publish."],
          impact: "Potential timeline impact held safely in review queue.",
          sourceEmailSubject: source === "email-paste" ? "Quick pasted email" : "Quick manual note",
          draft,
        },
        ...prev,
      ]);
      setToast("Quick add captured and routed to review for safety.");
      setQuickAddText("");
      return;
    }
    setReservations((prev) => [{ ...draft, id: nextId("res"), source: "manual" }, ...prev]);
    setQuickAddText("");
    setToast("Quick add published to live timeline.");
  };

  const handleImportParsedReservations = useCallback(
    (importedReservations: GmailImportedReservation[]): void => {
      if (importedReservations.length === 0) {
        setToast("No Gmail reservations found or Gmail access is unavailable.");
        return;
      }

      const defaultAssignees = familyMembers.map((member) => member.id);
      const importedSamples: EmailSample[] = importedReservations.map((item) => ({
        id: `gmail-${item.messageId}`,
        sender: item.sender,
        receivedAt: item.receivedAt,
        subject: item.subject,
        body: item.body,
        confidence: item.reservation.confidence,
        issues: item.reservation.issues,
        parsed: {
          type: item.reservation.type,
          title: item.reservation.title,
          provider: item.reservation.provider,
          localTime: item.reservation.localTime,
          timezone: item.reservation.timezone,
          location: item.reservation.location,
          confirmationCode: item.reservation.confirmationCode,
          assignedTo: defaultAssignees,
          stage: defaultStageForReservationType(item.reservation.type),
          critical: item.reservation.type === "flight" || item.reservation.type === "train" || item.reservation.type === "ride",
          confidence: item.reservation.confidence,
          notes: `Imported from Gmail message ${item.messageId}`,
        },
      }));
      setEmailSamples(importedSamples);
      setSelectedEmailId(importedSamples[0]?.id ?? "");

      const queueItems: ReviewItem[] = importedReservations.map((item) => ({
        id: nextId("review"),
        reasons:
          item.reservation.issues.length > 0
            ? item.reservation.issues
            : ["Imported from Gmail API. Confirm before publishing to live itinerary."],
        impact: "Imported email needs review and confirmation before live activation.",
        sourceEmailSubject: item.subject,
        draft: {
          type: item.reservation.type,
          title: item.reservation.title,
          provider: item.reservation.provider,
          localTime: item.reservation.localTime,
          timezone: item.reservation.timezone,
          location: item.reservation.location,
          confirmationCode: item.reservation.confirmationCode,
          assignedTo: defaultAssignees,
          stage: defaultStageForReservationType(item.reservation.type),
          critical: item.reservation.type === "flight" || item.reservation.type === "train" || item.reservation.type === "ride",
          confidence: item.reservation.confidence,
          notes: `Imported via Gmail API from message ${item.messageId}.`,
        },
      }));
      setReviewQueue((prev) => [...queueItems, ...prev]);
      queueMutation("Imported reservations from Gmail API into review queue.", {
        key: "gmail-import",
        fingerprint: `gmail:${importedReservations.map((item) => item.messageId).join(",")}`,
      });
      setToast(`Imported ${importedReservations.length} Gmail reservation${importedReservations.length === 1 ? "" : "s"}.`);
    },
    [familyMembers, queueMutation, setToast],
  );

  const handleImportAction = (target: "live" | "review"): void => {
    if (!selectedEmail) return;
    pushUndoSnapshot(target === "live" ? "Import added to live trip" : "Import routed to review queue");
    if (target === "live") {
      const integrity = evaluateReservationIntegrity(selectedEmail.parsed);
      if (!integrity.safeForLive) {
        quarantineDraftToReview(selectedEmail.parsed, {
          sourceEmailSubject: selectedEmail.subject,
          impact: "Imported item was blocked from live itinerary due to invalid critical fields.",
          prependReason: "Quarantined: import failed integrity checks.",
        });
        queueMutation("Unsafe import quarantined for manual correction.", {
          key: "import-quarantine",
          fingerprint: `import:${selectedEmail.id}:quarantine`,
        });
        return;
      }
      const reservation: Reservation = {
        id: nextId("res"),
        ...selectedEmail.parsed,
        source: "imported",
      };
      setReservations((prev) => [reservation, ...prev]);
      queueMutation("Imported reservation to live trip.", {
        key: "import-live",
        reservationId: reservation.id,
        fingerprint: `import:${selectedEmail.id}:live`,
      });
      return;
    }
    const queueItem: ReviewItem = {
      id: nextId("review"),
      reasons: selectedEmail.issues.length > 0 ? selectedEmail.issues : ["Manual review requested before activation"],
      impact: "Needs confirmation before becoming active itinerary item.",
      sourceEmailSubject: selectedEmail.subject,
      draft: selectedEmail.parsed,
    };
    setReviewQueue((prev) => [queueItem, ...prev]);
    queueMutation("Import sent to review queue.", {
      key: "import-review",
      fingerprint: `import:${selectedEmail.id}:review`,
    });
  };

  const syncReservationsToGoogleCalendar = useCallback(
    async (reservationSnapshot: Reservation[], source: "manual" | "review-accept"): Promise<void> => {
      setCalendarSyncInFlight(true);
      setCalendarSyncTone("neutral");
      setCalendarSyncMessage("Syncing reservations to Google Calendar...");
      try {
        const response = await fetch("/api/travel-updates/calendar-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reservations: reservationSnapshot.map(toCalendarSyncReservationPayload),
          }),
        });
        const payload = (await response.json()) as {
          ok?: boolean;
          error?: string;
          created?: number;
          updated?: number;
          skipped?: number;
          failed?: number;
        };
        if (!response.ok || payload.ok === false) {
          throw new Error(payload.error ?? `Calendar sync failed with status ${response.status}`);
        }
        const summary = `Calendar sync complete: ${payload.created ?? 0} created, ${payload.updated ?? 0} updated, ${payload.skipped ?? 0} skipped${
          payload.failed && payload.failed > 0 ? `, ${payload.failed} failed` : ""
        }.`;
        setCalendarSyncTone("success");
        setCalendarSyncMessage(summary);
        if (source === "manual") {
          setToast(summary);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown calendar sync error.";
        setCalendarSyncTone("error");
        setCalendarSyncMessage(`Calendar sync failed: ${message}`);
        setToast(`Calendar sync failed: ${message}`);
      } finally {
        setCalendarSyncInFlight(false);
      }
    },
    [setToast],
  );

  const handleManualCalendarSync = useCallback((): void => {
    void syncReservationsToGoogleCalendar(reservations, "manual");
  }, [reservations, syncReservationsToGoogleCalendar]);

  const openDrawer = useCallback(
    (kind: "reservation" | "review", id: string): void => {
      if (kind === "reservation") {
        const reservation = reservations.find((item) => item.id === id);
        if (reservation) {
          setDrawerDraft({
            type: reservation.type,
            title: reservation.title,
            provider: reservation.provider,
            localTime: reservation.localTime,
            timezone: reservation.timezone,
            location: reservation.location,
            confirmationCode: reservation.confirmationCode,
            assignedTo: reservation.assignedTo,
            stage: reservation.stage,
            critical: reservation.critical,
            confidence: reservation.confidence,
            notes: reservation.notes,
          });
        }
      } else {
        const reviewItem = reviewQueue.find((item) => item.id === id);
        if (reviewItem) {
          setDrawerDraft(reviewItem.draft);
        }
      }
      setActiveDrawer({ kind, id });
    },
    [reservations, reviewQueue],
  );

  const closeDrawer = useCallback((): void => {
    setActiveDrawer(null);
  }, []);

  useEffect(() => {
    if (!activeDrawer) {
      return;
    }

    lastFocusedElementBeforeDrawerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusableSelector =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const focusFirstElement = (): void => {
      const container = drawerContainerRef.current;
      if (!container) return;
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(focusableSelector));
      const target = drawerCloseButtonRef.current ?? focusable[0];
      target?.focus();
    };

    focusFirstElement();

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDrawer();
        return;
      }
      if (event.key !== "Tab") return;

      const container = drawerContainerRef.current;
      if (!container) return;
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(focusableSelector));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

      if (event.shiftKey) {
        if (!activeElement || activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const lastFocused = lastFocusedElementBeforeDrawerRef.current;
      if (lastFocused) {
        lastFocused.focus();
      }
    };
  }, [activeDrawer, closeDrawer]);

  const applyIncidentAutopilotRecommendation = async (
    recommendation: IncidentAutopilotRecommendation,
  ): Promise<void> => {
    setAutopilotActionPending(recommendation.action);
    setLastAppliedAutopilotRecommendationTitle(recommendation.title);
    try {
      switch (recommendation.action) {
        case "switch-recovery-stage":
          if (tripStage !== "recovery") {
            pushUndoSnapshot("Autopilot switched stage to recovery");
            setTripStage("recovery");
          }
          setToast("Autopilot moved trip to recovery stage.");
          break;
        case "dispatch-reminders":
          triggerReminderDispatch();
          break;
        case "run-smart-escalation":
          runSmartEscalation();
          break;
        case "sync-now":
          flushPendingSync();
          break;
        case "open-review-top":
          if (reviewQueue.length > 0) {
            openDrawer("review", reviewQueue[0].id);
            setToast("Autopilot opened the top review item.");
          } else {
            setToast("Review queue already clear.");
          }
          break;
        case "run-background-once":
          await runOpsControlAction("run-background-once");
          break;
        case "refresh-ops":
          await fetchOpsSnapshot("manual");
          setToast("Ops snapshot refreshed.");
          break;
        case "trigger-alert-sweep":
          await runOpsControlAction("trigger-alert-sweep");
          break;
        case "reset-circuits":
          await runOpsControlAction("reset-circuits");
          break;
        default:
          break;
      }
    } finally {
      setAutopilotActionPending(null);
    }
  };

  const saveDrawer = (): void => {
    if (!activeDrawer) return;
    pushUndoSnapshot(activeDrawer.kind === "reservation" ? "Reservation edited" : "Review draft edited");
    if (activeDrawer.kind === "reservation") {
      const integrity = evaluateReservationIntegrity(drawerDraft);
      if (!integrity.safeForLive) {
        setReservations((prev) => prev.filter((item) => item.id !== activeDrawer.id));
        quarantineDraftToReview(drawerDraft, {
          sourceEmailSubject: `Reservation edit: ${drawerDraft.title || "Untitled"}`,
          impact: "Edited reservation was quarantined because integrity checks failed.",
          prependReason: "Quarantined: edited live reservation became unsafe.",
        });
        queueMutation("Unsafe live reservation moved to review queue.", {
          key: "reservation-quarantine",
          reservationId: activeDrawer.id,
        });
        closeDrawer();
        return;
      }
      setReservations((prev) =>
        prev.map((item) =>
          item.id === activeDrawer.id
            ? {
                ...item,
                ...drawerDraft,
              }
            : item,
        ),
      );
      queueMutation("Reservation updated.", {
        key: "reservation-update",
        reservationId: activeDrawer.id,
      });
    } else {
      setReviewQueue((prev) =>
        prev.map((item) => (item.id === activeDrawer.id ? { ...item, draft: drawerDraft } : item)),
      );
      queueMutation("Review item updated.");
    }
    closeDrawer();
  };

  const handleAcceptReview = (reviewId: string): void => {
    const target = reviewQueue.find((item) => item.id === reviewId);
    if (!target) return;
    const integrity = evaluateReservationIntegrity(target.draft);
    if (!integrity.safeForLive) {
      setReviewQueue((prev) =>
        prev.map((item) =>
          item.id === reviewId
            ? {
                ...item,
                reasons: [
                  ...new Set([
                    ...item.reasons,
                    ...integrity.issues.map((issue) => issue.message),
                    "Still blocked: resolve integrity issues before accepting to live trip.",
                  ]),
                ],
              }
            : item,
        ),
      );
      setToast("Cannot accept review item: integrity checks still failing.");
      return;
    }
    pushUndoSnapshot("Review item accepted");
    const newReservation: Reservation = {
      ...target.draft,
      id: nextId("res"),
      source: "review-accepted",
    };
    const nextReservations = [newReservation, ...reservations];
    setReservations((prev) => [newReservation, ...prev]);
    setReviewQueue((prev) => prev.filter((item) => item.id !== reviewId));
    queueMutation("Review item accepted into live trip.", {
      key: "review-accept",
      reservationId: newReservation.id,
    });
    void syncReservationsToGoogleCalendar(nextReservations, "review-accept");
  };

  const handleRejectReview = (reviewId: string): void => {
    pushUndoSnapshot("Review item rejected");
    setReviewQueue((prev) => prev.filter((item) => item.id !== reviewId));
    queueMutation("Review item archived.");
  };

  const handleReparseReview = (reviewId: string): void => {
    pushUndoSnapshot("Review item re-parsed");
    setReviewQueue((prev) =>
      prev.map((item) => {
        if (item.id !== reviewId) return item;
        const nextConfidence: Confidence =
          item.draft.confidence === "low" ? "medium" : item.draft.confidence === "medium" ? "high" : "high";
        return {
          ...item,
          reasons: nextConfidence === "high" ? ["Parser confidence improved. Verify before accepting."] : item.reasons,
          draft: { ...item.draft, confidence: nextConfidence },
        };
      }),
    );
    queueMutation("Re-parse completed.");
  };

  const handleMergeReview = (reviewId: string): void => {
    const targetReservationId = mergeTargetByReview[reviewId];
    if (!targetReservationId) {
      setToast("Choose a target reservation first.");
      return;
    }
    const reviewItem = reviewQueue.find((item) => item.id === reviewId);
    if (!reviewItem) return;
    const integrity = evaluateReservationIntegrity(reviewItem.draft);
    if (!integrity.safeForLive) {
      setReviewQueue((prev) =>
        prev.map((item) =>
          item.id === reviewId
            ? {
                ...item,
                reasons: [
                  ...new Set([
                    ...item.reasons,
                    ...integrity.issues.map((issue) => issue.message),
                    "Merge blocked until integrity issues are resolved.",
                  ]),
                ],
              }
            : item,
        ),
      );
      setToast("Cannot merge: review draft still fails integrity checks.");
      return;
    }
    pushUndoSnapshot("Review item merged");
    setReservations((prev) =>
      prev.map((item) => {
        if (item.id !== targetReservationId) return item;
        return {
          ...item,
          notes: `${item.notes}\nMerged note: ${reviewItem.draft.notes}`.trim(),
          location: reviewItem.draft.location.includes("???") ? item.location : reviewItem.draft.location,
          confidence: item.confidence === "high" ? "high" : reviewItem.draft.confidence,
        };
      }),
    );
    setReviewQueue((prev) => prev.filter((item) => item.id !== reviewId));
    queueMutation("Review item merged into existing reservation.", {
      key: "review-merge",
      reservationId: targetReservationId,
    });
  };

  const handleChecklistToggle = (id: string): void => {
    pushUndoSnapshot("Readiness checklist changed");
    setReadinessItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, complete: !item.complete } : item)),
    );
    queueMutation("Readiness checklist updated.");
  };

  const copyScript = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setToast("Script copied to clipboard.");
    } catch {
      setToast("Clipboard unavailable in this browser context.");
    }
  };

  const exportRows = useMemo(() => {
    const fromMs = parseDateInput(exportFrom);
    const toMs = parseDateInput(exportTo);
    return reservations
      .filter((reservation) => {
        if (exportScope === "selected-person" && !reservation.assignedTo.includes(selectedFamilyMember.id)) {
          return false;
        }
        const whenMs = parseDateInput(reservation.localTime);
        if (!Number.isNaN(fromMs) && !Number.isNaN(whenMs) && whenMs < fromMs) return false;
        if (!Number.isNaN(toMs) && !Number.isNaN(whenMs) && whenMs > toMs) return false;
        return true;
      })
      .flatMap((reservation) => {
        const owners = reservation.assignedTo
          .map((ownerId) => familyMembers.find((member) => member.id === ownerId)?.name ?? ownerId)
          .join(", ");
        return [
          {
            owner: owners,
            itemType: RESERVATION_TYPE_LABEL[reservation.type],
            title: reservation.title,
            provider: reservation.provider,
            localTime: reservation.localTime,
            timezone: reservation.timezone,
            location: reservation.location,
            confirmation: reservation.confirmationCode,
            notes: reservation.notes,
          },
        ];
      });
  }, [exportFrom, exportScope, exportTo, familyMembers, reservations, selectedFamilyMember.id]);

  const handleExportExcel = (): void => {
    const csv = buildCsv(exportRows);
    downloadBlob(
      `itinerary-${new Date().toISOString().slice(0, 10)}.csv`,
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    setToast("Excel export downloaded (CSV format).");
  };

  const handleExportWord = (): void => {
    const html = buildPremiumItineraryHtml({
      rows: exportRows,
      generatedAt: new Date().toLocaleString(),
      stageLabel: STAGE_LABEL[tripStage],
      statusLabel: STATUS_LABEL[tripStatus],
      confidenceScore: operationalConfidenceScore,
      scopeLabel: exportScope === "full-trip" ? "Full trip" : `${selectedFamilyMember.name} schedule`,
    });
    downloadBlob(
      `itinerary-${new Date().toISOString().slice(0, 10)}.doc`,
      new Blob([html], { type: "application/msword" }),
    );
    setToast("Word export downloaded.");
  };

  const handleExportPdf = (): void => {
    const printWindow = window.open("", "_blank", "width=1024,height=768");
    if (!printWindow) {
      setToast("Please allow popups to generate PDF.");
      return;
    }
    const printable = buildPremiumItineraryHtml({
      rows: exportRows,
      generatedAt: new Date().toLocaleString(),
      stageLabel: STAGE_LABEL[tripStage],
      statusLabel: STATUS_LABEL[tripStatus],
      confidenceScore: operationalConfidenceScore,
      scopeLabel: exportScope === "full-trip" ? "Full trip" : `${selectedFamilyMember.name} schedule`,
    });
    printWindow.document.write(printable);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    setToast("PDF print dialog opened.");
  };

  const toggleMemberSharing = (memberId: string): void => {
    setFamilyMembers((prev) =>
      prev.map((member) =>
        member.id === memberId ? { ...member, sharingEnabled: !member.sharingEnabled } : member,
      ),
    );
    queueMutation("Family location sharing preference updated.");
  };

  const toggleMemberVisibility = (memberId: string): void => {
    setFamilyMembers((prev) =>
      prev.map((member) =>
        member.id === memberId
          ? {
              ...member,
              visibility: member.visibility === "all-members" ? "organizer-only" : "all-members",
            }
          : member,
      ),
    );
    queueMutation("Location visibility updated.");
  };

  const locationStatusMessage = useMemo(() => {
    if (networkMode === "offline") return "Offline: locations are paused until connection returns.";
    if (networkMode === "cellular" && !allowCellularLocationUpdates) {
      return "Cellular active: live location is paused by policy.";
    }
    if (networkMode === "cellular" && allowCellularLocationUpdates) {
      return "Cellular active: location updates allowed.";
    }
    return "Wi-Fi active: full sync and location updates enabled.";
  }, [allowCellularLocationUpdates, networkMode]);

  const activeScenarioPlaybook = useMemo(() => {
    if (activeScenario === "missed-flight") {
      return {
        title: "Missed flight protocol",
        tone: "text-red-200",
        steps: [
          "Call airline rebooking desk with confirmation and ask for fastest protected seat.",
          "Notify hotel of revised ETA to preserve reservation.",
          "Confirm transfer fallback and notify family meeting plan.",
        ],
      };
    }
    if (activeScenario === "train-delay") {
      return {
        title: "Train delay protocol",
        tone: "text-amber-200",
        steps: [
          "Confirm new arrival estimate and platform update.",
          "Adjust rides/dinner windows for affected members.",
          "Re-export per-person static itinerary if delay exceeds 60 minutes.",
        ],
      };
    }
    if (activeScenario === "ride-no-show") {
      return {
        title: "Ride no-show protocol",
        tone: "text-red-200",
        steps: [
          "Initiate backup ride provider immediately.",
          "Send live location ping and meeting point to family group.",
          "Escalate to organizer if transfer exceeds safe buffer.",
        ],
      };
    }
    return {
      title: "No active disruption simulation",
      tone: "text-slate-300",
      steps: [
        "Run proactive readiness checks.",
        "Dispatch due reminders on cadence.",
        "Keep queue and timeline integrity panel clear.",
      ],
    };
  }, [activeScenario]);

  const recoveryScript = useMemo(() => {
    const flight = reservations.find((item) => item.type === "flight");
    if (!flight) return "I need rebooking assistance for an urgent disruption. Please confirm next available options.";
    return [
      `Hello, this is ${selectedFamilyMember.name}.`,
      `My confirmation code is ${flight.confirmationCode}.`,
      `I have a disruption risk for ${flight.title}.`,
      "Please prioritize the fastest rebooking option and text confirmation immediately.",
    ].join(" ");
  }, [reservations, selectedFamilyMember.name]);

  const handleTripStageEditorChange = useCallback(
    (nextStage: TripStage): void => {
      if (nextStage !== tripStage) {
        pushUndoSnapshot(`Stage manually changed to ${nextStage}`);
      }
      setTripStage(nextStage);
    },
    [pushUndoSnapshot, tripStage],
  );

  const handleTripStatusEditorChange = useCallback(
    (nextStatus: TripStatus): void => {
      applyGovernedStatus(nextStatus, "manual");
    },
    [applyGovernedStatus],
  );

  const handleFlowNavigatorStageSelect = useCallback(
    (stage: TripStage): void => {
      if (stage !== tripStage) {
        pushUndoSnapshot(`Stage selected from flow navigator: ${stage}`);
      }
      setTripStage(stage);
    },
    [pushUndoSnapshot, tripStage],
  );

  const handleOpenTopReview = useCallback((): void => {
    if (reviewQueue.length === 0) {
      setToast("Review queue is already clear.");
      return;
    }
    openDrawer("review", reviewQueue[0].id);
  }, [openDrawer, reviewQueue, setToast]);

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(56,189,248,0.14),transparent_45%),radial-gradient(circle_at_85%_25%,rgba(129,140,248,0.18),transparent_42%),radial-gradient(circle_at_50%_100%,rgba(34,197,94,0.08),transparent_45%)]" />
      <div className="relative z-10 mx-auto max-w-[1400px] space-y-5 px-3 py-5 sm:space-y-6 sm:px-4 sm:py-6 md:px-6">
        <header>
          <TravelAssistantTopControls
            tripStatus={tripStatus}
            statusBadgeByTripStatus={STATUS_BADGE}
            statusLabelByTripStatus={STATUS_LABEL}
            tripStage={tripStage}
            stageLabelByTripStage={STAGE_LABEL}
            leaveByMinutes={leaveByMinutes}
            reviewQueueLength={reviewQueue.length}
            operationalConfidenceScore={operationalConfidenceScore}
            blockingIssueCount={blockingIssueCount}
            guidanceTone={guidanceTone}
            suppressedNudgeCount={suppressedNudgeCount}
            lastSessionRestoreAt={lastSessionRestoreAt}
            formatClock={formatClock}
            onTripStageChange={handleTripStageEditorChange}
            onTripStatusChange={handleTripStatusEditorChange}
            onGuidanceToneChange={setGuidanceTone}
            minutesToDeparture={minutesToDeparture}
            onMinutesToDepartureChange={setMinutesToDeparture}
            onEvaluateStatus={evaluateStatus}
          />
        </header>
        <QuickAddLane
          onEvaluateStatus={evaluateStatus}
          onRunSmartEscalation={runSmartEscalation}
          onTriggerReminderDispatch={triggerReminderDispatch}
          onFlushPendingSync={flushPendingSync}
          personalTimelineOnly={personalTimelineOnly}
          onTogglePersonalTimelineOnly={() => setPersonalTimelineOnly((value) => !value)}
          onAdvanceTripStage={advanceTripStage}
          onUndoLastCriticalChange={undoLastCriticalChange}
          stageFocusMode={stageFocusMode}
          onToggleStageFocusMode={() => setStageFocusMode((value) => !value)}
          quickAddText={quickAddText}
          onQuickAddTextChange={setQuickAddText}
          quickAddType={quickAddType}
          reservationTypeLabelByType={RESERVATION_TYPE_LABEL}
          onQuickAddTypeChange={setQuickAddType}
          quickAddConfidence={quickAddConfidence}
          onQuickAddConfidenceChange={setQuickAddConfidence}
          onVoiceQuickCapture={handleVoiceQuickCapture}
          onQuickAdd={handleQuickAdd}
          undoStackLength={undoStack.length}
        />
        <TripOrientationCard
          tripStage={tripStage}
          nextStage={nextStage}
          stageLabelByTripStage={STAGE_LABEL}
          nextBestFlowAction={nextBestFlowAction}
          nextStageAction={nextStageAction}
          onAdvanceTripStage={advanceTripStage}
          lastDemoPresetAppliedAt={lastDemoPresetAppliedAt}
          lastDemoPresetId={lastDemoPresetId}
          demoPresets={DEMO_PRESETS}
          onApplyDemoPreset={applyDemoPreset}
          formatClock={formatClock}
          isCompactViewport={isCompactViewport}
          mobileSimpleView={mobileSimpleView}
          mobileViewPanel={mobileViewPanel}
          onToggleMobileSimpleView={() => setMobileSimpleView((value) => !value)}
          onMobileViewPanelChange={setMobileViewPanel}
        />
        {shouldRenderMobilePanel("essentials") ? (
          <AISuggestionPanel
            tripStage={tripStage}
            activeScenario={activeScenario}
            reservations={reservations}
            updateFeed={updateFeed}
          />
        ) : null}

        {shouldRenderMobilePanel("essentials") ? (
          <JourneyFlowPanel
            stages={STAGES}
            stageIndex={stageIndex}
            tripStage={tripStage}
            stageLabelByTripStage={STAGE_LABEL}
            nextBestFlowAction={nextBestFlowAction}
            stageFlowCards={stageFlowCards}
            onTripStageSelect={handleFlowNavigatorStageSelect}
            onVoiceQuickCapture={handleVoiceQuickCapture}
            onImportAction={handleImportAction}
            onOpenTopReview={handleOpenTopReview}
            reviewQueueLength={reviewQueue.length}
            voiceCaptureCount={voiceCaptureCount}
            lastVoiceCaptureAt={lastVoiceCaptureAt}
            selectedEmailSubject={selectedEmail?.subject ?? "No email selected"}
            undoStackLength={undoStack.length}
            undoAuditTrail={undoAuditTrail}
            formatClock={formatClock}
          />
        ) : null}

        {shouldRenderMobilePanel("essentials") ? (
          <section className="grid gap-4 sm:gap-6 xl:grid-cols-[1.2fr_1fr_1fr]">
          <article className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
            <h2 className="text-lg font-semibold">Adaptive stage actions</h2>
            <p className="text-xs text-slate-400">
              Primary buttons and guidance shift with stage and urgency level.
            </p>
            <nav className="mt-4 flex flex-wrap gap-2" aria-label="Adaptive stage actions">
              {STAGES.map((stage) => (
                <button
                  key={stage}
                  type="button"
                  onClick={() => {
                    if (stage !== tripStage) {
                      pushUndoSnapshot(`Stage selected from adaptive actions: ${stage}`);
                    }
                    setTripStage(stage);
                  }}
                  aria-current={stage === tripStage ? "true" : undefined}
                  className={`rounded-full px-3 py-1.5 text-sm ring-1 transition ${
                    stage === tripStage
                      ? "bg-cyan-500 text-slate-950 ring-cyan-300"
                      : "bg-slate-800 text-slate-200 ring-slate-700 hover:bg-slate-700"
                  }`}
                >
                  {STAGE_LABEL[stage]}
                </button>
              ))}
            </nav>
            <ul className="mt-4 space-y-2 text-sm">
              {primaryActions.map((action) => (
                <li key={action} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2">
                  {action}
                </li>
              ))}
            </ul>
            <div className="mt-4 rounded-xl border border-slate-700/80 bg-slate-950/70 p-3 text-sm">
              <p className="font-semibold text-cyan-200">Anti-miss guardrail</p>
              <p className="mt-1 text-slate-300">
                Critical cards cannot be considered fully safe if required details are unresolved. Leave-by time is
                continuously recalculated from risk signals.
              </p>
            </div>
            <div className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm">
              <p className="font-semibold text-rose-100">Cannot proceed to GREEN unless blockers clear</p>
              {statusGovernance.blockers.length > 0 ? (
                <ul className="mt-2 space-y-2 text-xs text-rose-100">
                  {statusGovernance.blockers.map((blocker) => (
                    <li key={`${blocker.code}-${blocker.reason}`} className="rounded border border-rose-400/30 px-2 py-1.5">
                      <p className="font-semibold">
                        {blocker.reason} (minimum status: {blocker.minimumStatus.toUpperCase()})
                      </p>
                      <p className="text-rose-100/80">{blocker.remediation}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-emerald-200">No blockers active. Green status can be set.</p>
              )}
            </div>
          </article>

          <article className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
            <h2 className="text-lg font-semibold">Readiness board</h2>
            <p className="text-xs text-slate-400">Flights, hotels, transfer, passport, essentials, first-night planning.</p>
            <div className="mt-3 space-y-2">
              {readinessItems.map((item) => (
                <label
                  key={item.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 ${
                    item.complete ? "border-emerald-500/40 bg-emerald-500/10" : "border-slate-700 bg-slate-900"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={item.complete}
                    onChange={() => handleChecklistToggle(item.id)}
                    className="mt-1"
                  />
                  <span className="flex-1">
                    <span className="block text-sm font-medium">{item.title}</span>
                    <span className="text-xs text-slate-400">
                      {item.category} {item.required ? "• Required" : "• Optional"}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </article>

          <ConnectivityPanel
            networkMode={networkMode}
            onNetworkModeChange={handleNetworkModeChange}
            wifiOnlySync={wifiOnlySync}
            onWifiOnlySyncToggle={handleWifiOnlySyncToggle}
            allowCellularLocationUpdates={allowCellularLocationUpdates}
            onAllowCellularLocationUpdatesChange={setAllowCellularLocationUpdates}
            locationStatusMessage={locationStatusMessage}
            lastSyncAt={lastSyncAt}
            pendingSyncCount={pendingSyncCount}
            pendingOutboxCount={pendingOutboxCount}
            lastOutboxReplayAt={lastOutboxReplayAt}
            updateMode={updateMode}
            lastProviderCheckAt={lastProviderCheckAt}
            lastProviderAttempts={lastProviderAttempts}
            providerCircuitOpen={providerCircuitOpen}
            queuedProviderUpdatesLength={queuedProviderUpdates.length}
            lastProviderError={lastProviderError}
            lastAuditSummary={lastAuditSummary}
            lastConflictSummary={lastConflictSummary}
            providerReports={providerReports}
            autoTransportUpdates={autoTransportUpdates}
            onAutoTransportUpdatesChange={setAutoTransportUpdates}
            onRunProviderCheck={() => {
              void runProviderCheck("manual");
            }}
            isProviderCheckRunning={isProviderCheckRunning}
            onFlushPendingSync={flushPendingSync}
            updateFeed={updateFeed}
            formatClock={formatClock}
            opsPanel={
              <Suspense fallback={<LazyPanelSkeleton label="Loading ops panel..." />}>
                <OpsPanel
                  showOpsSection={showOpsSection}
                  opsExpanded={opsExpanded}
                  onToggleExpanded={() =>
                    setOpsExpanded((previous) => {
                      const nextValue = !previous;
                      if (nextValue && !opsSnapshot) {
                        void fetchOpsSnapshot("auto");
                      }
                      return nextValue;
                    })
                  }
                  opsSnapshot={opsSnapshot}
                  opsLoading={opsLoading}
                  opsError={opsError}
                  statusBadgeByTripStatus={STATUS_BADGE}
                  opsActionPending={opsActionPending}
                  onRefreshOps={() => {
                    void fetchOpsSnapshot("manual");
                  }}
                  onRunBackgroundOnce={() => {
                    void runOpsControlAction("run-background-once");
                  }}
                  onRunBackgroundDry={() => {
                    void runOpsControlAction("run-background-once", { dryRun: true });
                  }}
                  onResetCircuits={() => {
                    void runOpsControlAction("reset-circuits");
                  }}
                  onTriggerAlertSweep={() => {
                    void runOpsControlAction("trigger-alert-sweep");
                  }}
                  formatClock={formatClock}
                  statusGovernanceBlockers={statusGovernance.blockers}
                />
              </Suspense>
            }
          />
          </section>
        ) : null}

        {showAntiMissSection && shouldRenderMobilePanel("timeline") ? (
          <section className="grid gap-4 sm:gap-6 xl:grid-cols-[1.2fr_1fr]">
          <article className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">Anti-miss automation cockpit</h2>
                <p className="text-xs text-slate-400">
                  Reminder cadence, per-reservation escalation intelligence, and one-click dispatch controls.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={runSmartEscalation}
                  className="rounded-lg bg-indigo-500/90 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-indigo-400"
                >
                  Run smart escalation
                </button>
                <button
                  type="button"
                  onClick={triggerReminderDispatch}
                  className="rounded-lg bg-cyan-500/90 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-cyan-400"
                >
                  Dispatch due reminders
                </button>
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-slate-700 bg-slate-950/70 p-3">
              <p className="text-sm font-semibold text-slate-100">Next critical segment</p>
              {nextCriticalReservation ? (
                <div className="mt-1 text-xs text-slate-300">
                  <p>
                    {nextCriticalReservation.reservation.title} • {nextCriticalReservation.reservation.localTime} (
                    {nextCriticalReservation.reservation.timezone})
                  </p>
                  <p className="text-slate-400">
                    {minutesUntilNextCritical !== null && minutesUntilNextCritical >= 0
                      ? `${minutesUntilNextCritical} minutes remaining`
                      : "Critical event appears to be in the past"}
                  </p>
                </div>
              ) : (
                <p className="mt-1 text-xs text-slate-400">No critical segments yet.</p>
              )}
              <p className="mt-2 text-xs text-slate-400">Last reminder dispatch: {formatClock(lastReminderSentAt)}</p>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {reminderLadder.map((checkpoint) => (
                <div
                  key={checkpoint.label}
                  className={`rounded-lg border p-2 text-xs ${
                    checkpoint.state === "due"
                      ? "border-amber-400/60 bg-amber-500/15 text-amber-100"
                      : checkpoint.state === "missed"
                        ? "border-red-400/60 bg-red-500/15 text-red-100"
                        : checkpoint.state === "upcoming"
                          ? "border-slate-700 bg-slate-900 text-slate-200"
                          : "border-slate-700/60 bg-slate-900/50 text-slate-400"
                  }`}
                >
                  <p className="font-semibold">{checkpoint.label}</p>
                  <p>{checkpoint.detail}</p>
                </div>
              ))}
            </div>

            <div className="mt-3 rounded-xl border border-slate-700 bg-slate-950/70 p-3">
              <p className="text-sm font-semibold text-slate-100">Per-reservation escalation queue</p>
              <p className="text-xs text-slate-400">
                Type-aware checkpoints ensure flights, trains, rides, and dinners trigger at the right lead times.
              </p>
              <ul className="mt-2 max-h-44 space-y-2 overflow-auto pr-1 text-xs">
                {perReservationEscalations.map((item) => (
                  <li
                    key={item.id}
                    className={`rounded-md border px-2 py-1.5 ${
                      item.level === "critical"
                        ? "border-red-400/60 bg-red-500/15 text-red-100"
                        : item.level === "high"
                          ? "border-amber-400/60 bg-amber-500/15 text-amber-100"
                          : item.level === "medium"
                            ? "border-cyan-400/60 bg-cyan-500/10 text-cyan-100"
                            : item.level === "invalid"
                              ? "border-red-400/40 bg-red-500/10 text-red-100"
                              : "border-slate-700 bg-slate-900 text-slate-300"
                    }`}
                  >
                    <p className="font-semibold">
                      {item.title} • {RESERVATION_TYPE_LABEL[item.type]}
                    </p>
                    <p>{item.guidance}</p>
                    <p className="opacity-80">
                      {Number.isNaN(item.minutesUntil)
                        ? "Time unavailable"
                        : `${item.minutesUntil} min • ${item.timezone} • confidence ${item.confidence}`}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </article>

          <article className="space-y-4 rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
            <div>
              <h2 className="text-lg font-semibold">Timeline integrity scanner</h2>
              <p className="text-xs text-slate-400">
                Detects timezone ambiguity, parsing gaps, duplicates, and person-level schedule conflicts.
              </p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
              <p className="text-sm font-semibold">Detected issues: {timelineIssues.length}</p>
              <p className="text-xs text-slate-400">
                Blocking: {blockingIssueCount} • Due reminders: {dueReminderCount} • Smart escalations:{" "}
                {smartEscalationDueCount}
              </p>
              <ul className="mt-2 max-h-52 space-y-2 overflow-auto pr-1 text-xs">
                {timelineIssues.length > 0 ? (
                  timelineIssues.map((issue) => (
                    <li
                      key={issue.id}
                      className={`rounded-md border px-2 py-1.5 ${
                        issue.severity === "high"
                          ? "border-red-400/60 bg-red-500/10 text-red-100"
                          : "border-amber-400/50 bg-amber-500/10 text-amber-100"
                      }`}
                    >
                      <p className="font-semibold">{issue.message}</p>
                      <p className="text-[11px] opacity-90">{issue.recommendation}</p>
                    </li>
                  ))
                ) : (
                  <li className="rounded-md border border-emerald-400/40 bg-emerald-500/10 px-2 py-1.5 text-emerald-100">
                    No timeline conflicts detected.
                  </li>
                )}
              </ul>
            </div>
          </article>
          </section>
        ) : (
          <section className="rounded-2xl border border-slate-700 bg-slate-900/50 p-4 text-xs text-slate-400">
            Anti-miss cockpit is hidden by current focus or mobile view selection.
          </section>
        )}

        {shouldRenderMobilePanel("timeline") ? (
          <section className="grid gap-4 sm:gap-6 xl:grid-cols-[1.2fr_1fr]">
          <ReservationList
            visibleReservations={visibleReservations}
            personalTimelineOnly={personalTimelineOnly}
            onPersonalTimelineOnlyChange={setPersonalTimelineOnly}
            selectedFamilyMemberName={selectedFamilyMember.name}
            familyMembers={familyMembers}
            reservationTypeLabelByType={RESERVATION_TYPE_LABEL}
            pendingOutboxByReservationId={pendingOutboxByReservationId}
            hasGlobalOutboxPending={hasGlobalOutboxPending}
            flightLiveStatusByReservationId={flightLiveStatusByReservationId}
            railLiveStatusByReservationId={railLiveStatusByReservationId}
            onOpenReservationDrawer={(reservationId) => openDrawer("reservation", reservationId)}
            onCopyCallScript={copyScript}
            onCopyConfirmationCode={async (code) => {
              try {
                await navigator.clipboard.writeText(code);
                setToast("Confirmation code copied.");
              } catch {
                setToast("Clipboard unavailable.");
              }
            }}
          />

          <article className="space-y-6">
            <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
              <h2 className="text-lg font-semibold">Email import workflow</h2>
              <p className="text-xs text-slate-400">
                Raw email preview &rarr; parsed reservation object &rarr; live trip or review queue.
              </p>
              <label className="mt-3 block text-sm">
                <span className="mb-1 block text-slate-300">Choose sample import</span>
                <select
                  value={selectedEmailId}
                  onChange={(event) => setSelectedEmailId(event.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
                >
                  {emailSamples.map((sample) => (
                    <option key={sample.id} value={sample.id}>
                      {sample.subject}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Raw email</p>
                  <p className="mt-1 text-xs text-slate-300">
                    {selectedEmail.sender} • {new Date(selectedEmail.receivedAt).toLocaleString()}
                  </p>
                  <p className="mt-2 text-sm font-medium">{selectedEmail.subject}</p>
                  <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-300">{selectedEmail.body}</pre>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Parsed reservation object</p>
                  <p className="mt-2 text-sm">{selectedEmail.parsed.title}</p>
                  <p className="text-xs text-slate-300">{selectedEmail.parsed.provider}</p>
                  <p className="text-xs text-slate-300">
                    {selectedEmail.parsed.localTime} ({selectedEmail.parsed.timezone})
                  </p>
                  <p className="text-xs text-slate-300">{selectedEmail.parsed.location}</p>
                  <p className="text-xs text-slate-300">Code: {selectedEmail.parsed.confirmationCode}</p>
                  <p className="mt-2 text-xs text-slate-400">
                    Confidence: <span className="font-semibold">{selectedEmail.confidence}</span>
                  </p>
                  {selectedEmail.issues.length > 0 ? (
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-amber-200">
                      {selectedEmail.issues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-emerald-200">No parser issues detected.</p>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleImportAction("live")}
                  className="rounded-lg bg-emerald-500/90 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
                >
                  Add to live trip
                </button>
                <button
                  type="button"
                  onClick={() => handleImportAction("review")}
                  className="rounded-lg bg-amber-500/90 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400"
                >
                  Send to review queue
                </button>
              </div>
            </div>

            <ReviewQueue
              reviewQueue={reviewQueue}
              reservations={reservations.map((reservation) => ({ id: reservation.id, title: reservation.title }))}
              mergeTargetByReview={mergeTargetByReview}
              onMergeTargetChange={(reviewId, targetReservationId) =>
                setMergeTargetByReview((prev) => ({ ...prev, [reviewId]: targetReservationId }))
              }
              onAcceptReview={handleAcceptReview}
              onOpenReviewDrawer={(reviewId) => openDrawer("review", reviewId)}
              onRejectReview={handleRejectReview}
              onReparseReview={handleReparseReview}
              onMergeReview={handleMergeReview}
              onImportParsedReservations={handleImportParsedReservations}
            />
          </article>
          </section>
        ) : null}

        {showCollaborationSection && shouldRenderMobilePanel("family") ? (
          <section className="grid gap-4 sm:gap-6 xl:grid-cols-2">
          <article className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
            <h2 className="text-lg font-semibold">Static itinerary exports</h2>
            <p className="text-xs text-slate-400">
              Download PDF/Word/Excel-compatible itinerary snapshots with timezone and owner labels.
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-slate-300">Export scope</span>
                <select
                  value={exportScope}
                  onChange={(event) => setExportScope(event.target.value as "full-trip" | "selected-person")}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
                >
                  <option value="full-trip">Full trip</option>
                  <option value="selected-person">Selected person ({selectedFamilyMember.name})</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-300">From date (optional)</span>
                <input
                  type="text"
                  value={exportFrom}
                  onChange={(event) => setExportFrom(event.target.value)}
                  placeholder="2026-06-22 00:00"
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
                />
              </label>
              <label className="block text-sm md:col-span-2">
                <span className="mb-1 block text-slate-300">To date (optional)</span>
                <input
                  type="text"
                  value={exportTo}
                  onChange={(event) => setExportTo(event.target.value)}
                  placeholder="2026-06-23 23:59"
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
                />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleExportPdf}
                className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-white"
              >
                Export PDF
              </button>
              <button
                type="button"
                onClick={handleExportWord}
                className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-white"
              >
                Export Word
              </button>
              <button
                type="button"
                onClick={handleExportExcel}
                className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-white"
              >
                Export Excel
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Static exports include generated timestamp and should be refreshed after major disruptions.
            </p>
          </article>

          <Suspense fallback={<LazyPanelSkeleton label="Loading family panel..." />}>
            <FamilyPanel
              showFamilyMap={showFamilyMap}
              onShowFamilyMapChange={setShowFamilyMap}
              selectedFamilyMemberId={selectedFamilyMember.id}
              onSelectedFamilyMemberIdChange={setSelectedFamilyMemberId}
              selectedFamilyMember={selectedFamilyMember}
              familyMembers={familyMembers}
              canViewerSeeMember={canViewerSeeMember}
              nowMs={nowMs}
              canSendLocationNow={canSendLocationNow}
              onToggleMemberSharing={toggleMemberSharing}
              onToggleMemberVisibility={toggleMemberVisibility}
              visibleFamilyMarkers={visibleFamilyMarkers}
              formatClock={formatClock}
              onSyncGoogleCalendar={handleManualCalendarSync}
              calendarSyncInFlight={calendarSyncInFlight}
              calendarSyncMessage={calendarSyncMessage}
              calendarSyncTone={calendarSyncTone}
            />
          </Suspense>
          </section>
        ) : (
          <section className="rounded-2xl border border-slate-700 bg-slate-900/50 p-4 text-xs text-slate-400">
            Collaboration/export panels are hidden by current focus or mobile view selection.
          </section>
        )}

        <Suspense fallback={<LazyPanelSkeleton label="Loading disruption recovery..." />}>
          <DisruptionRecovery
            showRecoverySection={showRecoverySection && shouldRenderMobilePanel("recovery")}
            onSimulateDisruption={simulateDisruption}
            onClearSimulation={clearScenarioSimulation}
            incidentAutopilotRecommendations={incidentAutopilotRecommendations}
            autopilotActionPending={autopilotActionPending}
            onApplyIncidentAutopilotRecommendation={applyIncidentAutopilotRecommendation}
            lastAppliedAutopilotRecommendationTitle={lastAppliedAutopilotRecommendationTitle}
            recoveryScript={recoveryScript}
            onCopyScript={copyScript}
            activeScenarioPlaybook={activeScenarioPlaybook}
          />
        </Suspense>
      </div>

      {activeDrawer ? (
        <div className="fixed inset-0 z-40 flex items-end justify-end bg-slate-950/80 p-3 md:p-6">
          <div
            ref={drawerContainerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="travel-assistant-drawer-title"
            tabIndex={-1}
            className="h-full w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-4 md:max-h-[92vh]"
          >
            <div className="flex items-center justify-between">
              <h2 id="travel-assistant-drawer-title" className="text-lg font-semibold">
                {activeDrawer.kind === "reservation" ? "Reservation details" : "Review item details"}
              </h2>
              <button
                ref={drawerCloseButtonRef}
                type="button"
                onClick={closeDrawer}
                aria-label="Close details drawer"
                className="rounded-md bg-slate-800 px-2 py-1 text-sm ring-1 ring-slate-700 hover:bg-slate-700"
              >
                Close
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <label className="block">
                <span className="mb-1 block text-slate-300">Title</span>
                <input
                  value={drawerDraft.title}
                  onChange={(event) => setDrawerDraft((prev) => ({ ...prev, title: event.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
                />
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-slate-300">Type</span>
                  <select
                    value={drawerDraft.type}
                    onChange={(event) =>
                      setDrawerDraft((prev) => ({ ...prev, type: event.target.value as ReservationType }))
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
                  >
                    {(Object.keys(RESERVATION_TYPE_LABEL) as ReservationType[]).map((type) => (
                      <option key={type} value={type}>
                        {RESERVATION_TYPE_LABEL[type]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-slate-300">Provider</span>
                  <input
                    value={drawerDraft.provider}
                    onChange={(event) => setDrawerDraft((prev) => ({ ...prev, provider: event.target.value }))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-slate-300">Local time</span>
                  <input
                    value={drawerDraft.localTime}
                    onChange={(event) => setDrawerDraft((prev) => ({ ...prev, localTime: event.target.value }))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-slate-300">Timezone</span>
                  <input
                    value={drawerDraft.timezone}
                    onChange={(event) => setDrawerDraft((prev) => ({ ...prev, timezone: event.target.value }))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
                  />
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-slate-300">Location</span>
                <input
                  value={drawerDraft.location}
                  onChange={(event) => setDrawerDraft((prev) => ({ ...prev, location: event.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-slate-300">Confirmation code</span>
                <input
                  value={drawerDraft.confirmationCode}
                  onChange={(event) =>
                    setDrawerDraft((prev) => ({ ...prev, confirmationCode: event.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-slate-300">Assigned people</span>
                <div className="grid gap-2 rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs">
                  {familyMembers.map((member) => (
                    <label key={member.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={drawerDraft.assignedTo.includes(member.id)}
                        onChange={(event) =>
                          setDrawerDraft((prev) => ({
                            ...prev,
                            assignedTo: event.target.checked
                              ? [...prev.assignedTo, member.id]
                              : prev.assignedTo.filter((id) => id !== member.id),
                          }))
                        }
                      />
                      {member.name}
                    </label>
                  ))}
                </div>
              </label>
              <label className="block">
                <span className="mb-1 block text-slate-300">Notes</span>
                <textarea
                  value={drawerDraft.notes}
                  onChange={(event) => setDrawerDraft((prev) => ({ ...prev, notes: event.target.value }))}
                  className="h-24 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
                />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={saveDrawer}
                className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
              >
                Save changes
              </button>
              {activeDrawer.kind === "review" ? (
                <button
                  type="button"
                  onClick={() => {
                    saveDrawer();
                    handleAcceptReview(activeDrawer.id);
                  }}
                  className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
                >
                  Save + accept review
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <footer className="relative z-10 mx-auto mt-2 max-w-[1400px] px-3 pb-6 text-xs text-slate-300 sm:px-4 md:px-6">
        Accessibility mode enabled: keyboard navigation, live status announcements, and screen-reader labels are active.
      </footer>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {toast ?? ""}
      </div>

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className={`fixed bottom-4 right-4 z-50 max-w-sm rounded-lg px-3 py-2 text-sm shadow-xl ${
            guidanceTone === "subtle"
              ? "border border-slate-600 bg-slate-900/90 text-slate-100"
              : "bg-slate-100 font-medium text-slate-900"
          }`}
        >
          {toast}
        </div>
      ) : null}
      <InstallPrompt />
    </main>
  );
}
