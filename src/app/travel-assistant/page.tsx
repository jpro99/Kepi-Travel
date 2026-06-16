"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useClerk, useUser } from "@clerk/nextjs";
import {
  cache,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";
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
  computeJourneyPhase,
  defaultConsumerTabForPhase,
  hasUpcomingTripEvents,
  shouldPromptAirportTransport,
  type JourneyPhase,
} from "@/lib/travelAssistant/journeyPhase";
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
import { scheduleLocalNotification, triggerHaptic } from "@/lib/native/capacitorBridge";
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
import { UpgradeModal, type UpgradeModalGateContext } from "@/components/billing/UpgradeModal";
import { InstallPrompt } from "@/components/InstallPrompt";
import { LanguageToggle } from "@/components/LanguageToggle";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import type { TripSetupDraft } from "@/components/onboarding/TripSetupForm";
import { ThemeToggle } from "@/components/ThemeToggle";
import { QuickAddLane } from "@/components/travelAssistant/QuickAddLane";
import { ReservationList } from "@/components/travelAssistant/ReservationList";
import { ReviewQueue } from "@/components/travelAssistant/ReviewQueue";
import { GmailImportScopeModal, type GmailImportScope } from "@/components/travelAssistant/GmailImportScopeModal";
import {
  ManualReservationEntryModal,
  type ManualReservationFormValue,
} from "@/components/travelAssistant/ManualReservationEntryModal";
import { TripCalendarView } from "@/components/travelAssistant/TripCalendarView";
import { NextUpCard } from "@/components/travelAssistant/NextUpCard";
import { TripTimeline } from "@/components/travelAssistant/TripTimeline";
import { GapAlerts } from "@/components/travelAssistant/GapAlerts";
import { ImportReservationsCard } from "@/components/travelAssistant/ImportReservationsCard";
import { countPlaceholderReservations } from "@/lib/travelAssistant/placeholderReservations";
import { OnTrackButton } from "@/components/travelAssistant/OnTrackButton";
import { TripSearch, type TripSearchSelection } from "@/components/travelAssistant/TripSearch";
import { TripSwitcher } from "@/components/travelAssistant/TripSwitcher";
import { TripOrientationCard } from "@/components/travelAssistant/TripOrientationCard";
import { DocumentVault } from "@/components/travelAssistant/DocumentVault";
import { PackingList } from "@/components/travelAssistant/PackingList";
import { BagControl } from "@/components/travelAssistant/BagControl";
import { AirportMode } from "@/components/travelAssistant/AirportMode";
import { ArrivalMode } from "@/components/travelAssistant/ArrivalMode";
import { FlightsTab } from "@/components/travelAssistant/FlightsTab";
import { HotelsTab } from "@/components/travelAssistant/HotelsTab";
import { ShareTripCard } from "@/components/travelAssistant/ShareTripCard";
import { TravelDayView } from "@/components/travelAssistant/TravelDayView";
import { ShareModal } from "@/components/travelAssistant/ShareModal";
import { ReferralCard } from "@/components/referral/ReferralCard";
import { WeatherCard } from "@/components/travelAssistant/WeatherCard";
import { LocalIntelligencePanel } from "@/components/travelAssistant/LocalIntelligencePanel";
import { ConciergePanel } from "@/components/travelAssistant/ConciergePanel";
import { trackEvent } from "@/lib/analytics/trackEvent";
import { formatApiErrorMessage } from "@/lib/api/readJsonResponse";
import { useBilling } from "@/lib/billing/BillingContext";
import type { PlanFeature } from "@/lib/billing/plans";
import { AdvancedModeToggle } from "@/components/ui/AdvancedModeToggle";
import { Logo } from "@/components/ui/Logo";
import { JourneyFlowPanel } from "./components/JourneyFlowPanel";
import { TravelAssistantTopControls } from "./components/TravelAssistantTopControls";
import { getAirportProximity } from "@/lib/travelAssistant/airportGeo";
import {
  resumePersistentFamilyLocationWatch,
  setFamilyLocationSender,
  startPersistentFamilyLocationWatch,
  stopPersistentFamilyLocationWatch,
} from "@/lib/family/familyLocationWatch";
import {
  deriveTripDateRangeFromReservations,
  hotelNeedsTripDateConfirmation,
} from "@/lib/travelAssistant/tripTimelinePlanning";
import { NewTripDatesCard } from "@/components/travelAssistant/NewTripDatesCard";
import { PlannerTab } from "@/components/travelAssistant/PlannerTab";

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
type VisibilityMode = "all-members" | "organizer-only";
type DisruptionScenario = "none" | "missed-flight" | "train-delay" | "ride-no-show";
type TimelineSectionTab = "reservations" | "documents" | "packing";
type ConsumerTab = "plan" | "trip" | "flights" | "hotels" | "map" | "more";

const CONSUMER_TABS: Array<{ id: ConsumerTab; label: string; icon: string }> = [
  { id: "plan", label: "Plan", icon: "🧭" },
  { id: "trip", label: "Trip", icon: "✈️" },
  { id: "flights", label: "Flights", icon: "🛫" },
  { id: "hotels", label: "Hotels", icon: "🏨" },
  { id: "map", label: "Map", icon: "🗺" },
  { id: "more", label: "More", icon: "···" },
];

function isConsumerTab(value: string | null): value is ConsumerTab {
  return CONSUMER_TABS.some((tab) => tab.id === value);
}

type AirportTransportChoice = "driving-myself" | "getting-dropped-off" | "uber-lyft" | "train-bus" | "other";

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
  flightNumber?: string;
  flightAirline?: string;
  flightDate?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  flightDepartureTime?: string;
  flightArrivalTime?: string;
  flightStatus?: string;
  flightDepartureGate?: string;
  flightDepartureTerminal?: string;
  flightArrivalGate?: string;
  flightArrivalTerminal?: string;
  flightDelayMinutes?: number;
  flightOnTime?: boolean;
  flightSeatNumber?: string;
  checkOutDate?: string;
  roomType?: string;
  trainNumber?: string;
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
  sourceChannel?: "email-forward" | "gmail-import" | "manual";
  parseConfidenceScore?: number;
  parsingStatus?: "auto-parsed" | "needs-review" | "needs-user-input";
  missingFields?: Array<"type" | "title" | "provider" | "confirmationCode" | "localTime" | "timezone" | "location">;
  originalEmailText?: string;
  hasPdfAttachment?: boolean;
  imageBasedEmail?: boolean;
  reviewStatus?: "pending" | "incomplete";
  parserNotes?: string[];
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

interface EmailForwardSetupStatus {
  forwardAddress: string | null;
  handle?: string | null;
  canChangeHandle?: boolean;
  nextHandleChangeAt?: string | null;
}

interface DrawerState {
  kind: "reservation" | "review";
  id: string;
}

interface PendingDeleteConfirmation {
  kind: "reservation" | "review";
  id: string;
  source: "reservation-card" | "review-card" | "review-drawer";
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

interface FlightStatusCheckResult {
  flightStatus: string;
  delayMinutes: number | null;
  departureGate: string;
  departureTerminal: string;
  arrivalGate: string;
  arrivalTerminal: string;
  onTime: boolean | null;
  checkedAt: string;
  busy: boolean;
  error: string | null;
  hotelStatusSummary?: string | null;
}

interface ManagedTrip {
  id: string;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  stage: TripStage;
  reservations: Reservation[];
  createdAt: string;
  tripStatus: TripStatus;
  minutesToDeparture: number;
  activeScenario: DisruptionScenario;
  reviewQueue: ReviewItem[];
  readinessItems: ReadinessItem[];
  updateFeed: UpdateFeedItem[];
  airportTransport: AirportTransportChoice | null;
  hotelArrivalTime: string | null;
}

type ManagedTripRuntimeSnapshot = {
  stage: TripStage;
  reservations: Reservation[];
  tripStatus: TripStatus;
  minutesToDeparture: number;
  activeScenario: DisruptionScenario;
  reviewQueue: ReviewItem[];
  readinessItems: ReadinessItem[];
  updateFeed: UpdateFeedItem[];
  airportTransport: AirportTransportChoice | null;
  hotelArrivalTime: string | null;
};

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
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
      <span className="sr-only">{label}</span>
      <div className="h-4 w-32 rounded-full bg-slate-200 dark:bg-slate-800" />
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="h-20 rounded-xl bg-slate-200/80 dark:bg-slate-800/80" />
        <div className="h-20 rounded-xl bg-slate-200/70 dark:bg-slate-800/70" />
        <div className="h-20 rounded-xl bg-slate-200/60 dark:bg-slate-800/60" />
      </div>
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

const AIRPORT_TRANSPORT_OPTIONS: Array<{ value: AirportTransportChoice; label: string }> = [
  { value: "driving-myself", label: "🚗 Driving myself" },
  { value: "getting-dropped-off", label: "👋 Getting dropped off" },
  { value: "uber-lyft", label: "🚕 Uber or Lyft" },
  { value: "train-bus", label: "🚌 Train or bus" },
  { value: "other", label: "Other" },
];

const AIRPORT_TRANSPORT_LABEL: Record<AirportTransportChoice, string> = {
  "driving-myself": "Driving myself",
  "getting-dropped-off": "Getting dropped off",
  "uber-lyft": "Uber or Lyft",
  "train-bus": "Train or bus",
  other: "Other",
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
    name: "Traveler",
    role: "organizer",
    color: "#7dd3fc",
    sharingEnabled: true,
    visibility: "all-members",
    location: { lat: 40.6428, lon: -73.7808, updatedAt: new Date().toISOString() },
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
    assignedTo: ["alex"],
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
    assignedTo: ["alex"],
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
    assignedTo: ["alex"],
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
    assignedTo: ["alex"],
    stage: "arrival",
    critical: true,
    confidence: "medium",
    notes: "Guest may join after game event.",
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
      assignedTo: ["alex"],
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
      assignedTo: ["alex"],
      stage: "airport",
      critical: true,
      confidence: "low",
      notes: "Email mentions gate change but terminal string is truncated.",
    },
  },
];

const BASE_CHECKLIST: ReadinessItem[] = [
  { id: "ready-flight", category: "Flights", title: "Flight confirmation codes verified", complete: false, required: true },
  { id: "ready-hotel", category: "Hotels", title: "Hotel check-in and check-out confirmed", complete: false, required: true },
  { id: "ready-transport", category: "Transportation", title: "Airport transfer planned with fallback", complete: false, required: true },
  { id: "ready-passport", category: "Passport", title: "Passport validity verified", complete: false, required: true },
  { id: "ready-checkin", category: "Check-in timing", title: "Online check-in reminders set", complete: false, required: true },
  { id: "ready-arrival", category: "Arrival transfer", title: "Pickup location pinned", complete: false, required: true },
  { id: "ready-essentials", category: "Essentials", title: "Medication and chargers packed", complete: false, required: false },
  { id: "ready-night", category: "First-night", title: "First meal and sleep plan prepared", complete: false, required: false },
];

function buildChecklistFromReservations(
  reservations: { type: string; confirmationCode?: string; checkOutDate?: string; flightNumber?: string }[],
  savedItems?: ReadinessItem[],
): ReadinessItem[] {
  const hasFlights = reservations.some((r) => r.type === "flight" && r.confirmationCode);
  const hasHotel = reservations.some((r) => r.type === "hotel" && r.confirmationCode);
  const hasTransport = reservations.some((r) => r.type === "ride" || r.type === "train");

  return BASE_CHECKLIST.map((item) => {
    // If user has manually toggled this item, preserve their choice
    const saved = savedItems?.find((s) => s.id === item.id);
    if (saved) return saved;
    // Otherwise auto-check based on what's booked
    let complete = false;
    if (item.id === "ready-flight") complete = hasFlights;
    if (item.id === "ready-hotel") complete = hasHotel;
    if (item.id === "ready-transport") complete = hasTransport;
    return { ...item, complete };
  });
}

const INITIAL_CHECKLIST = BASE_CHECKLIST;

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
      assignedTo: ["alex"],
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
      assignedTo: ["alex"],
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

function mapManualReservationType(type: ManualReservationFormValue["reservationType"]): ReservationType {
  if (type === "flight") return "flight";
  if (type === "hotel") return "hotel";
  if (type === "train") return "train";
  if (type === "car" || type === "tour") return "ride";
  return "dinner";
}

function defaultStageForManualReservationType(type: ManualReservationFormValue["reservationType"]): TripStage {
  const mapped = mapManualReservationType(type);
  if (mapped === "flight" || mapped === "train") return "airport";
  if (mapped === "hotel" || mapped === "ride") return "arrival";
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

function formatConsumerReservationTime(value: string): string {
  const parsed = parseDateInput(value);
  if (Number.isNaN(parsed)) {
    return value || "Time not set";
  }
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(parsed));
}

function formatConsumerReservationDate(value: string): string {
  const parsed = parseDateInput(value);
  if (Number.isNaN(parsed)) {
    return value || "Date not set";
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(parsed));
}

function isValidTimezoneForDisplay(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: normalized });
    return true;
  } catch {
    return false;
  }
}

function formatTimezoneForDisplay(value: string | null | undefined): string {
  const normalized = (value ?? "").trim();
  if (!normalized) {
    return "Not set";
  }
  return isValidTimezoneForDisplay(normalized) ? normalized : "Not set";
}

function formatHotelArrivalDisplay(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Time not set";
  }
  const timeMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/u);
  if (!timeMatch) {
    return trimmed;
  }
  const hour = Number.parseInt(timeMatch[1] ?? "", 10);
  const minute = Number.parseInt(timeMatch[2] ?? "", 10);
  if (Number.isNaN(hour) || Number.isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return trimmed;
  }
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

function formatTripDepartureDate(value: string | null | undefined): string {
  if (!value) {
    return "Date not set";
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(parsed));
}

function getTripDaysAway(minutesToDeparture: number): number {
  return Math.max(0, Math.ceil(minutesToDeparture / 1440));
}

function getReservationEmoji(type: ReservationType): string {
  if (type === "flight") return "✈️";
  if (type === "hotel") return "🏨";
  if (type === "train") return "🚆";
  if (type === "ride") return "🚗";
  return "🍽️";
}

function getFriendlyReservationTitle(reservation: Reservation): string {
  if (reservation.type === "flight") {
    const flightNumber = reservation.title.match(/[A-Z]{2}\s?\d+/)?.[0];
    return flightNumber ? `${reservation.provider} ${flightNumber}` : `${reservation.provider} flight`;
  }
  if (reservation.type === "hotel") {
    return `${reservation.provider} check-in`;
  }
  return reservation.title;
}

function getFlightNumberLabel(reservation: Reservation): string {
  // Use the stored flightNumber field first (most reliable)
  const stored = reservation.flightNumber?.trim();
  if (stored && stored.length > 0) return stored.toUpperCase();
  // Fall back to parsing title
  const titleMatch = reservation.title.match(/\b([A-Z]{2}\s?\d{2,4})\b/u)?.[1];
  if (titleMatch) return titleMatch.replace(/\s+/gu, "").toUpperCase();
  return "Flight # pending";
}

function resolveFlightAirports(reservation: Reservation): { departureAirport: string; arrivalAirport: string } {
  const departureAirport = reservation.flightDepartureAirport?.trim() ?? "";
  const arrivalAirport = reservation.flightArrivalAirport?.trim() ?? "";

  // If the stored value looks like a full airport name (contains spaces or >4 chars)
  // try to extract just the IATA code or abbreviate it for the boarding pass display
  const toDisplayCode = (raw: string): string => {
    if (!raw) return "";
    // Already looks like an IATA code (3-4 uppercase letters)
    if (/^[A-Z]{3,4}$/.test(raw)) return raw;
    // Try to find a 3-letter IATA code in parentheses e.g. "Seoul Gimpo (GMP)"
    const parenMatch = raw.match(/\(([A-Z]{3})\)/u);
    if (parenMatch?.[1]) return parenMatch[1];
    // First word if ≤4 chars and all caps
    const firstWord = raw.split(/[\s\-–]/u)[0] ?? "";
    if (/^[A-Z]{3,4}$/.test(firstWord)) return firstWord;
    // Truncate to first meaningful word (city name)
    return raw.split(/[\s,\-–]/u)[0]?.slice(0, 6).toUpperCase() ?? raw.slice(0, 3).toUpperCase();
  };

  if (departureAirport || arrivalAirport) {
    return {
      departureAirport: toDisplayCode(departureAirport) || "DEP",
      arrivalAirport: toDisplayCode(arrivalAirport) || "ARR",
    };
  }
  const route = reservation.location.split(/->|→/u).map((part) => part.trim());
  return {
    departureAirport: toDisplayCode(route[0] ?? "") || "DEP",
    arrivalAirport: toDisplayCode(route[1] ?? "") || "ARR",
  };
}

function formatBoardingPassClock(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    return "--:--";
  }
  const parsed = Date.parse(normalized);
  if (!Number.isNaN(parsed)) {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(parsed));
  }
  const timeMatch = normalized.match(/\b\d{1,2}:\d{2}(?:\s?[AP]M)?\b/iu)?.[0];
  return timeMatch ?? "--:--";
}

/** Format arrival time with +1 day indicator or full date if next/later day */
function formatArrivalClock(arrivalTime: string, departureTime?: string): string {
  const timeOnly = formatBoardingPassClock(arrivalTime);
  if (!arrivalTime.trim() || timeOnly === "--:--") return timeOnly;

  // Try to detect next-day arrival
  const arrivalDate = arrivalTime.trim().slice(0, 10); // "YYYY-MM-DD"
  const departureDate = (departureTime ?? "").trim().slice(0, 10);

  if (arrivalDate && departureDate && arrivalDate > departureDate) {
    const daysDiff = Math.round(
      (Date.parse(arrivalDate + "T12:00:00") - Date.parse(departureDate + "T12:00:00")) / 86_400_000
    );
    const suffix = daysDiff === 1 ? " (+1 day)" :
      daysDiff > 1 ? ` (+${daysDiff} days)` : "";
    if (suffix) return timeOnly + suffix;
  }

  // If no departure to compare, show full date for context
  if (arrivalDate && arrivalDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const arrMs = Date.parse(arrivalDate + "T12:00:00");
    const todayMs = Date.parse(new Date().toISOString().slice(0, 10) + "T12:00:00");
    if (!Number.isNaN(arrMs) && arrMs > todayMs + 86_400_000) {
      // Future date - show month/day
      const d = new Date(arrMs);
      const monthDay = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return `${timeOnly} · ${monthDay}`;
    }
  }

  return timeOnly;
}

function formatHotelDate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Not set";
  }
  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(parsed));
  }
  return trimmed;
}

function formatCompactMeridiemTime(valueMs: number): string {
  const formatted = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(valueMs));
  const normalized = formatted.replace(/\s+/gu, "").toLowerCase();
  return normalized.endsWith(":00am") || normalized.endsWith(":00pm")
    ? normalized.replace(":00", "")
    : normalized;
}

function buildHotelCheckInStatusSummary(reservation: Reservation, nowMs = Date.now()): string {
  const confirmationCode = reservation.confirmationCode.trim() || "Code pending";
  const checkInMs = parseDateInput(reservation.localTime);
  if (!Number.isNaN(checkInMs) && checkInMs >= nowMs && checkInMs - nowMs <= 24 * 60 * 60 * 1000) {
    return `Check-in tomorrow at ${formatCompactMeridiemTime(checkInMs)} — ${confirmationCode}`;
  }
  if (!Number.isNaN(checkInMs)) {
    const dateLabel = new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(checkInMs));
    return `Check-in on ${dateLabel} — ${confirmationCode}`;
  }
  return `Check-in on ${reservation.localTime || "date pending"} — ${confirmationCode}`;
}

function parseCheckoutFromNotes(notes: string): string {
  // Match patterns like "check out May 29", "checkout: 2026-05-29", "check-out the 29th", "checking out 29th"
  const patterns = [
    /check[\s-]?out\s+(?:on\s+|the\s+|by\s+)?(\w+\s+\d{1,2}(?:th|st|nd|rd)?(?:[,\s]+\d{4})?)/iu,
    /check[\s-]?out\s*[:\-]\s*(\d{4}-\d{2}-\d{2})/iu,
    /(?:checking out|checks? out)\s+(?:on\s+|the\s+)?(\w+\s+\d{1,2}(?:th|st|nd|rd)?(?:[,\s]+\d{4})?)/iu,
    /depart(?:ure|s|ing)?\s+(?:on\s+)?(\w+\s+\d{1,2}(?:th|st|nd|rd)?(?:[,\s]+\d{4})?)/iu,
    /(\d{4}-\d{2}-\d{2})\s*(?:checkout|check.out|departure)/iu,
  ];
  for (const pattern of patterns) {
    const match = notes.match(pattern);
    if (match?.[1]) {
      const cleaned = match[1].replace(/(\d+)(?:th|st|nd|rd)/gu, "$1").trim();
      const ms = Date.parse(cleaned);
      if (!Number.isNaN(ms)) return new Date(ms).toISOString().slice(0, 10);
    }
  }
  // Handle ordinal-only: "the 29th", "29th", "on the 29" — infer current month/year
  const ordinalOnly = notes.match(/(?:check[\s-]?out|checkout|checking out|depart)[^0-9]*(\d{1,2})(?:th|st|nd|rd)?(?:\s|$)/iu);
  if (ordinalOnly?.[1]) {
    const day = parseInt(ordinalOnly[1], 10);
    if (day >= 1 && day <= 31) {
      const now = new Date();
      // Use current month, but if day has passed use next month
      const candidate = new Date(now.getFullYear(), now.getMonth(), day);
      if (candidate < now) candidate.setMonth(candidate.getMonth() + 1);
      return candidate.toISOString().slice(0, 10);
    }
  }
  return "";
}

function resolveHotelCardData(reservation: Reservation): {
  hotelName: string;
  checkInDate: string;
  checkOutDate: string;
  roomType: string;
  confirmationCode: string;
} {
  const reservationRecord = reservation as Reservation & Record<string, unknown>;
  const extractString = (...values: unknown[]): string => {
    for (const value of values) {
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
    return "";
  };
  const checkOutCandidate = extractString(
    reservationRecord.checkOutDate,
    reservationRecord.check_out_date,
    reservationRecord.checkoutDate,
    reservationRecord.checkout_date,
    reservationRecord.checkOut,
    reservationRecord.check_out,
    reservationRecord.checkout,
    reservationRecord.endDate,
  ) || parseCheckoutFromNotes(reservation.notes);

  const roomTypeCandidate = extractString(
    reservationRecord.roomType,
    reservationRecord.room_type,
    reservationRecord.room,
    reservationRecord.roomCategory,
    reservationRecord.room_category,
  );
  const roomTypeFromNotes = reservation.notes.match(/room(?:\s*type)?\s*[:\-]\s*([^\n|]+)/iu)?.[1]?.trim() ?? "";

  // Extract confirmation code from notes if not stored directly
  const confFromNotes = reservation.notes.match(
    /(?:confirmation|conf(?:irmation)?\s*(?:number|code|#)?|booking\s*(?:ref|number|code)|record\s*locator)\s*[:\-#]?\s*([A-Z0-9]{4,20})/iu
  )?.[1]?.trim() ?? "";

  return {
    hotelName: reservation.provider.trim() || reservation.title.trim() || "Hotel",
    checkInDate: formatHotelDate(reservation.localTime),
    checkOutDate: formatHotelDate(checkOutCandidate || ""),
    roomType: roomTypeCandidate || roomTypeFromNotes || "Not set",
    confirmationCode: reservation.confirmationCode.trim() || confFromNotes || "Not set",
  };
}

function extractApiErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.error === "string" && candidate.error.trim().length > 0) {
    return candidate.error.trim();
  }
  if (typeof candidate.message === "string" && candidate.message.trim().length > 0) {
    return candidate.message.trim();
  }
  return null;
}

function extractFlightLookupInput(reservation: Reservation): {
  flightNumber: string;
  airline: string;
  flightDate: string;
} | null {
  const reservationRecord = reservation as Reservation & Record<string, unknown>;
  const notesFlightNumber =
    reservation.notes.match(/\b(?:flight(?:\s*number)?|flt)\s*[:#-]?\s*([A-Z0-9]{2,3}\s?\d{1,4}[A-Z]?)\b/iu)?.[1] ??
    reservation.notes.match(/\b([A-Z0-9]{2,3}\s?\d{1,4}[A-Z]?)\b/u)?.[1] ??
    "";
  const inferredFlightNumber =
    (typeof reservationRecord.flightNumber === "string" ? reservationRecord.flightNumber : "") ||
    (typeof reservationRecord.flight_number === "string" ? reservationRecord.flight_number : "") ||
    (typeof reservationRecord.flightNum === "string" ? reservationRecord.flightNum : "") ||
    (typeof reservationRecord.flight_num === "string" ? reservationRecord.flight_num : "") ||
    (typeof reservationRecord.flightNo === "string" ? reservationRecord.flightNo : "") ||
    (typeof reservationRecord.flight_no === "string" ? reservationRecord.flight_no : "") ||
    (typeof reservationRecord.flightCode === "string" ? reservationRecord.flightCode : "") ||
    (typeof reservationRecord.flight_code === "string" ? reservationRecord.flight_code : "") ||
    (typeof reservationRecord.operatingFlightNumber === "string" ? reservationRecord.operatingFlightNumber : "") ||
    (typeof reservationRecord.operating_flight_number === "string" ? reservationRecord.operating_flight_number : "") ||
    (typeof reservationRecord.marketingFlightNumber === "string" ? reservationRecord.marketingFlightNumber : "") ||
    (typeof reservationRecord.marketing_flight_number === "string" ? reservationRecord.marketing_flight_number : "") ||
    (typeof reservationRecord.iataFlightNumber === "string" ? reservationRecord.iataFlightNumber : "") ||
    (typeof reservationRecord.iata_flight_number === "string" ? reservationRecord.iata_flight_number : "") ||
    notesFlightNumber ||
    reservation.title.match(/\b([A-Z0-9]{2,3}\s?\d{1,4}[A-Z]?)\b/u)?.[1] ||
    reservation.provider.match(/\b([A-Z0-9]{2,3}\s?\d{1,4}[A-Z]?)\b/u)?.[1] ||
    "";
  const flightNumber = inferredFlightNumber.replace(/[^A-Za-z0-9]/gu, "").toUpperCase();
  const airlineFromTitle = reservation.title
    .replace(/\b([A-Z0-9]{2,3}\s?\d{1,4}[A-Z]?)\b/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  const airline =
    (typeof reservationRecord.flightAirline === "string" ? reservationRecord.flightAirline : "") ||
    (typeof reservationRecord.flight_airline === "string" ? reservationRecord.flight_airline : "") ||
    (typeof reservationRecord.airlineName === "string" ? reservationRecord.airlineName : "") ||
    (typeof reservationRecord.airline_name === "string" ? reservationRecord.airline_name : "") ||
    (typeof reservationRecord.airline === "string" ? reservationRecord.airline : "") ||
    (typeof reservationRecord.carrier === "string" ? reservationRecord.carrier : "") ||
    (typeof reservationRecord.carrierName === "string" ? reservationRecord.carrierName : "") ||
    (typeof reservationRecord.carrier_name === "string" ? reservationRecord.carrier_name : "") ||
    (typeof reservationRecord.operator === "string" ? reservationRecord.operator : "") ||
    (typeof reservationRecord.operatorName === "string" ? reservationRecord.operatorName : "") ||
    (typeof reservationRecord.operator_name === "string" ? reservationRecord.operator_name : "") ||
    reservation.provider.trim() ||
    airlineFromTitle ||
    "Unknown Airline";
  const notesDate =
    reservation.notes.match(/\b(20\d{2}-\d{2}-\d{2})\b/u)?.[1] ??
    reservation.notes.match(/\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/u)?.[1] ??
    "";
  const flightDateRaw =
    (typeof reservationRecord.flightDate === "string" ? reservationRecord.flightDate : "") ||
    (typeof reservationRecord.flight_date === "string" ? reservationRecord.flight_date : "") ||
    (typeof reservationRecord.departureDate === "string" ? reservationRecord.departureDate : "") ||
    (typeof reservationRecord.departure_date === "string" ? reservationRecord.departure_date : "") ||
    (typeof reservationRecord.travelDate === "string" ? reservationRecord.travelDate : "") ||
    (typeof reservationRecord.travel_date === "string" ? reservationRecord.travel_date : "") ||
    (typeof reservationRecord.scheduledDeparture === "string" ? reservationRecord.scheduledDeparture : "") ||
    (typeof reservationRecord.scheduled_departure === "string" ? reservationRecord.scheduled_departure : "") ||
    (typeof reservationRecord.departureTime === "string" ? reservationRecord.departureTime : "") ||
    (typeof reservationRecord.departure_time === "string" ? reservationRecord.departure_time : "") ||
    (typeof reservationRecord.date === "string" ? reservationRecord.date : "") ||
    notesDate ||
    (typeof reservationRecord.localTime === "string" ? reservationRecord.localTime : "") ||
    (typeof reservationRecord.local_time === "string" ? reservationRecord.local_time : "");
  const flightDate =
    extractDateFromReservationLocalTime(flightDateRaw) || extractDateFromReservationLocalTime(reservation.localTime) || "";
  if (!flightNumber || !flightDate) {
    return null;
  }
  return { flightNumber, airline, flightDate };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getReservationRouteLabel(reservation: Reservation): string {
  if (reservation.type === "flight" || reservation.type === "train" || reservation.type === "ride") {
    if (reservation.location.includes("→")) {
      return reservation.location;
    }
    const routeFromTitle = reservation.title.match(/\b[A-Z]{3}\b\s*[→-]\s*\b[A-Z]{3}\b/u)?.[0];
    if (routeFromTitle) {
      return routeFromTitle.replace("-", "→");
    }
  }
  return reservation.location || reservation.provider || "Details pending";
}

function isOnboardingPlaceholderReservation(reservation: Reservation): boolean {
  const provider = reservation.provider.trim().toLowerCase();
  const notes = reservation.notes.trim().toLowerCase();
  return provider === "onboarding setup" || notes.includes("created during onboarding");
}

function isTripNamePlaceholder(name: string | null | undefined): boolean {
  if (!name) return true;
  const normalized = name.trim().toLowerCase();
  return normalized.length === 0 ||
    normalized === "my first trip" ||
    normalized === "my trip" ||
    normalized === "new trip" ||
    normalized === "untitled trip";
}

function isTripDestinationPlaceholder(destination: string | null | undefined): boolean {
  if (!destination) return true;
  const normalized = destination.trim().toLowerCase();
  return normalized.length === 0 || normalized === "set destination" || normalized === "destination pending";
}

function extractDestinationFromReservationLocation(location: string): string | null {
  const normalized = location.trim();
  if (!normalized) return null;
  const arrowMatch = normalized.match(/(.+?)(?:->|→)(.+)/u);
  if (arrowMatch?.[2]) {
    return arrowMatch[2].trim() || null;
  }
  return normalized;
}

function extractDateFromReservationLocalTime(localTime: string): string | null {
  const trimmed = localTime.trim();
  if (!trimmed) return null;
  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }
  const dateMatch = trimmed.match(/\d{4}-\d{2}-\d{2}/u);
  if (dateMatch?.[0]) {
    return dateMatch[0];
  }
  const usDateMatch = trimmed.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/u);
  if (usDateMatch) {
    const month = usDateMatch[1]?.padStart(2, "0");
    const day = usDateMatch[2]?.padStart(2, "0");
    const yearRaw = usDateMatch[3] ?? "";
    const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
    return `${year}-${month}-${day}`;
  }
  const verboseDateMatch = trimmed.match(
    /\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:,\s*\d{2,4})?)\b/iu,
  );
  if (verboseDateMatch?.[1]) {
    const verboseParsed = Date.parse(verboseDateMatch[1]);
    if (!Number.isNaN(verboseParsed)) {
      return new Date(verboseParsed).toISOString().slice(0, 10);
    }
  }
  return null;
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

const TRIP_API_ROUTE = "/api/trips";
const SWIPE_DELETE_REVEAL_PX = 92;
const EMAIL_HANDLE_COOKIE_NAME = "kepi-email-handle";
const EMAIL_FORWARD_DOMAIN = "trips.kepitravel.com";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function resolveViewerName(firstName: string | null | undefined, emailAddress: string | null | undefined): string {
  const normalizedFirstName = firstName?.trim();
  if (normalizedFirstName) {
    return normalizedFirstName;
  }
  const localPart = emailAddress?.split("@")[0]?.trim();
  if (localPart && localPart.length > 0) {
    return localPart;
  }
  return "Traveler";
}

function readCookieValue(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const parts = document.cookie.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [rawName, ...rawValueParts] = trimmed.split("=");
    if (rawName !== name) continue;
    return decodeURIComponent(rawValueParts.join("="));
  }
  return null;
}

function writeCookieValue(name: string, value: string, maxAgeSeconds: number): void {
  if (typeof document === "undefined") {
    return;
  }
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax${secure}`;
}

function sanitizeEmailHandle(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9-]/gu, "").slice(0, 20);
  return normalized.length > 0 ? normalized : null;
}

function composeForwardAddress(handle: string): string {
  return `${handle}@${EMAIL_FORWARD_DOMAIN}`;
}

function getEmailHandleFromCookie(): string | null {
  return sanitizeEmailHandle(readCookieValue(EMAIL_HANDLE_COOKIE_NAME));
}

function normalizeManagedTrip(trip: unknown): ManagedTrip | null {
  if (!trip || typeof trip !== "object") {
    return null;
  }
  const candidate = trip as Partial<ManagedTrip>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.name !== "string" ||
    typeof candidate.destination !== "string" ||
    typeof candidate.startDate !== "string" ||
    typeof candidate.endDate !== "string" ||
    typeof candidate.stage !== "string" ||
    typeof candidate.createdAt !== "string" ||
    !Array.isArray(candidate.reservations)
  ) {
    return null;
  }

  return {
    id: candidate.id,
    name: candidate.name,
    destination: candidate.destination,
    startDate: candidate.startDate,
    endDate: candidate.endDate,
    stage: candidate.stage as TripStage,
    reservations: candidate.reservations as Reservation[],
    createdAt: candidate.createdAt,
    tripStatus:
      candidate.tripStatus === "green" || candidate.tripStatus === "yellow" || candidate.tripStatus === "red"
        ? candidate.tripStatus
        : "yellow",
    minutesToDeparture:
      typeof candidate.minutesToDeparture === "number" ? Math.round(candidate.minutesToDeparture) : 180,
    activeScenario:
      candidate.activeScenario === "none" ||
      candidate.activeScenario === "missed-flight" ||
      candidate.activeScenario === "train-delay" ||
      candidate.activeScenario === "ride-no-show"
        ? candidate.activeScenario
        : "none",
    reviewQueue: Array.isArray(candidate.reviewQueue) ? (candidate.reviewQueue as ReviewItem[]) : [],
    readinessItems: Array.isArray(candidate.readinessItems) ? (candidate.readinessItems as ReadinessItem[]) : [],
    updateFeed: Array.isArray(candidate.updateFeed) ? (candidate.updateFeed as UpdateFeedItem[]) : [],
    airportTransport:
      candidate.airportTransport === "driving-myself" ||
      candidate.airportTransport === "getting-dropped-off" ||
      candidate.airportTransport === "uber-lyft" ||
      candidate.airportTransport === "train-bus" ||
      candidate.airportTransport === "other"
        ? candidate.airportTransport
        : null,
    hotelArrivalTime: typeof candidate.hotelArrivalTime === "string" && candidate.hotelArrivalTime.trim().length > 0
      ? candidate.hotelArrivalTime.trim()
      : null,
  };
}

function areSnapshotsEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function createRuntimeSnapshotFromManagedTrip(trip: ManagedTrip): ManagedTripRuntimeSnapshot {
  return {
    stage: trip.stage,
    reservations: trip.reservations,
    tripStatus: trip.tripStatus,
    minutesToDeparture: trip.minutesToDeparture,
    activeScenario: trip.activeScenario,
    reviewQueue: trip.reviewQueue,
    readinessItems: trip.readinessItems,
    updateFeed: trip.updateFeed,
    airportTransport: trip.airportTransport ?? null,
    hotelArrivalTime: trip.hotelArrivalTime ?? null,
  };
}

function defaultTripFromCurrentState(input: {
  reservations: Reservation[];
  tripStage: TripStage;
  tripStatus: TripStatus;
  minutesToDeparture: number;
  activeScenario: DisruptionScenario;
  reviewQueue: ReviewItem[];
  readinessItems: ReadinessItem[];
  updateFeed: UpdateFeedItem[];
  airportTransport: AirportTransportChoice | null;
  hotelArrivalTime: string | null;
}): {
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  stage: TripStage;
  reservations: Reservation[];
  tripStatus: TripStatus;
  minutesToDeparture: number;
  activeScenario: DisruptionScenario;
  reviewQueue: ReviewItem[];
  readinessItems: ReadinessItem[];
  updateFeed: UpdateFeedItem[];
  airportTransport: AirportTransportChoice | null;
  hotelArrivalTime: string | null;
} {
  const fallbackDate = new Date().toISOString().slice(0, 10);
  const firstReservationDate = input.reservations[0]?.localTime?.slice(0, 10) || fallbackDate;
  const startDate = firstReservationDate;
  const endDate = input.reservations[1]?.localTime?.slice(0, 10) || firstReservationDate;
  return {
    name: "My First Trip",
    destination: input.reservations[0]?.location || "Set destination",
    startDate,
    endDate,
    stage: input.tripStage,
    reservations: input.reservations,
    tripStatus: input.tripStatus,
    minutesToDeparture: input.minutesToDeparture,
    activeScenario: input.activeScenario,
    reviewQueue: input.reviewQueue,
    readinessItems: input.readinessItems,
    updateFeed: input.updateFeed,
    airportTransport: input.airportTransport,
    hotelArrivalTime: input.hotelArrivalTime,
  };
}

export default function TravelAssistantPage() {
  const clerk = useClerk();
  const { user } = useUser();
  const {
    status: billingStatus,
    loading: billingLoading,
    refresh: refreshGlobalBillingStatus,
    plan: billingStatusPlan,
    basePlan: billingBasePlan,
    hasProAccess,
    isLifetime,
    isTrial,
  } = useBilling();
  const updateMode: TravelUpdateMode =
    (process.env.NEXT_PUBLIC_TRAVEL_UPDATES_MODE ?? "auto").toLowerCase() === "off"
      ? "off"
      : (process.env.NEXT_PUBLIC_TRAVEL_UPDATES_MODE ?? "auto").toLowerCase() === "mock"
        ? "mock"
        : "auto";
  const [trips, setTrips] = useState<ManagedTrip[]>([]);
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [tripsLoading, setTripsLoading] = useState(true);
  const [upgradeModalGate, setUpgradeModalGate] = useState<UpgradeModalGateContext | null>(null);
  const [highlightedReservationId, setHighlightedReservationId] = useState<string | null>(null);
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
  const tripsRef = useRef<ManagedTrip[]>([]);
  const activeTripIdRef = useRef<string | null>(null);
  const activeTripRuntimeSnapshotRef = useRef<ManagedTripRuntimeSnapshot | null>(null);
  const sessionHydratedRef = useRef(false);
  const tripsHydratedRef = useRef(false);
  const urlTripHandledRef = useRef(false);
  const lastJourneyPhaseKindRef = useRef<string | null>(null);
  const applyingTripStateRef = useRef(false);
  const drawerContainerRef = useRef<HTMLDivElement | null>(null);
  const drawerCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const ticketScanInputRef = useRef<HTMLInputElement | null>(null);
  const lastFocusedElementBeforeDrawerRef = useRef<HTMLElement | null>(null);
  const readinessChecklistSectionRef = useRef<HTMLElement | null>(null);
  const reservationsPullStartYRef = useRef<number | null>(null);
  // Stable ref so early useEffects can call this without a hoisting error
  const handleCheckFlightStatusRef = useRef<(id: string) => Promise<void>>(async () => { /* initialised below */ });
  const toastPolicyRef = useRef<{
    tone: GuidanceTone;
    lastMessage: string | null;
    lastShownAtMs: number;
  }>({
    tone: "subtle",
    lastMessage: null,
    lastShownAtMs: 0,
  });
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
  const swipeGestureRef = useRef<{
    kind: "reservation" | "review";
    id: string;
    startX: number;
    startY: number;
    startingOffset: number;
    locked: boolean;
  } | null>(null);

  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>(INITIAL_FAMILY);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [reviewQueue, setReviewQueue] = useState<ReviewItem[]>([]);
  const [readinessItems, setReadinessItems] = useState<ReadinessItem[]>([]);
  // Track readinessItems that came from server so we can pass as savedItems
  const serverReadinessItemsRef = useRef<ReadinessItem[]>([]);
  // Auto-populate checklist based on reservations once loaded
  // Only runs if server hasn't provided saved items yet
  const checklistInitialized = useRef(false);
  useEffect(() => {
    if (reservations.length > 0 && !checklistInitialized.current) {
      checklistInitialized.current = true;
      // Pass server-saved items so manual toggles are preserved
      const saved = serverReadinessItemsRef.current.length > 0 ? serverReadinessItemsRef.current : undefined;
      setReadinessItems(buildChecklistFromReservations(reservations, saved));
    }
  }, [reservations]);
  const [airportTransportChoice, setAirportTransportChoice] = useState<AirportTransportChoice | null>(null);
  const [hotelArrivalTime, setHotelArrivalTime] = useState<string | null>(null);
  const [hotelArrivalDraft, setHotelArrivalDraft] = useState("");
  const [emailSamples, setEmailSamples] = useState<EmailSample[]>(EMAIL_SAMPLES);

  const [selectedEmailId, setSelectedEmailId] = useState(EMAIL_SAMPLES[0]?.id ?? "");
  const [activeDrawer, setActiveDrawer] = useState<DrawerState | null>(null);
  const [drawerDraft, setDrawerDraft] = useState<ReservationDraft>(EMPTY_DRAFT);
  const [flightLookupBusy, setFlightLookupBusy] = useState(false);
  const [flightLookupError, setFlightLookupError] = useState<string | null>(null);
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
  const [timelineSectionTab, setTimelineSectionTab] = useState<TimelineSectionTab>("reservations");
  const [, setPackingCompletionPercent] = useState(0);
  const [consumerTab, setConsumerTab] = useState<ConsumerTab>("trip");
  const [pendingMoreScrollTarget, setPendingMoreScrollTarget] = useState<"readiness-checklist" | null>(null);
  const [emailForwardAddress, setEmailForwardAddress] = useState<string | null>(() => {
    const handle = getEmailHandleFromCookie();
    return handle ? composeForwardAddress(handle) : null;
  });
  const [emailForwardSetupMessage, setEmailForwardSetupMessage] = useState<string | null>(null);
  const [gmailImportBusy, setGmailImportBusy] = useState(false);
  const [, setGmailImportMessage] = useState<string | null>(null);
  const [, setGmailImportError] = useState<string | null>(null);
  const [gmailScopeModalOpen, setGmailScopeModalOpen] = useState(false);
  const [gmailScopeModalKey] = useState(0);
  const [importBannerHighlighted, setImportBannerHighlighted] = useState(false);
  const [gmailImportMaxResults] = useState(10);
  const [advancedModeEnabled, setAdvancedModeEnabled] = useState(false);
  const [advancedModeSaving, setAdvancedModeSaving] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [consumerAvatarMenuOpen, setConsumerAvatarMenuOpen] = useState(false);
  const [expandedConsumerReservationId, setExpandedConsumerReservationId] = useState<string | null>(null);
  const [consumerReviewQueueSession, setConsumerReviewQueueSession] = useState<{
    open: boolean;
    processed: number;
    total: number;
  }>({
    open: false,
    processed: 0,
    total: 0,
  });
  const [flightStatusCheckByReservationId, setFlightStatusCheckByReservationId] = useState<
    Record<string, FlightStatusCheckResult>
  >({});
  const [pendingDeleteConfirmation, setPendingDeleteConfirmation] = useState<PendingDeleteConfirmation | null>(null);
  const [swipeOffsetByReservationId, setSwipeOffsetByReservationId] = useState<Record<string, number>>({});
  const [swipeOffsetByReviewId, setSwipeOffsetByReviewId] = useState<Record<string, number>>({});
  const [showAdvancedShortcut] = useState(false);
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [manualReservationModalOpen, setManualReservationModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [travelDayOpen, setTravelDayOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialUrlTripIdRef = useRef<string | null | undefined>(undefined);
  if (initialUrlTripIdRef.current === undefined) {
    initialUrlTripIdRef.current = searchParams.get("tripId")?.trim() || null;
  }
  const tripsInitialLoadRef = useRef(false);

  // ── Background GPS for guidance + persistent family location sharing ─────────
  const [guidanceUserLat, setGuidanceUserLat] = useState<number | null>(null);
  const [guidanceUserLon, setGuidanceUserLon] = useState<number | null>(null);
  const guidanceGpsWatchRef = useRef<number | null>(null);
  const [lastFamilyLocationSentAt, setLastFamilyLocationSentAt] = useState<string | null>(null);
  const [tripDatesPromptDismissed, setTripDatesPromptDismissed] = useState(false);
  const [tripDatesDraft, setTripDatesDraft] = useState({ start: "", end: "" });
  const [, setCalendarSyncInFlight] = useState(false);
  const [, setCalendarSyncTone] = useState<"neutral" | "success" | "error">("neutral");
  const [, setCalendarSyncMessage] = useState("");

  useEffect(() => {
    setFamilyLocationSender(async (lat, lon, accuracy) => {
      await fetch("/api/family", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update-location", lat, lon, accuracy }),
      });
      setLastFamilyLocationSentAt(new Date().toISOString());
    });
    return () => setFamilyLocationSender(null);
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;
    guidanceGpsWatchRef.current = navigator.geolocation.watchPosition(
      pos => { setGuidanceUserLat(pos.coords.latitude); setGuidanceUserLon(pos.coords.longitude); },
      () => null,
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 30_000 },
    );

    startPersistentFamilyLocationWatch();

    const onVisible = () => {
      if (document.visibilityState === "visible") startPersistentFamilyLocationWatch();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("pageshow", onVisible);

    const onStart = () => resumePersistentFamilyLocationWatch();
    const onStop = () => stopPersistentFamilyLocationWatch();
    window.addEventListener("kepi:family-start-sharing", onStart);
    window.addEventListener("kepi:family-stop-sharing", onStop);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("pageshow", onVisible);
      window.removeEventListener("kepi:family-start-sharing", onStart);
      window.removeEventListener("kepi:family-stop-sharing", onStop);
      if (guidanceGpsWatchRef.current !== null) {
        navigator.geolocation.clearWatch(guidanceGpsWatchRef.current);
        guidanceGpsWatchRef.current = null;
      }
    };
  }, []);

  // Auto-join family group if ?joinFamily=CODE in URL
  useEffect(() => {
    const joinCode = searchParams.get("joinFamily");
    if (!joinCode || !user) return;
    // Remove param from URL immediately
    const url = new URL(window.location.href);
    url.searchParams.delete("joinFamily");
    window.history.replaceState({}, "", url.toString());
    // Auto-join via API
    void fetch("/api/family", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "join-group",
        inviteCode: joinCode.toUpperCase(),
        name: user.firstName ?? user.username ?? "Family Member",
        email: user.primaryEmailAddress?.emailAddress ?? null,
        imageUrl: user.imageUrl ?? null,
      }),
    }).then(r => r.json()).then((d: { ok?: boolean; error?: unknown; alreadyMember?: boolean }) => {
      if (d.ok) {
        setToastRaw(d.alreadyMember ? "✅ Already in the group — location sharing starting…" : "✅ Joined! Location sharing starting automatically…");
        window.dispatchEvent(new CustomEvent("kepi:family-reload"));
        window.dispatchEvent(new CustomEvent("kepi:family-start-sharing"));
      } else {
        const errText = typeof d.error === "string" ? d.error : "Could not join family group — check your invite link.";
        setToastRaw(`Family join failed: ${errText}`);
      }
    }).catch((err: unknown) => setToastRaw(err instanceof Error ? err.message : "Family join failed — check your connection."));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user]);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMessage, setPushMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!hasProAccess && !isLifetime && !isTrial) return;
    let cancelled = false;
    void (async () => {
      try {
        if ("serviceWorker" in navigator && "PushManager" in window) {
          const reg = await navigator.serviceWorker.register("/sw.js");
          const sub = await reg.pushManager.getSubscription();
          if (sub && Notification.permission === "granted") {
            if (!cancelled) setPushSubscribed(true);
            return;
          }
        }
        const res = await fetch("/api/push/subscribe", { credentials: "include", cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { subscribed?: boolean };
        if (!cancelled && data.subscribed) setPushSubscribed(true);
      } catch {
        /* optional hydration */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasProAccess, isLifetime, isTrial]);
  const [reservationsCalendarView, setReservationsCalendarView] = useState(false);
  const [showCompletedFlights, setShowCompletedFlights] = useState(false);
  const [reservationsRefreshing, setReservationsRefreshing] = useState(false);
  const [ticketScanBusy, setTicketScanBusy] = useState(false);

  const viewerDisplayName = useMemo(
    () => resolveViewerName(user?.firstName, user?.primaryEmailAddress?.emailAddress),
    [user?.firstName, user?.primaryEmailAddress?.emailAddress],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setFamilyMembers((previous) => {
        const organizer = previous[0];
        if (!organizer || organizer.name === viewerDisplayName) {
          return previous;
        }
        const next = [...previous];
        next[0] = {
          ...organizer,
          name: viewerDisplayName,
        };
        return next;
      });
    }, 0);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [viewerDisplayName]);

  const selectedFamilyMember = useMemo(
    () => familyMembers.find((member) => member.id === selectedFamilyMemberId) ?? familyMembers[0],
    [familyMembers, selectedFamilyMemberId],
  );

  const selectedEmail = useMemo(
    () => emailSamples.find((sample) => sample.id === selectedEmailId) ?? emailSamples[0],
    [emailSamples, selectedEmailId],
  );

  const refreshEmailForwardSetup = useCallback(async (): Promise<void> => {
    const handleFromCookie = getEmailHandleFromCookie();
    if (handleFromCookie) {
      const addressFromCookie = composeForwardAddress(handleFromCookie);
      setEmailForwardAddress((previous) => previous ?? addressFromCookie);
    }
    try {
      const response = await fetch("/api/email-handle/mine", {
        method: "GET",
        cache: "no-store",
      });
      const payload = (await response.json()) as Partial<EmailForwardSetupStatus> & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? `Email handle lookup failed (${response.status})`);
      }
      const normalizedHandle =
        typeof payload.handle === "string" && payload.handle.trim().length > 0 ? payload.handle.trim().toLowerCase() : null;
      const normalizedAddress =
        typeof payload.forwardAddress === "string" && payload.forwardAddress.trim().length > 0
          ? payload.forwardAddress.trim()
          : normalizedHandle
            ? composeForwardAddress(normalizedHandle)
            : null;
      if (normalizedHandle) {
        writeCookieValue(EMAIL_HANDLE_COOKIE_NAME, normalizedHandle, ONE_YEAR_SECONDS);
      }
      setEmailForwardAddress(normalizedAddress);
    } catch {
      if (!handleFromCookie) {
        setEmailForwardAddress(null);
      }
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      if (isConsumerTab(tab)) {
        setConsumerTab(tab);
      }
      const hadActivated = params.get("activated") === "1";
      if (hadActivated) {
        setImportBannerHighlighted(true);
        setToast("Your trip is live — forward confirmations or import from Gmail to replace placeholders.");
        params.delete("activated");
      }
      const stage = params.get("stage");
      const hadStage =
        stage === "readiness" ||
        stage === "pre-departure" ||
        stage === "airport" ||
        stage === "arrival" ||
        stage === "recovery";
      if (hadStage && stage) {
        setTripStage(stage);
        params.delete("stage");
      }
      const gmailStatus = params.get("gmail");
      if (gmailStatus === "connected") {
        void fetch("/api/email-forward/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "mark-gmail-prompt-seen" }),
        }).then(() => {
          void refreshEmailForwardSetup();
        });
      }
      if (gmailStatus) {
        params.delete("gmail");
      }
      if (hadActivated || hadStage || gmailStatus) {
        const nextQuery = params.toString();
        const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`;
        window.history.replaceState({}, "", nextUrl);
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [refreshEmailForwardSetup, setToast]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void refreshEmailForwardSetup();
    }, 0);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [refreshEmailForwardSetup]);

  useEffect(() => {
    if (consumerTab !== "more") {
      return;
    }
    const timeout = window.setTimeout(() => {
      void refreshEmailForwardSetup();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [consumerTab, refreshEmailForwardSetup]);

  const activeTrip = useMemo(() => {
    if (!activeTripId) {
      return null;
    }
    return trips.find((trip) => trip.id === activeTripId) ?? null;
  }, [activeTripId, trips]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (!activeTripId) {
        setPackingCompletionPercent(0);
        return;
      }
      void fetch(`/api/travel-updates/packing?tripId=${encodeURIComponent(activeTripId)}`, {
        method: "GET",
        cache: "no-store",
      })
        .then(async (response) => {
          if (!response.ok) {
            setPackingCompletionPercent(0);
            return;
          }
          const payload = (await response.json()) as { completionPercent?: number };
          setPackingCompletionPercent(
            typeof payload.completionPercent === "number" ? Math.max(0, Math.min(100, payload.completionPercent)) : 0,
          );
        })
        .catch(() => {
          setPackingCompletionPercent(0);
        });
    }, 0);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [activeTripId]);

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
    void triggerHaptic("light");
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

  useEffect(() => {
    let cancelled = false;
    const loadAdvancedModePreference = async (): Promise<void> => {
      try {
        const response = await fetch("/api/preferences/advanced-mode", {
          method: "GET",
          cache: "no-store",
        });
        if (!response.ok) return;
        const payload = (await response.json()) as { enabled?: boolean };
        if (!cancelled) {
          setAdvancedModeEnabled(payload.enabled === true);
        }
      } catch {
        // Preference loading is best-effort; default stays the simple consumer view.
      }
    };
    void loadAdvancedModePreference();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const checkAdminAccess = async (): Promise<void> => {
      try {
        const response = await fetch("/api/admin/health?probe=1", {
          method: "GET",
          cache: "no-store",
        });
        if (!cancelled) {
          setIsAdminUser(response.ok);
        }
      } catch {
        if (!cancelled) {
          setIsAdminUser(false);
        }
      }
    };
    void checkAdminAccess();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAdvancedModeChange = useCallback(
    (enabled: boolean): void => {
      setAdvancedModeEnabled(enabled);
      setAdvancedModeSaving(true);
      void fetch("/api/preferences/advanced-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`Advanced mode preference returned ${response.status}`);
          }
          const payload = (await response.json()) as { enabled?: boolean };
          setAdvancedModeEnabled(payload.enabled === true);
          setToast(enabled ? "Advanced Mode is on." : "Simple view is on.");
        })
        .catch(() => {
          setToast("Advanced Mode preference could not be saved.");
        })
        .finally(() => setAdvancedModeSaving(false));
    },
    [setToast],
  );

  const activeTripRuntimeSnapshot = useMemo<ManagedTripRuntimeSnapshot>(
    () => ({
      stage: tripStage,
      reservations,
      tripStatus,
      minutesToDeparture,
      activeScenario,
      reviewQueue,
      readinessItems,
      updateFeed,
      airportTransport: airportTransportChoice,
      hotelArrivalTime,
    }),
    [
      activeScenario,
      airportTransportChoice,
      hotelArrivalTime,
      minutesToDeparture,
      readinessItems,
      reservations,
      reviewQueue,
      tripStage,
      tripStatus,
      updateFeed,
    ],
  );

  const persistAirportTransportChoice = useCallback(
    async (choice: AirportTransportChoice): Promise<void> => {
      setAirportTransportChoice(choice);
      if (!activeTripId) {
        setToast(`Airport transport saved: ${AIRPORT_TRANSPORT_LABEL[choice]}.`);
        return;
      }
      try {
        const response = await fetch(TRIP_API_ROUTE, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update",
            id: activeTripId,
            patch: { airportTransport: choice },
          }),
        });
        if (!response.ok) {
          throw new Error(`Trip API returned ${response.status}`);
        }
        setToast(`Airport transport saved: ${AIRPORT_TRANSPORT_LABEL[choice]}.`);
      } catch {
        setToast("Airport transport saved locally — will sync when connection allows.");
      }
    },
    [activeTripId, setToast],
  );

  useEffect(() => {
    tripsRef.current = trips;
  }, [trips]);

  useEffect(() => {
    activeTripIdRef.current = activeTripId;
  }, [activeTripId]);

  useEffect(() => {
    activeTripRuntimeSnapshotRef.current = activeTripRuntimeSnapshot;
  }, [activeTripRuntimeSnapshot]);

  const applyManagedTripToState = useCallback((trip: ManagedTrip, options?: { resetHighlight?: boolean }): void => {
    applyingTripStateRef.current = true;
    setTripStage((previous) => (previous === trip.stage ? previous : trip.stage));
    setTripStatus((previous) => (previous === trip.tripStatus ? previous : trip.tripStatus));
    setMinutesToDeparture((previous) => (previous === trip.minutesToDeparture ? previous : trip.minutesToDeparture));
    setActiveScenario((previous) => (previous === trip.activeScenario ? previous : trip.activeScenario));
    setReservations((previous) => (areSnapshotsEqual(previous, trip.reservations) ? previous : trip.reservations));
    setReviewQueue((previous) => (areSnapshotsEqual(previous, trip.reviewQueue) ? previous : trip.reviewQueue));
    setReadinessItems((previous) => (areSnapshotsEqual(previous, trip.readinessItems) ? previous : trip.readinessItems));
    // Mark checklist as initialized from server — prevents useEffect from overwriting with auto-computed values
    if (Array.isArray(trip.readinessItems) && trip.readinessItems.length > 0) {
      checklistInitialized.current = true;
      serverReadinessItemsRef.current = trip.readinessItems as ReadinessItem[];
    }
    setUpdateFeed((previous) => (areSnapshotsEqual(previous, trip.updateFeed) ? previous : trip.updateFeed));
    setAirportTransportChoice((previous) =>
      previous === (trip.airportTransport ?? null) ? previous : (trip.airportTransport ?? null),
    );
    setHotelArrivalTime((previous) => (previous === (trip.hotelArrivalTime ?? null) ? previous : (trip.hotelArrivalTime ?? null)));
    setHotelArrivalDraft((previous) => (previous === (trip.hotelArrivalTime ?? "") ? previous : (trip.hotelArrivalTime ?? "")));
    if (options?.resetHighlight) {
      setHighlightedReservationId(null);
    }
    queueMicrotask(() => {
      applyingTripStateRef.current = false;
    });
  }, []);

  const refreshTripsFromServer = useCallback(async (): Promise<number> => {
    const response = await fetch(TRIP_API_ROUTE, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      throw new Error(formatApiErrorMessage(null, response.status));
    }
    const payload = (await response.json()) as {
      trips?: unknown[];
      activeTripId?: string | null;
      activeTrip?: unknown;
      degraded?: boolean;
      error?: string;
    };
    if (!response.ok) {
      throw new Error(formatApiErrorMessage(payload, response.status));
    }

    const parsedTrips = Array.isArray(payload.trips)
      ? payload.trips.map((trip) => normalizeManagedTrip(trip)).filter((trip): trip is ManagedTrip => trip !== null)
      : [];
    const payloadActiveTrip = normalizeManagedTrip(payload.activeTrip);
    const resolvedActiveTripId = payloadActiveTrip?.id ?? payload.activeTripId ?? parsedTrips[0]?.id ?? null;
    const resolvedActiveTrip =
      payloadActiveTrip ?? parsedTrips.find((trip) => trip.id === resolvedActiveTripId) ?? parsedTrips[0] ?? null;

    const hasExistingTripState = tripsHydratedRef.current && tripsRef.current.length > 0;
    const shouldKeepCurrentState =
      hasExistingTripState &&
      (payload.degraded === true || parsedTrips.length === 0 || !resolvedActiveTripId || !resolvedActiveTrip);
    if (shouldKeepCurrentState) {
      setTripsLoading(false);
      return tripsRef.current.length;
    }

    setTrips((previous) => (areSnapshotsEqual(previous, parsedTrips) ? previous : parsedTrips));
    setActiveTripId((previous) => (previous === resolvedActiveTripId ? previous : resolvedActiveTripId));
    if (resolvedActiveTrip) {
      const previousRuntimeSnapshot = activeTripRuntimeSnapshotRef.current;
      const nextRuntimeSnapshot = createRuntimeSnapshotFromManagedTrip(resolvedActiveTrip);
      const shouldApplyRuntimeSnapshot =
        resolvedActiveTrip.id !== activeTripIdRef.current ||
        !previousRuntimeSnapshot ||
        !areSnapshotsEqual(previousRuntimeSnapshot, nextRuntimeSnapshot);
      if (shouldApplyRuntimeSnapshot) {
        applyManagedTripToState(resolvedActiveTrip);
      }
    }
    tripsHydratedRef.current = true;
    setTripsLoading(false);
    return parsedTrips.length;
  }, [applyManagedTripToState]);

  const openUpgradeModal = useCallback((feature: PlanFeature, detail?: string): void => {
    if (billingLoading || billingStatusPlan !== "free") {
      return;
    }
    setUpgradeModalGate({ feature, detail });
  }, [billingLoading, billingStatusPlan]);

  const closeUpgradeModal = useCallback((): void => {
    setUpgradeModalGate(null);
  }, []);

  const ensureDefaultTripIfMissing = useCallback(async (): Promise<void> => {
    const response = await fetch(TRIP_API_ROUTE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trip: defaultTripFromCurrentState({
          reservations,
          tripStage,
          tripStatus,
          minutesToDeparture,
          activeScenario,
          reviewQueue,
          readinessItems,
          updateFeed,
          airportTransport: airportTransportChoice,
          hotelArrivalTime,
        }),
        setActive: true,
      }),
    });
    if (!response.ok) {
      throw new Error(`Trip API returned ${response.status}`);
    }
  }, [
    activeScenario,
    airportTransportChoice,
    hotelArrivalTime,
    minutesToDeparture,
    readinessItems,
    reservations,
    reviewQueue,
    tripStage,
    tripStatus,
    updateFeed,
  ]);

  useEffect(() => {
    if (tripsInitialLoadRef.current) {
      return;
    }
    tripsInitialLoadRef.current = true;

    let cancelled = false;
    const urlTripId = initialUrlTripIdRef.current;
    const loadTrips = async (): Promise<void> => {
      setTripsLoading(true);
      try {
        let tripCount = await refreshTripsFromServer();
        if (cancelled) return;
        if (tripCount === 0 && urlTripId) {
          await new Promise((resolve) => window.setTimeout(resolve, 400));
          if (cancelled) return;
          tripCount = await refreshTripsFromServer();
        }
        if (tripCount === 0 && !urlTripId) {
          await ensureDefaultTripIfMissing();
          if (cancelled) return;
          await refreshTripsFromServer();
        }
      } catch (error) {
        setTripsLoading(false);
        const message = error instanceof Error ? error.message : "Unknown trip load error";
        setToast(`Unable to load trips: ${message}`);
      }
    };
    void loadTrips();
    return () => {
      cancelled = true;
    };
  }, [ensureDefaultTripIfMissing, refreshTripsFromServer, setToast]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (tripsLoading) {
        return;
      }
      void refreshTripsFromServer().catch(() => {
        // Background polling should fail silently and retry on next interval.
      });
    }, 30_000);
    return () => {
      window.clearInterval(timer);
    };
  }, [refreshTripsFromServer, tripsLoading]);

  // Auto-poll flight status for upcoming flights within 24 hours
  useEffect(() => {
    if (!activeTripId || !reservations.length) return;
    const nowMs = Date.now();
    const upcomingFlights = reservations.filter((r) => {
      if (r.type !== "flight") return false;
      const local = r.localTime;
      if (!local) return false;
      const depMs = Date.parse(local.replace("T", " ").slice(0, 16));
      const hoursUntil = (depMs - nowMs) / 3_600_000;
      return hoursUntil > -1 && hoursUntil < 24;
    });
    if (!upcomingFlights.length) return;
    // Poll every 5 minutes for flights within 24 hours
    const pollFlight = async () => {
      for (const flight of upcomingFlights) {
        try {
          await handleCheckFlightStatusRef.current(flight.id);
        } catch {
          // Fail silently
        }
      }
    };
    void pollFlight();
    const interval = window.setInterval(() => { void pollFlight(); }, 5 * 60_000);
    return () => window.clearInterval(interval);
  // handleCheckFlightStatusRef is a stable ref — intentionally omitted from deps
  }, [activeTripId, reservations]);

  useEffect(() => {
    if (!tripsHydratedRef.current) return;
    if (!activeTripId) return;
    if (applyingTripStateRef.current) return;
    // Debounce autosave writes to avoid trip PUT bursts.
    const timeout = window.setTimeout(() => {
      void fetch(TRIP_API_ROUTE, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: activeTripId,
          patch: activeTripRuntimeSnapshot,
        }),
      }).then(async (response) => {
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as { trips?: unknown[] };
        if (Array.isArray(payload.trips)) {
          const parsedTrips = payload.trips
            .map((trip) => normalizeManagedTrip(trip))
            .filter((trip): trip is ManagedTrip => trip !== null);
          setTrips(parsedTrips);
        }
      });
    }, 2_000);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [activeTripId, activeTripRuntimeSnapshot]);

  const handleSwitchTrip = useCallback(
    async (tripId: string): Promise<void> => {
      if (!tripId || tripId === activeTripId) {
        return;
      }
      try {
        const response = await fetch(TRIP_API_ROUTE, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "set-active",
            id: tripId,
          }),
        });
        if (!response.ok) {
          setToast("Could not switch trips right now.");
          return;
        }
        const payload = (await response.json()) as {
          activeTrip?: unknown;
          trips?: unknown[];
          activeTripId?: string;
        };
        const nextActiveTrip = normalizeManagedTrip(payload.activeTrip);
        if (!nextActiveTrip) {
          setToast("Selected trip could not be loaded.");
          return;
        }
        setActiveTripId(payload.activeTripId ?? nextActiveTrip.id);
        if (Array.isArray(payload.trips)) {
          const parsedTrips = payload.trips
            .map((trip) => normalizeManagedTrip(trip))
            .filter((trip): trip is ManagedTrip => trip !== null);
          setTrips(parsedTrips);
        }
        applyManagedTripToState(nextActiveTrip, { resetHighlight: true });
        setToast(`Switched to ${nextActiveTrip.name}.`);
      } catch {
        setToast("Could not switch trips right now.");
      }
    },
    [activeTripId, applyManagedTripToState, setToast],
  );

  useEffect(() => {
    if (tripsLoading || urlTripHandledRef.current) return;
    const tripId = initialUrlTripIdRef.current;
    if (!tripId) return;
    urlTripHandledRef.current = true;

    const params = new URLSearchParams(window.location.search);
    params.delete("tripId");
    const nextQuery = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`);

    if (tripId === activeTripId) {
      return;
    }

    void handleSwitchTrip(tripId);
  }, [activeTripId, handleSwitchTrip, tripsLoading]);

  const handleCreateTrip = useCallback(async (): Promise<void> => {
    const tripLimit = billingStatus?.usage?.tripLimit ?? 1;
    const allowCreation = hasProAccess || tripLimit === null || trips.length < tripLimit;
    if (!allowCreation) {
      openUpgradeModal("multi-trip", "Free includes one trip. Upgrade to add and manage multiple trips.");
      return;
    }
    const nextTripNumber = trips.length + 1;
    const now = new Date();
    const startDate = now.toISOString().slice(0, 10);
    const endDate = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    try {
      const response = await fetch(TRIP_API_ROUTE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setActive: true,
          trip: {
            name: `Trip ${nextTripNumber}`,
            destination: "Set destination",
            startDate,
            endDate,
            stage: "readiness",
            reservations: [],
            tripStatus: "yellow",
            minutesToDeparture: 180,
            activeScenario: "none",
            reviewQueue: [],
            readinessItems: INITIAL_CHECKLIST,
            updateFeed: [],
          },
        }),
      });
      if (!response.ok) {
        setToast("Could not create a new trip.");
        return;
      }
      const payload = (await response.json()) as {
        trip?: unknown;
        trips?: unknown[];
        activeTrip?: unknown;
        activeTripId?: string | null;
      };
      const createdTrip = normalizeManagedTrip(payload.trip ?? payload.activeTrip);
      if (!createdTrip) {
        setToast("Trip created but response was invalid.");
        return;
      }
      if (Array.isArray(payload.trips)) {
        const parsedTrips = payload.trips
          .map((trip) => normalizeManagedTrip(trip))
          .filter((trip): trip is ManagedTrip => trip !== null);
        setTrips(parsedTrips);
      }
      setActiveTripId(payload.activeTripId ?? createdTrip.id);
      applyManagedTripToState(createdTrip, { resetHighlight: true });
      void refreshGlobalBillingStatus();
      setToast(`Created ${createdTrip.name}.`);
    } catch {
      setToast("Could not create a new trip.");
    }
  }, [
    applyManagedTripToState,
    billingStatus?.usage?.tripLimit,
    hasProAccess,
    openUpgradeModal,
    refreshGlobalBillingStatus,
    setToast,
    trips.length,
  ]);

  const handleCreateOnboardingTrip = useCallback(
    (tripDraft: TripSetupDraft): void => {
      const tripName = tripDraft.tripName.trim();
      const destination = tripDraft.destination.trim();
      const departureDate = tripDraft.departureDate.trim();
      if (!tripName || !destination || !departureDate) {
        setToast("Trip setup is missing required fields.");
        return;
      }

      pushUndoSnapshot("Onboarding trip added");
      setTripStage("readiness");

      const departureMs = Date.parse(`${departureDate}T09:00:00`);
      if (!Number.isNaN(departureMs)) {
        const minutesUntilDeparture = Math.round((departureMs - Date.now()) / 60000);
        setMinutesToDeparture(Math.max(15, minutesUntilDeparture));
      }

      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const noteFingerprint = `onboarding:${tripName.toLowerCase()}|${destination.toLowerCase()}|${departureDate}`;

      setReservations((previous) => {
        const alreadyCreated = previous.some((reservation) => reservation.notes.includes(noteFingerprint));
        if (alreadyCreated) {
          return previous;
        }
        const onboardingReservation: Reservation = {
          id: nextId("res"),
          type: "flight",
          title: `${tripName} departure`,
          provider: "Onboarding setup",
          localTime: `${departureDate} 09:00`,
          timezone,
          location: destination,
          confirmationCode: `TRIP-${Date.now().toString().slice(-6)}`,
          assignedTo: [selectedFamilyMember.id],
          stage: "readiness",
          critical: true,
          confidence: "medium",
          notes: `Created during onboarding. ${noteFingerprint}`,
          source: "manual",
        };
        return [onboardingReservation, ...previous];
      });

      setToast(`Trip "${tripName}" was added to your timeline.`);
    },
    [pushUndoSnapshot, selectedFamilyMember.id, setToast],
  );

  useEffect(() => {
    if (!toast) return;
    const timeoutMs = guidanceTone === "subtle" ? 2000 : 2800;
    const timeout = window.setTimeout(() => setToastRaw(null), timeoutMs);
    return () => window.clearTimeout(timeout);
  }, [guidanceTone, toast]);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("tripId") || params.get("activated") === "1") {
        sessionHydratedRef.current = true;
        return;
      }
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
  const flightStatusCheckMapByReservationId = useMemo(
    () => new Map(Object.entries(flightStatusCheckByReservationId)),
    [flightStatusCheckByReservationId],
  );
  const assignmentTravelerOptions = useMemo(() => {
    const travelerIds = new Set<string>();
    const collectAssignees = (assignees: string[] | undefined): void => {
      if (!Array.isArray(assignees)) {
        return;
      }
      assignees.forEach((value) => {
        const normalized = value.trim();
        if (normalized) {
          travelerIds.add(normalized);
        }
      });
    };

    reservations.forEach((reservation) => collectAssignees(reservation.assignedTo));
    reviewQueue.forEach((item) => collectAssignees(item.draft.assignedTo));

    return [...travelerIds].map((id) => {
      const matchingFamilyMember = familyMembers.find((member) => member.id === id);
      return {
        id,
        name: matchingFamilyMember?.name?.trim() || id,
      };
    });
  }, [familyMembers, reservations, reviewQueue]);
  const hasProPlan = billingLoading ? true : hasProAccess;
  const canUseGmailImport = hasProPlan;
  const canUseAiSuggestions = hasProPlan;
  const canUsePushNotifications = hasProPlan;
  const billingTripLimit = billingStatus?.usage?.tripLimit ?? 1;
  const canCreateAdditionalTrips = hasProPlan || billingTripLimit === null || trips.length < billingTripLimit;
  const trialDaysRemaining = isTrial ? Math.max(1, billingStatus?.trialDaysRemaining ?? 0) : 0;
  const trialExpiresAt = isTrial
    ? billingStatus?.inviteAccess?.trialExpiresAt ?? billingStatus?.subscription?.trialExpiresAt ?? null
    : null;
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  const advancedWorkspaceEnabled = advancedModeEnabled;
  const tripDaysAway = getTripDaysAway(minutesToDeparture);
  const consumerDisplayReservations = useMemo(() => {
    return reservations.filter((reservation) => !isOnboardingPlaceholderReservation(reservation));
  }, [reservations]);
  const delayedFlight = useMemo(
    () =>
      reservations.find(
        (reservation) =>
          reservation.type === "flight" &&
          (flightLiveStatusByReservationId.get(reservation.id) === "delayed" ||
            flightLiveStatusByReservationId.get(reservation.id) === "cancelled"),
      ) ?? null,
    [flightLiveStatusByReservationId, reservations],
  );
  const consumerStatus = useMemo(() => {
    if (tripStatus === "red" || activeScenario !== "none" || delayedFlight) {
      return {
        title: "Flight delayed 🔴",
        detail: delayedFlight ? `${delayedFlight.provider} needs attention.` : "Something changed. Kepi can help fix it.",
        tone: "border-red-200 bg-red-50 text-red-950 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-50",
      };
    }
    if (unresolvedReviewCount > 0 || unresolvedReadinessCount > 0 || blockingIssueCount > 0 || tripStatus === "yellow") {
      return {
        title: "Action needed ⚠️",
        detail:
          unresolvedReviewCount > 0
            ? `${unresolvedReviewCount} email${unresolvedReviewCount === 1 ? "" : "s"} to review.`
            : unresolvedReadinessCount > 0
              ? `${unresolvedReadinessCount} checklist item${unresolvedReadinessCount === 1 ? "" : "s"} left.`
              : blockingIssueCount > 0
                ? `${blockingIssueCount} blocker${blockingIssueCount === 1 ? "" : "s"} to clear.`
                : "Action needed to keep this trip on track.",
        tone: "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-50",
      };
    }
    return {
      title: "You're ready ✅",
      detail: "Everything important looks set.",
      tone: "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-50",
    };
  }, [
    activeScenario,
    blockingIssueCount,
    delayedFlight,
    tripStatus,
    unresolvedReadinessCount,
    unresolvedReviewCount,
  ]);
  const consumerHeroStatus = useMemo(() => {
    if (tripStatus === "red" || activeScenario !== "none" || delayedFlight) {
      return {
        label: "Urgent",
        className: "bg-red-500/15 text-red-700 ring-1 ring-red-500/30 dark:text-red-200",
      };
    }
    if (tripStatus === "yellow" || unresolvedReviewCount > 0 || unresolvedReadinessCount > 0 || blockingIssueCount > 0) {
      return {
        label: "Action needed",
        className: "bg-amber-500/15 text-amber-700 ring-1 ring-amber-500/30 dark:text-amber-200",
      };
    }
    return {
      label: "All good",
      className: "bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-200",
    };
  }, [activeScenario, blockingIssueCount, delayedFlight, tripStatus, unresolvedReadinessCount, unresolvedReviewCount]);
  const consumerReservationsSorted = useMemo(() => {
    // Convert local departure time + timezone to UTC ms for correct ordering.
    // Without this, HND 21:20 JST sorts after HNL 13:41 HST even though
    // the Tokyo flight actually departs first in real time.
    const toUtcMs = (r: { localTime?: string; timezone?: string }): number => {
      const local = r.localTime?.trim() ?? "";
      const tz = r.timezone?.trim() ?? "Etc/UTC";
      if (!local) return Number.NaN;
      try {
        // Parse the local time string as if it were in the given timezone
        const [datePart, timePart = "00:00"] = local.split(" ");
        const [year, month, day] = (datePart ?? "").split("-").map(Number);
        const [hour, minute] = (timePart ?? "").split(":").map(Number);
        if (!year || !month || !day) return Number.NaN;
        // Use Intl to find UTC offset for this timezone at this moment
        const localDate = new Date(year, (month ?? 1) - 1, day, hour ?? 0, minute ?? 0);
        const formatter = new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          year: "numeric", month: "2-digit", day: "2-digit",
          hour: "2-digit", minute: "2-digit", hour12: false,
        });
        const parts = Object.fromEntries(formatter.formatToParts(localDate).map(p => [p.type, p.value]));
        const tzDate = new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00Z`);
        const offsetMs = tzDate.getTime() - localDate.getTime();
        return localDate.getTime() - offsetMs;
      } catch {
        return parseDateInput(local);
      }
    };
    return [...consumerDisplayReservations].sort((left, right) => {
      const leftMs = toUtcMs(left);
      const rightMs = toUtcMs(right);
      if (Number.isNaN(leftMs) && Number.isNaN(rightMs)) return 0;
      if (Number.isNaN(leftMs)) return 1;
      if (Number.isNaN(rightMs)) return -1;
      return leftMs - rightMs;
    });
  }, [consumerDisplayReservations]);

  const placeholderReservationCount = useMemo(
    () => countPlaceholderReservations(consumerReservationsSorted),
    [consumerReservationsSorted],
  );

  const hasUpcomingFlightWithin24h = useMemo(() => {
    const nowMs = Date.now();
    return consumerReservationsSorted.some((r) => {
      if (r.type !== "flight" || !r.localTime) return false;
      const depMs = Date.parse(r.localTime.replace("T", " ").slice(0, 16));
      if (Number.isNaN(depMs)) return false;
      const hoursUntil = (depMs - nowMs) / 3_600_000;
      return hoursUntil > -1 && hoursUntil < 24;
    });
  }, [consumerReservationsSorted]);

  // Derive location status for AI guidance — must be after consumerReservationsSorted
  const guidanceLocationStatus = useMemo((): "away" | "at-airport" | "in-terminal" | "airborne" | "unknown" => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const nowMs = Date.now();

    // Check if currently airborne: a flight departed in the last 14 hours and hasn't arrived yet
    // This is the most important case — "away" from all airports mid-ocean ≠ "away from airport"
    const airborne = consumerReservationsSorted.find(r => {
      if (r.type !== "flight") return false;
      const rr = r as unknown as Record<string, string>;
      const depLocal = rr.flightDepartureTime ?? rr.localTime ?? "";
      const arrLocal = rr.flightArrivalTime ?? "";
      const depMs = depLocal ? Date.parse(depLocal.replace("T"," ").slice(0, 16).replace(" ","T")) : NaN;
      const arrMs = arrLocal ? Date.parse(arrLocal.replace("T"," ").slice(0, 16).replace(" ","T")) : NaN;
      // If departed (depMs in past) and either not yet arrived or arrival unknown but < 14h since dep
      const departed = !isNaN(depMs) && nowMs > depMs;
      const notYetArrived = isNaN(arrMs) ? (nowMs - depMs < 14 * 3600_000) : nowMs < arrMs + 30 * 60_000;
      return departed && notYetArrived;
    });
    if (airborne) return "airborne";

    // GPS-based airport proximity
    const nextFlight = consumerReservationsSorted.find(r => r.type === "flight" && (Date.parse((r as unknown as Record<string,string>).localTime ?? "") - nowMs) / 60_000 > -120);
    const deptIata = (nextFlight as unknown as Record<string,string> | undefined)?.flightDepartureAirport;
    const proximity = getAirportProximity(guidanceUserLat, guidanceUserLon, deptIata);
    return proximity.status === "unknown" ? "unknown" : proximity.status;
  }, [guidanceUserLat, guidanceUserLon, consumerReservationsSorted]);

  const guidanceNearestAirport = useMemo(() => {
    const proximity = getAirportProximity(guidanceUserLat, guidanceUserLon, undefined);
    return proximity.airport?.iata ?? "";
  }, [guidanceUserLat, guidanceUserLon]);

  const nextUpcomingFlight = useMemo(() => {
    const nowMs = new Date().getTime();
    return consumerReservationsSorted.find((r) => {
      if (r.type !== "flight") return false;
      const rr = r as Reservation & { flightDepartureTime?: string };
      const fromFlightDate = r.flightDate ? parseDateInput(r.flightDate + " 23:59") : Number.NaN;
      const fromDepTime = rr.flightDepartureTime ? parseDateInput(rr.flightDepartureTime) : Number.NaN;
      const fromLocal = parseDateInput(r.localTime ?? "");
      const candidates = [fromFlightDate, fromDepTime, fromLocal].filter(v => !Number.isNaN(v));
      const depMs = candidates.length > 0 ? Math.max(...candidates) : Number.NaN;
      return !Number.isNaN(depMs) && depMs > nowMs - 4 * 3_600_000;
    }) ?? null;
  }, [consumerReservationsSorted]);





  const forwardedReviewItems = useMemo(
    () => reviewQueue.filter((item) => item.sourceChannel === "email-forward"),
    [reviewQueue],
  );
  const firstForwardedReviewItem = forwardedReviewItems[0] ?? null;
  const pendingForwardedReservations = useMemo(
    () =>
      forwardedReviewItems.map(
        (item): Reservation => ({
          ...item.draft,
          id: `pending-${item.id}`,
          source: "imported",
        }),
      ),
    [forwardedReviewItems],
  );
  const tripTabFlightReservations = useMemo(
    () => consumerReservationsSorted.filter((reservation) => reservation.type === "flight"),
    [consumerReservationsSorted],
  );
  const tripTabHotelReservations = useMemo(
    () => consumerReservationsSorted.filter((reservation) => reservation.type === "hotel"),
    [consumerReservationsSorted],
  );
  const pendingFlightReservations = useMemo(
    () => pendingForwardedReservations.filter((reservation) => reservation.type === "flight"),
    [pendingForwardedReservations],
  );
  const pendingHotelReservations = useMemo(
    () => pendingForwardedReservations.filter((reservation) => reservation.type === "hotel"),
    [pendingForwardedReservations],
  );
  const hasDetectedFlight = tripTabFlightReservations.length > 0 || pendingFlightReservations.length > 0;
  const hasDetectedHotel = tripTabHotelReservations.length > 0 || pendingHotelReservations.length > 0;
  const emptyStateForwardAddress = emailForwardAddress?.trim() || "jpro99@trips.kepitravel.com";
  const saveHotelArrivalExpectation = useCallback((): void => {
    const trimmed = hotelArrivalDraft.trim();
    if (!trimmed) {
      setToast("Please enter your expected hotel arrival time.");
      return;
    }
    setHotelArrivalTime(trimmed);
    setToast("Hotel arrival expectation saved.");
  }, [hotelArrivalDraft, setToast]);
  const earliestFlightReservation =
    consumerReservationsSorted.find((reservation) => reservation.type === "flight") ?? null;
  // Destination = arrival airport city of first flight, or hotel city, or stored destination
  const derivedTripDestination = useMemo(() => {
    // For multi-leg trips use the LAST flight's arrival, not the first leg's arrival
    const allFlights = consumerReservationsSorted.filter((r) => r.type === "flight");
    if (allFlights.length > 1) {
      const lastFlight = allFlights[allFlights.length - 1];
      if ((lastFlight as Reservation & { flightArrivalAirport?: string }).flightArrivalAirport) {
        return (lastFlight as Reservation & { flightArrivalAirport?: string }).flightArrivalAirport!;
      }
    }
    if (earliestFlightReservation?.flightArrivalAirport) {
      return earliestFlightReservation.flightArrivalAirport;
    }
    if (earliestFlightReservation?.location) {
      return extractDestinationFromReservationLocation(earliestFlightReservation.location);
    }
    const firstHotel = consumerReservationsSorted.find((r) => r.type === "hotel");
    if (firstHotel?.provider) return firstHotel.provider;
    return null;
  }, [earliestFlightReservation, consumerReservationsSorted]);
  const derivedTripStartDate = useMemo(() => {
    if (earliestFlightReservation) {
      return (
        earliestFlightReservation.flightDate?.slice(0, 10) ||
        extractDateFromReservationLocalTime(earliestFlightReservation.localTime)
      );
    }
    const nextHotel = consumerReservationsSorted.find((r) => r.type === "hotel");
    if (nextHotel?.localTime) return extractDateFromReservationLocalTime(nextHotel.localTime);
    return null;
  }, [earliestFlightReservation, consumerReservationsSorted]);

  const derivedTripEndDate = useMemo(() => {
    const range = deriveTripDateRangeFromReservations(consumerReservationsSorted);
    if (activeTrip?.endDate?.trim()) return activeTrip.endDate.trim().slice(0, 10);
    return range.endDate;
  }, [consumerReservationsSorted, activeTrip?.endDate]);
  const consumerTripDestination = useMemo(() => {
    if (derivedTripDestination) {
      return derivedTripDestination;
    }
    return activeTrip?.destination ?? null;
  }, [activeTrip?.destination, derivedTripDestination]);
  const consumerTripStartDate = useMemo(() => {
    if (derivedTripStartDate) return derivedTripStartDate;
    const currentStartDate = activeTrip?.startDate?.trim() ?? "";
    return currentStartDate || null;
  }, [activeTrip?.startDate, derivedTripStartDate]);
  const consumerTripEndDate = useMemo(() => {
    if (derivedTripEndDate) return derivedTripEndDate;
    return activeTrip?.endDate?.trim().slice(0, 10) || null;
  }, [activeTrip?.endDate, derivedTripEndDate]);

  const upcomingHotelNeedingDates = useMemo(() => {
    const hotel =
      consumerReservationsSorted.find(
        (r) =>
          r.type === "hotel" &&
          hotelNeedsTripDateConfirmation(r, consumerTripStartDate, consumerTripEndDate),
      ) ?? null;
    return hotel;
  }, [consumerReservationsSorted, consumerTripStartDate, consumerTripEndDate]);

  const saveTripDateRange = useCallback((): void => {
    if (!activeTripId || !tripDatesDraft.start || !tripDatesDraft.end) {
      setToast("Pick a start and end date for this trip.");
      return;
    }
    if (tripDatesDraft.end < tripDatesDraft.start) {
      setToast("End date must be on or after start date.");
      return;
    }
    void fetch(TRIP_API_ROUTE, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update",
        id: activeTripId,
        patch: { startDate: tripDatesDraft.start, endDate: tripDatesDraft.end },
      }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not save trip dates.");
        const payload = (await response.json()) as { trips?: unknown[] };
        if (Array.isArray(payload.trips)) {
          const parsedTrips = payload.trips
            .map((trip) => normalizeManagedTrip(trip))
            .filter((trip): trip is ManagedTrip => trip !== null);
          setTrips(parsedTrips);
        }
        setTripDatesPromptDismissed(true);
        setToast("Trip dates saved — timeline updated.");
      })
      .catch((err: unknown) => setToast(err instanceof Error ? err.message : "Could not save trip dates."));
  }, [activeTripId, tripDatesDraft.end, tripDatesDraft.start, setToast]);

  useEffect(() => {
    if (!upcomingHotelNeedingDates || tripDatesPromptDismissed) return;
    const checkIn = upcomingHotelNeedingDates.localTime.trim().slice(0, 10);
    const checkOut = upcomingHotelNeedingDates.checkOutDate?.trim().slice(0, 10) || checkIn;
    setTripDatesDraft({ start: checkIn, end: checkOut });
  }, [upcomingHotelNeedingDates, tripDatesPromptDismissed]);

  const journeyPhase = useMemo(
    (): JourneyPhase =>
      computeJourneyPhase({
        reservations: consumerReservationsSorted,
        tripDestination: consumerTripDestination ?? activeTrip?.destination ?? null,
      }),
    [consumerReservationsSorted, consumerTripDestination, activeTrip?.destination],
  );

  useEffect(() => {
    const phaseKind = journeyPhase.kind;
    if (lastJourneyPhaseKindRef.current === phaseKind) {
      return;
    }
    const isFirstPhase = lastJourneyPhaseKindRef.current === null;
    lastJourneyPhaseKindRef.current = phaseKind;
    if (isFirstPhase) {
      const tab = new URLSearchParams(window.location.search).get("tab");
      if (isConsumerTab(tab)) {
        return;
      }
    }
    setConsumerTab(defaultConsumerTabForPhase(journeyPhase));
  }, [journeyPhase]);

  const tripHasUpcomingEvents = useMemo(
    () => hasUpcomingTripEvents(consumerReservationsSorted),
    [consumerReservationsSorted],
  );
  const showAirportTransportPrompt =
    hasDetectedFlight && shouldPromptAirportTransport(journeyPhase);
  useEffect(() => {
    if (!tripsHydratedRef.current) return;
    if (!activeTripId) return;
    if (!tripHasUpcomingEvents) return;
    const hasHotel = consumerReservationsSorted.some((r) => r.type === "hotel");
    if (!earliestFlightReservation && !hasHotel) return;

    const normalizedCurrentDestination = activeTrip?.destination?.trim() ?? "";
    const normalizedDerivedDestination = derivedTripDestination?.trim() ?? "";
    const destinationNeedsUpdate =
      Boolean(normalizedDerivedDestination) &&
      (isTripDestinationPlaceholder(normalizedCurrentDestination) ||
        normalizedCurrentDestination.toLowerCase() !== normalizedDerivedDestination.toLowerCase());
    const normalizedStartDate = activeTrip?.startDate?.trim() ?? "";
    const normalizedEndDate = activeTrip?.endDate?.trim().slice(0, 10) ?? "";
    const startDateNeedsUpdate = Boolean(derivedTripStartDate) && normalizedStartDate !== derivedTripStartDate;
    const endDateNeedsUpdate = Boolean(derivedTripEndDate) && normalizedEndDate !== derivedTripEndDate;



    // Auto-generate trip name from destination + departure month
    const derivedTripName = derivedTripStartDate
      ? (() => {
          const cityMap: Record<string, string> = {
            HNL: "Honolulu", NRT: "Tokyo", HND: "Tokyo", LAX: "Los Angeles",
            JFK: "New York", LHR: "London", CDG: "Paris", SYD: "Sydney",
            SIN: "Singapore", HKG: "Hong Kong", GMP: "Seoul", ICN: "Seoul",
            ORD: "Chicago", MIA: "Miami", SFO: "San Francisco", DEN: "Denver",
            SEA: "Seattle", DFW: "Dallas", BOS: "Boston", LAS: "Las Vegas",
            ONT: "Ontario", SNA: "Orange County", SAN: "San Diego",
          };
          // Get ALL flights sorted by date to understand the full itinerary
          const allFlights = consumerReservationsSorted
            .filter((r) => r.type === "flight")
            .sort((a, b) => {
              const aMs = Date.parse(((a as Reservation & { flightDate?: string }).flightDate ?? a.localTime) + "T00:00:00");
              const bMs = Date.parse(((b as Reservation & { flightDate?: string }).flightDate ?? b.localTime) + "T00:00:00");
              return aMs - bMs;
            });
          const firstFlight = allFlights[0];
          const lastFlight = allFlights[allFlights.length - 1];
          const origin = (firstFlight as Reservation & { flightDepartureAirport?: string })?.flightDepartureAirport ?? "";
          const finalDest = (lastFlight as Reservation & { flightArrivalAirport?: string })?.flightArrivalAirport ?? derivedTripDestination ?? "";
          const originCity = cityMap[origin.toUpperCase()] ?? origin;
          const destCity = cityMap[finalDest.toUpperCase()] ?? finalDest;
          const month = new Date(derivedTripStartDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
          // Multi-leg: show origin → final destination
          if (originCity && destCity && originCity !== destCity && allFlights.length > 1) {
            return `${originCity} → ${destCity} · ${month}`;
          }
          return destCity ? `${destCity} · ${month}` : `Trip · ${month}`;
        })()
      : null;
    const nameNeedsUpdate = Boolean(derivedTripName) &&
      isTripNamePlaceholder(activeTrip?.name);

    if (!destinationNeedsUpdate && !startDateNeedsUpdate && !endDateNeedsUpdate && !nameNeedsUpdate) {
      return;
    }

    const patch: { name?: string; destination?: string; startDate?: string; endDate?: string } = {};
    if (nameNeedsUpdate && derivedTripName) {
      patch.name = derivedTripName;
    }
    if (destinationNeedsUpdate && derivedTripDestination) {
      patch.destination = derivedTripDestination;
    }
    if (startDateNeedsUpdate && derivedTripStartDate) {
      patch.startDate = derivedTripStartDate;
    }
    if (endDateNeedsUpdate && derivedTripEndDate) {
      patch.endDate = derivedTripEndDate;
    }

    const timeout = window.setTimeout(() => {
      void fetch(TRIP_API_ROUTE, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: activeTripId,
          patch,
        }),
      }).then(async (response) => {
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as { trips?: unknown[] };
        if (Array.isArray(payload.trips)) {
          const parsedTrips = payload.trips
            .map((trip) => normalizeManagedTrip(trip))
            .filter((trip): trip is ManagedTrip => trip !== null);
          setTrips(parsedTrips);
        }
      });
    }, 0);

    return () => {
      window.clearTimeout(timeout);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeTrip?.destination,
    activeTrip?.startDate,
    activeTripId,
    derivedTripDestination,
    derivedTripStartDate,
    earliestFlightReservation,
    tripHasUpcomingEvents,
  ]);
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
      void triggerHaptic("heavy");
      void scheduleLocalNotification({
        title: "Kepi disruption alert",
        body: "A critical update moved your trip into recovery mode.",
      });
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
      const travelUpdateRequestBody = {
        mode: updateMode,
        reservations: providerEligibleReservations,
        nowIso: new Date(nowMs).toISOString(),
      };
      if (providerEligibleReservations.some((reservation) => reservation.type === "flight")) {
        // flight status lookup in progress
      }
      const response = await fetch("/api/travel-updates", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(travelUpdateRequestBody),
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
    void triggerHaptic("light");
    setToast(`Moved to ${STAGE_LABEL[nextStage]} stage.`);
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
    void triggerHaptic("heavy");
    void scheduleLocalNotification({
      title: "Kepi disruption alert",
      body: `Disruption mode activated: ${scenario.replaceAll("-", " ")}.`,
    });

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

  const handleSaveManualReservation = useCallback(
    (value: ManualReservationFormValue): void => {
      const mappedType = mapManualReservationType(value.reservationType);
      const notesPrefix = value.reservationType === "other" ? "Manual type: Other." : `Manual type: ${value.reservationType}.`;
      const localTime = value.localDateTime.replace("T", " ");
      const reservation: Reservation = {
        id: nextId("res"),
        type: mappedType,
        title: value.title.trim(),
        provider: value.provider.trim(),
        localTime,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Etc/UTC",
        location: value.location.trim(),
        confirmationCode: value.confirmationCode.trim(),
        assignedTo: value.assignedTo,
        stage: defaultStageForManualReservationType(value.reservationType),
        critical: mappedType === "flight" || mappedType === "train" || mappedType === "ride",
        confidence: "high",
        notes: [notesPrefix, value.notes.trim()].filter((entry) => entry.length > 0).join(" "),
        source: "manual",
        checkOutDate: mappedType === "hotel" ? value.checkOutDate.trim() : undefined,
        roomType: mappedType === "hotel" ? value.roomType.trim() : undefined,
        flightNumber: mappedType === "flight" ? value.flightNumber.trim() : undefined,
        flightAirline: mappedType === "flight" ? value.provider.trim() : undefined,
        flightDate: mappedType === "flight" ? localTime.slice(0, 10) : undefined,
      };
      pushUndoSnapshot("Manual reservation added");
      // Build the new list first, then set state AND save in one step
      const existingReservations = trips.find((t) => t.id === (activeTripId ?? trips[0]?.id))?.reservations ?? [];
      const nextReservations = [reservation, ...existingReservations];
      setReservations(nextReservations);
      // Force immediate server write with the correct new list
      const targetTripId = activeTripId ?? trips[0]?.id ?? null;
      if (targetTripId) {
        void fetch(TRIP_API_ROUTE, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update",
            id: targetTripId,
            patch: { reservations: nextReservations },
          }),
        }).then(async (res) => {
          if (!res.ok) return;
          const payload = (await res.json()) as { trips?: unknown[] };
          if (Array.isArray(payload.trips)) {
            const parsedTrips = payload.trips
              .map((t) => normalizeManagedTrip(t))
              .filter((t): t is ManagedTrip => t !== null);
            setTrips(parsedTrips);
          }
        });
      }
      queueMutation("Manual reservation added to live timeline.", {
        key: "manual-reservation-add",
        reservationId: reservation.id,
      });
      setManualReservationModalOpen(false);
      setToast("Reservation added ✓");
    },
    [activeTripId, pushUndoSnapshot, queueMutation, setToast, trips],
  );

  const handleImportParsedReservations = useCallback(
    (importedReservations: GmailImportedReservation[]): void => {
      if (importedReservations.length === 0) {
        setToast("No reservation emails found or email import access is unavailable.");
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
          notes: `Imported from email message ${item.messageId}`,
        },
      }));
      setEmailSamples(importedSamples);
      setSelectedEmailId(importedSamples[0]?.id ?? "");

      const queueItems = importedReservations.map((item) => ({
        id: nextId("review"),
        reasons:
          item.reservation.issues.length > 0
            ? item.reservation.issues
            : ["Imported from email import. Confirm before publishing to live itinerary."],
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
          notes: `Imported via email import from message ${item.messageId}.`,
        },
        sourceChannel: "gmail-import",
        parseConfidenceScore:
          item.reservation.confidence === "high" ? 85 : item.reservation.confidence === "medium" ? 55 : 30,
        parsingStatus:
          item.reservation.confidence === "high"
            ? "auto-parsed"
            : item.reservation.confidence === "medium"
              ? "needs-review"
              : "needs-user-input",
        missingFields: item.reservation.issues.flatMap((issue) => {
            const normalized = issue.toLowerCase();
            if (normalized.includes("title")) return ["title" as const];
            if (normalized.includes("provider")) return ["provider" as const];
            if (normalized.includes("confirm")) return ["confirmationCode" as const];
            if (normalized.includes("time")) return ["localTime" as const];
            if (normalized.includes("timezone")) return ["timezone" as const];
            if (normalized.includes("location") || normalized.includes("terminal")) return ["location" as const];
            return [];
          }),
        originalEmailText: item.body,
        reviewStatus: item.reservation.confidence === "low" ? "incomplete" : "pending",
      })) as ReviewItem[];
      setReviewQueue((prev) => [...queueItems, ...prev]);
      queueMutation("Imported reservations from email import into review queue.", {
        key: "gmail-import",
        fingerprint: `gmail:${importedReservations.map((item) => item.messageId).join(",")}`,
      });
      setToast(`Imported ${importedReservations.length} reservation${importedReservations.length === 1 ? "" : "s"} from email.`);
    },
    [familyMembers, queueMutation, setToast],
  );

  const handleEnablePush = useCallback(async (): Promise<void> => {
    if (pushBusy) return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPushMessage("Push notifications are not supported on this browser.");
      return;
    }
    setPushBusy(true);
    setPushMessage(null);
    try {
      const permission = Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
      if (permission !== "granted") {
        setPushMessage("Notification permission denied. Enable in device settings.");
        setPushBusy(false);
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      const vapidKey =
        document.querySelector("meta[name=vapid-public-key]")?.getAttribute("content") ??
        (await fetch("/api/push/subscribe").then((r) => (r.ok ? r.json() : null)).then((d: { publicKey?: string } | null) => d?.publicKey));
      if (!vapidKey) {
        setPushMessage("Push configuration missing — contact support.");
        setPushBusy(false);
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey,
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (res.ok) {
        setPushSubscribed(true);
        setPushMessage("✅ Push alerts enabled! Gate changes and delays notify you even when Kepi is closed.");
      } else if (res.status === 402) {
        setPushMessage("Flight alerts require Pro — upgrade in More tab.");
      } else {
        setPushMessage("Failed to register push subscription.");
      }
    } catch {
      setPushMessage("Could not enable push notifications.");
    } finally {
      setPushBusy(false);
    }
  }, [pushBusy]);

  const handleCopyForwardAddress = useCallback(async (address?: string): Promise<void> => {
    const value = (address ?? emailForwardAddress)?.trim();
    if (!value) {
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setEmailForwardSetupMessage("Forwarding address copied.");
    } catch {
      setEmailForwardSetupMessage("Clipboard unavailable.");
    }
  }, [emailForwardAddress]);

  const handleImportFromGmailWithScope = useCallback(
    async (scope: GmailImportScope): Promise<void> => {
      if (gmailImportBusy) {
        return;
      }
      setGmailImportBusy(true);
      setGmailImportError(null);
      setGmailImportMessage("Scanning your inbox for matching reservation emails...");
      try {
        const response = await fetch("/api/travel-updates/gmail-import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            maxResults: gmailImportMaxResults,
            lookbackDays: scope.lookbackDays,
            tripStartDate: scope.tripStartDate,
            tripEndDate: scope.tripEndDate,
          }),
        });
        const payload = (await response.json()) as {
          error?: string;
          foundCount?: number;
          reservations?: GmailImportedReservation[];
        };
        if (!response.ok) {
          throw new Error(payload.error ?? `Email import endpoint returned ${response.status}`);
        }
        const importedReservations = payload.reservations ?? [];
        const foundCount = payload.foundCount ?? importedReservations.length;
        setGmailImportMessage(
          foundCount > 0
            ? `Found ${foundCount} matching email${foundCount === 1 ? "" : "s"} before queueing.`
            : "No matching emails found for this scope.",
        );
        if (importedReservations.length > 0) {
          handleImportParsedReservations(importedReservations);
        }
      } catch (error) {
        setGmailImportError(error instanceof Error ? error.message : "Unknown email import error.");
      } finally {
        setGmailImportBusy(false);
      }
    },
    [gmailImportBusy, gmailImportMaxResults, handleImportParsedReservations],
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

  const handleTicketScanUpload = useCallback(
    async (file: File): Promise<void> => {
      if (ticketScanBusy) {
        return;
      }
      setTicketScanBusy(true);
      try {
        const formData = new FormData();
        formData.append("image", file);
        const response = await fetch("/api/travel-updates?action=ticket-scan", {
          method: "POST",
          body: formData,
          cache: "no-store",
          credentials: "include",
        });
        const payload = (await response.json()) as {
          error?: string;
          draft?: ReservationDraft;
        };
        if (!response.ok || !payload.draft) {
          throw new Error(payload.error ?? `Ticket scan failed (${response.status})`);
        }

        const scannedDraft: ReservationDraft = {
          ...EMPTY_DRAFT,
          ...payload.draft,
          type: payload.draft.type,
          title: payload.draft.title.trim(),
          provider: payload.draft.provider.trim(),
          localTime: payload.draft.localTime.trim(),
          timezone: payload.draft.timezone.trim() || "Etc/UTC",
          location: payload.draft.location.trim(),
          confirmationCode: payload.draft.confirmationCode.trim(),
          assignedTo: payload.draft.assignedTo ?? [],
          stage: payload.draft.stage,
          critical: payload.draft.critical,
          confidence: payload.draft.confidence,
          notes: payload.draft.notes.trim(),
        };
        const reviewItem: ReviewItem = {
          id: nextId("review"),
          reasons: ["Scanned from ticket image. Confirm details before publishing."],
          impact: "Ticket details were extracted from a photo and need confirmation.",
          sourceEmailSubject: `Scanned ticket: ${file.name || "image upload"}`,
          sourceChannel: "manual",
          parseConfidenceScore: 55,
          parsingStatus: "needs-review",
          reviewStatus: "pending",
          draft: scannedDraft,
        };
        setReviewQueue((prev) => [reviewItem, ...prev]);
        queueMutation("Ticket scan added to review queue.", {
          key: "ticket-scan-review",
          fingerprint: `ticket-scan:${reviewItem.id}`,
        });
        setDrawerDraft(reviewItem.draft);
        setFlightLookupError(null);
        setFlightLookupBusy(false);
        setActiveDrawer({ kind: "review", id: reviewItem.id });
        setConsumerTab("flights");
        setToast("Ticket scanned. Review and confirm before saving.");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Ticket scan failed.";
        setToast(message);
      } finally {
        setTicketScanBusy(false);
      }
    },
    [queueMutation, setToast, ticketScanBusy],
  );

  const handleTicketScanFileSelected = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      const file = event.target.files?.[0] ?? null;
      event.currentTarget.value = "";
      if (!file) {
        return;
      }
      void handleTicketScanUpload(file);
    },
    [handleTicketScanUpload],
  );

  const openTicketScanPicker = useCallback((): void => {
    if (ticketScanBusy) {
      return;
    }
    ticketScanInputRef.current?.click();
  }, [ticketScanBusy]);

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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
            flightNumber: reservation.flightNumber,
            flightAirline: reservation.flightAirline,
            flightDate: reservation.flightDate,
            flightDepartureAirport: reservation.flightDepartureAirport,
            flightArrivalAirport: reservation.flightArrivalAirport,
            flightDepartureTime: reservation.flightDepartureTime,
            flightArrivalTime: reservation.flightArrivalTime,
            flightStatus: reservation.flightStatus,
            flightDepartureGate: reservation.flightDepartureGate,
            flightDepartureTerminal: reservation.flightDepartureTerminal,
            flightArrivalGate: reservation.flightArrivalGate,
            flightArrivalTerminal: reservation.flightArrivalTerminal,
            flightDelayMinutes: reservation.flightDelayMinutes,
            flightOnTime: reservation.flightOnTime,
            flightSeatNumber: reservation.flightSeatNumber,
            checkOutDate: reservation.checkOutDate,
            roomType: reservation.roomType,
            trainNumber: reservation.trainNumber,
          });
        }
      } else {
        const reviewItem = reviewQueue.find((item) => item.id === id);
        if (reviewItem) {
          setDrawerDraft(reviewItem.draft);
        }
      }
      setFlightLookupError(null);
      setFlightLookupBusy(false);
      setActiveDrawer({ kind, id });
    },
    [reservations, reviewQueue],
  );

  const handleTripSearchSelection = useCallback(
    async (selection: TripSearchSelection): Promise<void> => {
      await handleSwitchTrip(selection.tripId);
      if (selection.reservationId) {
        setHighlightedReservationId(selection.reservationId);
        openDrawer("reservation", selection.reservationId);
        window.setTimeout(() => {
          setHighlightedReservationId((current) =>
            current === selection.reservationId ? null : current,
          );
        }, 7000);
      }
    },
    [handleSwitchTrip, openDrawer],
  );

  const closeDrawer = useCallback((): void => {
    setFlightLookupError(null);
    setFlightLookupBusy(false);
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
    void trackEvent({
      type: "autopilot_applied",
      tripId: activeTripId,
      recommendationTitle: recommendation.title,
    });
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

  const handleLookupReviewFlight = useCallback(async (): Promise<void> => {
    const looksLikeFlightDraft =
      drawerDraft.type === "flight" ||
      /\bflight\b/iu.test(`${drawerDraft.title} ${drawerDraft.provider}`) ||
      /\b[A-Z]{2,3}\s?\d{1,4}[A-Z]?\b/u.test(drawerDraft.title);
    if (!activeDrawer || activeDrawer.kind !== "review" || !looksLikeFlightDraft) {
      return;
    }
    const flightNumber = drawerDraft.flightNumber?.trim() ?? "";
    const flightAirline = drawerDraft.flightAirline?.trim() ?? "";
    const flightDate = drawerDraft.flightDate?.trim() ?? "";
    if (!flightNumber || !flightAirline || !flightDate) {
      setFlightLookupError("Enter flight number, airline, and date first.");
      return;
    }

    setFlightLookupBusy(true);
    setFlightLookupError(null);
    try {
      const params = new URLSearchParams({
        action: "flight-lookup",
        flightNumber,
        airline: flightAirline,
        flightDate,
      });
      const response = await fetch(`/api/travel-updates?${params.toString()}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        error?: string;
        flightNumber?: string;
        airline?: string;
        flightDate?: string;
        departureAirport?: string;
        arrivalAirport?: string;
        departureTime?: string;
        arrivalTime?: string;
        flightStatus?: string;
      };
      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? `Flight lookup failed (${response.status})`);
      }

      const departureAirport = payload.departureAirport?.trim() ?? "";
      const arrivalAirport = payload.arrivalAirport?.trim() ?? "";
      const departureTime = payload.departureTime?.trim() ?? "";
      const arrivalTime = payload.arrivalTime?.trim() ?? "";
      const nextFlightDate = payload.flightDate?.trim() || flightDate;
      const departureClockMatch = departureTime.match(/T(\d{2}:\d{2})/u);
      const nextLocalTime = departureClockMatch?.[1] ? `${nextFlightDate} ${departureClockMatch[1]}` : drawerDraft.localTime;

      setDrawerDraft((prev) => ({
        ...prev,
        type: "flight",
        flightNumber: payload.flightNumber?.trim() || flightNumber,
        flightAirline: payload.airline?.trim() || flightAirline,
        flightDate: nextFlightDate,
        flightDepartureAirport: departureAirport,
        flightArrivalAirport: arrivalAirport,
        flightDepartureTime: departureTime,
        flightArrivalTime: arrivalTime,
        flightStatus: payload.flightStatus?.trim() ?? "",
        location:
          departureAirport && arrivalAirport
            ? `${departureAirport} -> ${arrivalAirport}`
            : prev.location,
        localTime: nextLocalTime,
        notes: [
          prev.notes.trim(),
          payload.flightStatus ? `Flight status: ${payload.flightStatus}` : "",
          arrivalTime ? `Arrival: ${arrivalTime}` : "",
        ]
          .filter((entry) => entry.length > 0)
          .join(" | "),
      }));
      setToast("Flight details populated from AeroDataBox.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to look up flight.";
      setFlightLookupError(message);
      setToast(message);
    } finally {
      setFlightLookupBusy(false);
    }
  }, [activeDrawer, drawerDraft, setToast]);

  const persistReviewQueueToTrip = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (nextQueue: ReviewItem[], context: { reviewId: string; source: string }): void => {
      const targetTripId = activeTripId ?? trips[0]?.id ?? null;
      if (!targetTripId) {
        return;
      }
      void fetch(TRIP_API_ROUTE, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: targetTripId,
          patch: {
            reviewQueue: nextQueue,
          },
        }),
      })
        .then(async (response) => {
          if (!response.ok) {
            let payload: unknown = null;
            let rawErrorBody = "";
            try {
              payload = await response.json();
            } catch {
              payload = null;
              try {
                rawErrorBody = await response.text();
              } catch {
                rawErrorBody = "";
              }
            }
            const parsedErrorMessage = extractApiErrorMessage(payload);
            const responseErrorMessage = parsedErrorMessage || rawErrorBody.trim() || `Request failed with ${response.status}`;
            setToast(`Review delete failed: ${responseErrorMessage}`);
            return;
          }
          const payload = (await response.json()) as { trip?: ManagedTrip; trips?: unknown[]; activeTripId?: string | null };
          if (Array.isArray(payload.trips)) {
            const parsedTrips = payload.trips
              .map((trip) => normalizeManagedTrip(trip))
              .filter((trip): trip is ManagedTrip => trip !== null);
            setTrips(parsedTrips);
          } else if (payload.trip) {
            setTrips((previous) => previous.map((trip) => (trip.id === payload.trip?.id ? payload.trip : trip)));
          }
        })
        .catch(() => {
          setToast("Network error while deleting review item.");
        });
    },
    [activeTripId, setToast, trips],
  );

  const handleDeleteReservation = useCallback(
    (reservationId: string): void => {
      const reservation = reservations.find((item) => item.id === reservationId);
      if (!reservation) {
        setToast("Reservation not found.");
        return;
      }
      const nextReservations = reservations.filter((item) => item.id !== reservationId);
      pushUndoSnapshot("Reservation deleted");
      setReservations(nextReservations);
      const targetTripId = activeTripId ?? trips[0]?.id ?? null;
      if (targetTripId) {
        setTrips((previous) =>
          previous.map((trip) =>
            trip.id === targetTripId
              ? {
                  ...trip,
                  reservations: trip.reservations.filter((item) => item.id !== reservationId),
                }
              : trip,
          ),
        );
      }
      if (targetTripId) {
        void fetch(TRIP_API_ROUTE, {
          method: "DELETE",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "delete-reservation",
            tripId: targetTripId,
            reservationId,
          }),
        })
          .then(async (response) => {
            if (!response.ok) {
              let payload: unknown = null;
              let rawErrorBody = "";
              try {
                payload = await response.json();
              } catch {
                payload = null;
                try {
                  rawErrorBody = await response.text();
                } catch {
                  rawErrorBody = "";
                }
              }
              const parsedErrorMessage = extractApiErrorMessage(payload);
              const responseErrorMessage = parsedErrorMessage || rawErrorBody.trim() || `Request failed with ${response.status}`;
              setToast(`Delete failed: ${responseErrorMessage}`);
              return;
            }
            const payload = (await response.json()) as {
              action?: string;
              trip?: ManagedTrip;
              trips?: unknown[];
              activeTripId?: string | null;
              removedReservationId?: string;
            };
            if (Array.isArray(payload.trips)) {
              const parsedTrips = payload.trips
                .map((trip) => normalizeManagedTrip(trip))
                .filter((trip): trip is ManagedTrip => trip !== null);
              setTrips(parsedTrips);
            } else if (payload.trip) {
              setTrips((previous) => previous.map((trip) => (trip.id === payload.trip?.id ? payload.trip : trip)));
            }
          })
          .catch(() => {
            setToast("Network error while deleting reservation.");
          });
      } else {
      }
      setExpandedConsumerReservationId((prev) => (prev === reservationId ? null : prev));
      setHighlightedReservationId((prev) => (prev === reservationId ? null : prev));
      setFlightStatusCheckByReservationId((prev) => {
        if (!(reservationId in prev)) {
          return prev;
        }
        const next = { ...prev };
        delete next[reservationId];
        return next;
      });
      queueMutation("Reservation deleted.", {
        key: "reservation-delete",
        reservationId,
      });
    },
    [activeTripId, pushUndoSnapshot, queueMutation, reservations, setToast, trips],
  );

  const handleMoveReservationToTrip = useCallback(
    async (reservationId: string, targetTripId: string): Promise<void> => {
      if (!activeTripId || targetTripId === activeTripId) return;
      const reservation = reservations.find((item) => item.id === reservationId);
      if (!reservation) { setToast("Reservation not found."); return; }
      const targetTrip = trips.find((t) => t.id === targetTripId);
      if (!targetTrip) { setToast("Target trip not found."); return; }
      pushUndoSnapshot("Reservation moved to another trip");
      // Remove from current trip locally
      setReservations((prev) => prev.filter((item) => item.id !== reservationId));
      closeDrawer();
      try {
        // Remove from current trip on server
        await fetch(TRIP_API_ROUTE, {
          method: "DELETE",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete-reservation", tripId: activeTripId, reservationId }),
        });
        // Add to target trip on server
        await fetch(TRIP_API_ROUTE, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update",
            id: targetTripId,
            patch: { reservations: [{ ...reservation, id: nextId("res-moved") }, ...targetTrip.reservations] },
          }),
        });
        await refreshTripsFromServer();
        setToast(`Moved to "${targetTrip.name}".`);
      } catch {
        setToast("Move failed — please try again.");
      }
    },
    [activeTripId, closeDrawer, pushUndoSnapshot, refreshTripsFromServer, reservations, setToast, trips],
  );

  const requestDeleteConfirmation = useCallback((target: PendingDeleteConfirmation): void => {
    if (target.kind === "reservation") {
      setSwipeOffsetByReservationId((previous) => ({ ...previous, [target.id]: 0 }));
    } else {
      setSwipeOffsetByReviewId((previous) => ({ ...previous, [target.id]: 0 }));
    }
    setPendingDeleteConfirmation(target);
  }, []);

  const handleCardTouchStart = useCallback(
    (kind: "reservation" | "review", id: string, event: React.TouchEvent<HTMLDivElement>): void => {
      const startX = event.touches[0]?.clientX;
      if (typeof startX !== "number") {
        return;
      }
      const startingOffset =
        kind === "reservation" ? swipeOffsetByReservationId[id] ?? 0 : swipeOffsetByReviewId[id] ?? 0;
      swipeGestureRef.current = {
        kind,
        id,
        startX,
        startY: event.touches[0]?.clientY ?? 0,
        startingOffset,
        locked: false,
      };
      if (kind === "reservation") {
        setSwipeOffsetByReviewId({});
      } else {
        setSwipeOffsetByReservationId({});
      }
    },
    [swipeOffsetByReservationId, swipeOffsetByReviewId],
  );

  const handleCardTouchMove = useCallback((event: React.TouchEvent<HTMLDivElement>): void => {
    const gesture = swipeGestureRef.current;
    if (!gesture) {
      return;
    }
    const touchX = event.touches[0]?.clientX;
    if (typeof touchX !== "number") {
      return;
    }
    const touchY = event.touches[0]?.clientY ?? 0;
    const deltaX = gesture.startX - touchX;
    const deltaY = Math.abs((touchY) - (gesture.startY ?? 0));
    // Require clearly horizontal gesture (2:1 ratio) before activating swipe
    if (!gesture.locked && Math.abs(deltaX) < 8) return;
    if (!gesture.locked && deltaY > Math.abs(deltaX) * 0.6) {
      swipeGestureRef.current = null;
      return;
    }
    gesture.locked = true;
    const nextOffset = Math.max(0, Math.min(SWIPE_DELETE_REVEAL_PX, gesture.startingOffset + deltaX));
    if (nextOffset > 0) {
      event.preventDefault();
    }
    if (gesture.kind === "reservation") {
      setSwipeOffsetByReservationId((previous) => ({
        ...previous,
        [gesture.id]: nextOffset,
      }));
    } else {
      setSwipeOffsetByReviewId((previous) => ({
        ...previous,
        [gesture.id]: nextOffset,
      }));
    }
  }, []);

  const handleCardTouchEnd = useCallback((): void => {
    const gesture = swipeGestureRef.current;
    if (!gesture) {
      return;
    }
    const currentOffset =
      gesture.kind === "reservation"
        ? swipeOffsetByReservationId[gesture.id] ?? 0
        : swipeOffsetByReviewId[gesture.id] ?? 0;
    const finalOffset = currentOffset >= SWIPE_DELETE_REVEAL_PX * 0.5 ? SWIPE_DELETE_REVEAL_PX : 0;
    if (gesture.kind === "reservation") {
      setSwipeOffsetByReservationId((previous) => ({
        ...previous,
        [gesture.id]: finalOffset,
      }));
    } else {
      setSwipeOffsetByReviewId((previous) => ({
        ...previous,
        [gesture.id]: finalOffset,
      }));
    }
    swipeGestureRef.current = null;
  }, [swipeOffsetByReservationId, swipeOffsetByReviewId]);

  const handleCheckFlightStatus = useCallback(
    async (reservationId: string): Promise<void> => {
      const reservation = reservations.find((item) => item.id === reservationId);
      if (!reservation) {
        setToast("Reservation not found.");
        return;
      }
      if (reservation.type === "hotel") {
        const hotelSummary = buildHotelCheckInStatusSummary(reservation);
        setFlightStatusCheckByReservationId((prev) => ({
          ...prev,
          [reservationId]: {
            flightStatus: prev[reservationId]?.flightStatus ?? "",
            delayMinutes: prev[reservationId]?.delayMinutes ?? null,
            departureGate: prev[reservationId]?.departureGate ?? "",
            departureTerminal: prev[reservationId]?.departureTerminal ?? "",
            arrivalGate: prev[reservationId]?.arrivalGate ?? "",
            arrivalTerminal: prev[reservationId]?.arrivalTerminal ?? "",
            onTime: prev[reservationId]?.onTime ?? null,
            checkedAt: new Date().toISOString(),
            busy: false,
            error: null,
            hotelStatusSummary: hotelSummary,
          },
        }));
        setToast(hotelSummary);
        return;
      }
      if (reservation.type !== "flight") {
        setToast("Status lookup is available for flight reservations only.");
        return;
      }

      const lookupInput = extractFlightLookupInput(reservation);
      if (!lookupInput) {
        const errorMessage = "Add flight number, airline, and date before checking status.";
        setFlightStatusCheckByReservationId((prev) => ({
          ...prev,
          [reservationId]: {
            flightStatus: prev[reservationId]?.flightStatus ?? reservation.flightStatus ?? "",
            delayMinutes: prev[reservationId]?.delayMinutes ?? reservation.flightDelayMinutes ?? null,
            departureGate: prev[reservationId]?.departureGate ?? reservation.flightDepartureGate ?? "",
            departureTerminal: prev[reservationId]?.departureTerminal ?? reservation.flightDepartureTerminal ?? "",
            arrivalGate: prev[reservationId]?.arrivalGate ?? reservation.flightArrivalGate ?? "",
            arrivalTerminal: prev[reservationId]?.arrivalTerminal ?? reservation.flightArrivalTerminal ?? "",
            onTime: prev[reservationId]?.onTime ?? reservation.flightOnTime ?? null,
            checkedAt: new Date().toISOString(),
            busy: false,
            error: errorMessage,
            hotelStatusSummary: null,
          },
        }));
        setToast(errorMessage);
        return;
      }

      setFlightStatusCheckByReservationId((prev) => ({
        ...prev,
        [reservationId]: {
          flightStatus: prev[reservationId]?.flightStatus ?? reservation.flightStatus ?? "",
          delayMinutes: prev[reservationId]?.delayMinutes ?? reservation.flightDelayMinutes ?? null,
          departureGate: prev[reservationId]?.departureGate ?? reservation.flightDepartureGate ?? "",
          departureTerminal: prev[reservationId]?.departureTerminal ?? reservation.flightDepartureTerminal ?? "",
          arrivalGate: prev[reservationId]?.arrivalGate ?? reservation.flightArrivalGate ?? "",
          arrivalTerminal: prev[reservationId]?.arrivalTerminal ?? reservation.flightArrivalTerminal ?? "",
          onTime: prev[reservationId]?.onTime ?? reservation.flightOnTime ?? null,
          checkedAt: new Date().toISOString(),
          busy: true,
          error: null,
          hotelStatusSummary: null,
        },
      }));

      try {
        const params = new URLSearchParams({
          action: "flight-lookup",
          flightNumber: lookupInput.flightNumber,
          airline: lookupInput.airline,
          flightDate: lookupInput.flightDate,
        });
        const response = await fetch(`/api/travel-updates?${params.toString()}`, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });
        const payload = (await response.json()) as {
          error?: string;
          flightNumber?: string;
          airline?: string;
          flightDate?: string;
          departureAirport?: string;
          arrivalAirport?: string;
          departureTime?: string;
          arrivalTime?: string;
          departureTerminal?: string;
          departureGate?: string;
          arrivalTerminal?: string;
          arrivalGate?: string;
          delayMinutes?: number | null;
          onTime?: boolean | null;
          flightStatus?: string;
        };
        if (!response.ok || payload.error) {
          throw new Error(payload.error ?? `Flight lookup failed (${response.status})`);
        }

        const nextStatus = payload.flightStatus?.trim() || reservation.flightStatus || "unknown";
        const nextDepartureGate = payload.departureGate?.trim() ?? "";
        const nextDepartureTerminal = payload.departureTerminal?.trim() ?? "";
        const nextArrivalGate = payload.arrivalGate?.trim() ?? "";
        const nextArrivalTerminal = payload.arrivalTerminal?.trim() ?? "";
        const nextDelayMinutes =
          typeof payload.delayMinutes === "number" && Number.isFinite(payload.delayMinutes)
            ? payload.delayMinutes
            : null;
        const nextOnTime = typeof payload.onTime === "boolean" ? payload.onTime : null;

        setFlightStatusCheckByReservationId((prev) => ({
          ...prev,
          [reservationId]: {
            flightStatus: nextStatus,
            delayMinutes: nextDelayMinutes,
            departureGate: nextDepartureGate,
            departureTerminal: nextDepartureTerminal,
            arrivalGate: nextArrivalGate,
            arrivalTerminal: nextArrivalTerminal,
            onTime: nextOnTime,
            checkedAt: new Date().toISOString(),
            busy: false,
            error: null,
            hotelStatusSummary: null,
          },
        }));

        setReservations((prev) =>
          prev.map((item) =>
            item.id === reservationId
              ? {
                  ...item,
                  flightNumber: payload.flightNumber?.trim() || lookupInput.flightNumber,
                  flightAirline: payload.airline?.trim() || lookupInput.airline,
                  flightDate: payload.flightDate?.trim() || lookupInput.flightDate,
                  flightDepartureAirport: payload.departureAirport?.trim() || item.flightDepartureAirport || "",
                  flightArrivalAirport: payload.arrivalAirport?.trim() || item.flightArrivalAirport || "",
                  flightDepartureTime: payload.departureTime?.trim() || item.flightDepartureTime || "",
                  flightArrivalTime: payload.arrivalTime?.trim() || item.flightArrivalTime || "",
                  flightStatus: nextStatus,
                  flightDepartureGate: nextDepartureGate || item.flightDepartureGate || "",
                  flightDepartureTerminal: payload.departureTerminal?.trim() || item.flightDepartureTerminal || "",
                  flightArrivalGate: payload.arrivalGate?.trim() || item.flightArrivalGate || "",
                  flightArrivalTerminal: payload.arrivalTerminal?.trim() || item.flightArrivalTerminal || "",
                  flightDelayMinutes: nextDelayMinutes ?? item.flightDelayMinutes,
                  flightOnTime: nextOnTime ?? item.flightOnTime,
                }
              : item,
          ),
        );
        queueMutation("Flight status refreshed.", {
          key: "flight-status-check",
          reservationId,
          fingerprint: `flight-status:${reservationId}:${Date.now()}`,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to check flight status.";
        setFlightStatusCheckByReservationId((prev) => ({
          ...prev,
          [reservationId]: {
            flightStatus: prev[reservationId]?.flightStatus ?? reservation.flightStatus ?? "",
            delayMinutes: prev[reservationId]?.delayMinutes ?? reservation.flightDelayMinutes ?? null,
            departureGate: prev[reservationId]?.departureGate ?? reservation.flightDepartureGate ?? "",
            departureTerminal: prev[reservationId]?.departureTerminal ?? reservation.flightDepartureTerminal ?? "",
            arrivalGate: prev[reservationId]?.arrivalGate ?? reservation.flightArrivalGate ?? "",
            arrivalTerminal: prev[reservationId]?.arrivalTerminal ?? reservation.flightArrivalTerminal ?? "",
            onTime: prev[reservationId]?.onTime ?? reservation.flightOnTime ?? null,
            checkedAt: new Date().toISOString(),
            busy: false,
            error: message,
            hotelStatusSummary: null,
          },
        }));
        setToast(message);
      }
    },
    [queueMutation, reservations, setToast],
  );
  // Keep ref in sync so the flight-polling useEffect (declared above) can call it
  // Must be done in useEffect to avoid "Cannot access refs during render" lint error
  useEffect(() => {
    handleCheckFlightStatusRef.current = handleCheckFlightStatus;
  }, [handleCheckFlightStatus]);

  const normalizeDuplicateValue = (value: string): string => value.trim().toLowerCase();

  const isDuplicateReservation = (reservation: Reservation, draft: ReservationDraft): boolean => {
    const reservationCode = normalizeDuplicateValue(reservation.confirmationCode);
    const draftCode = normalizeDuplicateValue(draft.confirmationCode);
    if (reservationCode.length > 0 && draftCode.length > 0 && reservationCode === draftCode) {
      return true;
    }
    return (
      normalizeDuplicateValue(reservation.type) === normalizeDuplicateValue(draft.type) &&
      normalizeDuplicateValue(reservation.provider) === normalizeDuplicateValue(draft.provider) &&
      normalizeDuplicateValue(reservation.localTime) === normalizeDuplicateValue(draft.localTime) &&
      normalizeDuplicateValue(reservation.location) === normalizeDuplicateValue(draft.location)
    );
  };

  const acceptReviewWithDraft = (reviewId: string, draftOverride?: ReservationDraft): void => {
    const target = reviewQueue.find((item) => item.id === reviewId);
    if (!target) return;
    const draft = draftOverride ?? target.draft;
    const duplicateReservation = reservations.find((reservation) => isDuplicateReservation(reservation, draft));
    if (duplicateReservation) {
      pushUndoSnapshot("Duplicate review item skipped");
      setReviewQueue((prev) => prev.filter((item) => item.id !== reviewId));
      queueMutation("Duplicate review item skipped.", {
        key: "review-duplicate-skip",
        reservationId: duplicateReservation.id,
      });
      setToast(
        `Possible duplicate found (${duplicateReservation.title || duplicateReservation.provider || "existing reservation"}) — skipped this review item.`,
      );
      return;
    }
    const integrity = evaluateReservationIntegrity(draft);
    if (!integrity.safeForLive) {
      setReviewQueue((prev) =>
        prev.map((item) =>
          item.id === reviewId
            ? {
                ...item,
                draft: item.id === reviewId ? draft : item.draft,
                parsingStatus: "needs-user-input",
                reviewStatus: "incomplete",
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
      ...draft,
      id: nextId("res"),
      source: "review-accepted",
    };
    const nextReservations = [newReservation, ...reservations];
    setReservations((prev) => [newReservation, ...prev]);
    setReviewQueue((prev) => prev.filter((item) => item.id !== reviewId));
    void triggerHaptic("medium");
    queueMutation("Review item accepted into live trip.", {
      key: "review-accept",
      reservationId: newReservation.id,
    });
    void syncReservationsToGoogleCalendar(nextReservations, "review-accept");
  };

  const handleAcceptReview = (reviewId: string): void => {
    acceptReviewWithDraft(reviewId);
  };

  const handleConfirmIncompleteReview = (reviewId: string, updates: Partial<ReservationDraft>): void => {
    const target = reviewQueue.find((item) => item.id === reviewId);
    if (!target) return;
    const nextDraft: ReservationDraft = {
      ...target.draft,
      ...updates,
      title: (updates.title ?? target.draft.title).trim(),
      provider: (updates.provider ?? target.draft.provider).trim(),
      localTime: (updates.localTime ?? target.draft.localTime).trim(),
      timezone: (updates.timezone ?? target.draft.timezone).trim(),
      location: (updates.location ?? target.draft.location).trim(),
      confirmationCode: (updates.confirmationCode ?? target.draft.confirmationCode).trim(),
      notes: (updates.notes ?? target.draft.notes).trim(),
    };
    const missingFields = [
      !nextDraft.title ? "title" : null,
      !nextDraft.provider ? "provider" : null,
      !nextDraft.confirmationCode ? "confirmationCode" : null,
      !nextDraft.localTime ? "localTime" : null,
      !nextDraft.timezone ? "timezone" : null,
      !nextDraft.location ? "location" : null,
    ].filter((field): field is NonNullable<ReviewItem["missingFields"]>[number] => field !== null);

    if (missingFields.length > 0) {
      setReviewQueue((prev) =>
        prev.map((item) =>
          item.id === reviewId
            ? {
                ...item,
                draft: nextDraft,
                missingFields,
                parsingStatus: "needs-user-input",
                reviewStatus: "incomplete",
                reasons: [
                  ...new Set([
                    ...item.reasons,
                    `Still missing: ${missingFields.join(", ")}.`,
                  ]),
                ],
              }
            : item,
        ),
      );
      setToast("Please complete the highlighted fields before confirming.");
      return;
    }

    setReviewQueue((prev) =>
      prev.map((item) =>
        item.id === reviewId
          ? {
              ...item,
              draft: nextDraft,
              missingFields: [],
              parsingStatus: "needs-review",
              reviewStatus: "pending",
            }
          : item,
      ),
    );
    acceptReviewWithDraft(reviewId, nextDraft);
  };

  const handleRejectReview = useCallback(
    (reviewId: string, options?: { source?: "review-card" | "review-drawer" | "skip-review" }): void => {
      const source = options?.source ?? "review-card";
      if (!reviewQueue.some((item) => item.id === reviewId)) {
        setToast("Review item not found.");
        return;
      }
      pushUndoSnapshot("Review item rejected");
      const nextQueue = reviewQueue.filter((item) => item.id !== reviewId);
      setReviewQueue(nextQueue);
      const targetTripId = activeTripId ?? trips[0]?.id ?? null;
      if (targetTripId) {
        setTrips((previous) =>
          previous.map((trip) =>
            trip.id === targetTripId
              ? {
                  ...trip,
                  reviewQueue: nextQueue,
                }
              : trip,
          ),
        );
      }
      persistReviewQueueToTrip(nextQueue, { reviewId, source });
      queueMutation("Review item archived.");
      if (activeDrawer?.kind === "review" && activeDrawer.id === reviewId) {
        closeDrawer();
      }
    },
    [activeDrawer, activeTripId, closeDrawer, persistReviewQueueToTrip, pushUndoSnapshot, queueMutation, reviewQueue, setToast, trips],
  );

  const handleSkipReviewAndAdvance = (reviewId: string): void => {
    const currentIndex = reviewQueue.findIndex((item) => item.id === reviewId);
    if (currentIndex < 0) {
      closeDrawer();
      return;
    }
    const nextReview =
      reviewQueue[currentIndex + 1] ??
      reviewQueue[currentIndex - 1] ??
      null;

    handleRejectReview(reviewId, { source: "skip-review" });
    if (nextReview) {
      openDrawer("review", nextReview.id);
      return;
    }
    closeDrawer();
  };

  const handleConfirmPendingDelete = useCallback((): void => {
    if (!pendingDeleteConfirmation) {
      return;
    }
    if (pendingDeleteConfirmation.kind === "reservation") {
      handleDeleteReservation(pendingDeleteConfirmation.id);
    } else {
      handleRejectReview(pendingDeleteConfirmation.id, {
        source: pendingDeleteConfirmation.source === "review-drawer" ? "review-drawer" : "review-card",
      });
    }
    setPendingDeleteConfirmation(null);
  }, [handleDeleteReservation, handleRejectReview, pendingDeleteConfirmation]);

  const handleCloseDeleteConfirmation = useCallback((): void => {
    if (!pendingDeleteConfirmation) {
      return;
    }
    setPendingDeleteConfirmation(null);
  }, [pendingDeleteConfirmation]);

  const toggleDisruption = useCallback((): void => {
    setToast("Disruption simulation is not enabled in this build.");
  }, [setToast]);

  const handleReparseReview = (reviewId: string): void => {
    pushUndoSnapshot("Review item re-parsed");
    setReviewQueue((prev) =>
      prev.map((item) => {
        if (item.id !== reviewId) return item;
        const nextConfidence: Confidence =
          item.draft.confidence === "low" ? "medium" : item.draft.confidence === "medium" ? "high" : "high";
        const parseConfidenceScore = nextConfidence === "high" ? 82 : nextConfidence === "medium" ? 58 : 35;
        return {
          ...item,
          reasons: nextConfidence === "high" ? ["Parser confidence improved. Verify before accepting."] : item.reasons,
          parseConfidenceScore,
          parsingStatus:
            nextConfidence === "high"
              ? "auto-parsed"
              : nextConfidence === "medium"
                ? "needs-review"
                : "needs-user-input",
          reviewStatus: item.draft.confidence === "low" ? "incomplete" : "pending",
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
    setReadinessItems((prev) => {
      const updated = prev.map((item) => (item.id === id ? { ...item, complete: !item.complete } : item));
      // Save directly to Redis after state settles — do not rely on queueMutation
      // which doesn't include readinessItems in its payload
      if (activeTripId) {
        window.setTimeout(() => {
          void fetch(TRIP_API_ROUTE, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "update",
              id: activeTripId,
              patch: { readinessItems: updated },
            }),
          }).catch(() => {
            // fail silently - autosave will retry
          });
        }, 300);
      }
      return updated;
    });
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const toggleMemberSharing = (memberId: string): void => {
    setFamilyMembers((prev) =>
      prev.map((member) =>
        member.id === memberId ? { ...member, sharingEnabled: !member.sharingEnabled } : member,
      ),
    );
    queueMutation("Family location sharing preference updated.");
  };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  const handleOpenConsumerReviewQueue = useCallback(
    (event?: { preventDefault?: () => void; stopPropagation?: () => void }): void => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      if (reviewQueue.length === 0) {
        setToast("Review queue is already clear.");
        return;
      }
      setConsumerReviewQueueSession({
        open: true,
        processed: 0,
        total: reviewQueue.length,
      });
    },
    [reviewQueue.length, setToast],
  );

  const handleConsumerReviewQueueAction = (action: "accept" | "delete"): void => {
    if (!consumerReviewQueueSession.open) {
      return;
    }
    const currentItem = reviewQueue[0];
    if (!currentItem) {
      setConsumerReviewQueueSession({ open: false, processed: 0, total: 0 });
      return;
    }
    if (action === "accept") {
      handleAcceptReview(currentItem.id);
    } else {
      handleRejectReview(currentItem.id);
    }
    setConsumerReviewQueueSession((prev) =>
      prev.open
        ? {
            ...prev,
            processed: Math.min(prev.total, prev.processed + 1),
          }
        : prev,
    );
  };

  // Auto-close the review session card once all items have been processed.
  useEffect(() => {
    if (consumerReviewQueueSession.open && reviewQueue.length === 0) {
      const timer = window.setTimeout(() => {
        setConsumerReviewQueueSession({ open: false, processed: 0, total: 0 });
      }, 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [consumerReviewQueueSession.open, reviewQueue.length]);

  const navigateToConsumerTab = useCallback((nextTab: ConsumerTab): void => {
    setConsumerTab(nextTab);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", nextTab);
    const nextUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", nextUrl);
  }, []);

  const handleReservationsRefresh = useCallback(async (): Promise<void> => {
    if (reservationsRefreshing) {
      return;
    }
    setReservationsRefreshing(true);
    try {
      await refreshTripsFromServer();
      setToast("Reservations refreshed.");
    } catch {
      setToast("Unable to refresh reservations right now.");
    } finally {
      setReservationsRefreshing(false);
    }
  }, [refreshTripsFromServer, reservationsRefreshing, setToast]);

  const handleReservationsTouchStart = useCallback(
    (event: ReactTouchEvent<HTMLElement>): void => {
      if (consumerTab !== "flights") {
        return;
      }
      if (window.scrollY > 4) {
        reservationsPullStartYRef.current = null;
        return;
      }
      reservationsPullStartYRef.current = event.touches[0]?.clientY ?? null;
    },
    [consumerTab],
  );

  const handleReservationsTouchEnd = useCallback(
    (event: ReactTouchEvent<HTMLElement>): void => {
      if (consumerTab !== "flights") {
        return;
      }
      const startY = reservationsPullStartYRef.current;
      reservationsPullStartYRef.current = null;
      if (startY === null || reservationsRefreshing) {
        return;
      }
      if (window.scrollY > 4) {
        return;
      }
      const endY = event.changedTouches[0]?.clientY ?? startY;
      const pullDistance = endY - startY;
      if (pullDistance < 70) {
        return;
      }
      void handleReservationsRefresh();
    },
    [consumerTab, handleReservationsRefresh, reservationsRefreshing],
  );

  const openReadinessChecklistInMoreTab = useCallback((): void => {
    setPendingMoreScrollTarget("readiness-checklist");
    navigateToConsumerTab("more");
  }, [navigateToConsumerTab]);

  useEffect(() => {
    if (consumerTab !== "more" || pendingMoreScrollTarget !== "readiness-checklist") {
      return;
    }
    const timeout = window.setTimeout(() => {
      readinessChecklistSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      setPendingMoreScrollTarget(null);
    }, 140);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [consumerTab, pendingMoreScrollTarget]);

  const consumerPrimaryAction = (() => {
    if (tripStatus === "red" || activeScenario !== "none" || delayedFlight) {
      return {
        label: "View reservations",
        targetTab: "flights" as ConsumerTab,
      };
    }
    if (unresolvedReviewCount > 0) {
      return {
        label: unresolvedReviewCount === 1 ? "Review 1 booking" : `Review ${unresolvedReviewCount} bookings`,
        targetTab: "flights" as ConsumerTab,
      };
    }
    if (unresolvedReadinessCount > 0) {
      return {
        label:
          unresolvedReadinessCount === 1
            ? "Finish 1 checklist item"
            : `Finish ${unresolvedReadinessCount} checklist items`,
        targetTab: "more" as ConsumerTab,
        onClick: () => openReadinessChecklistInMoreTab(),
      };
    }
    return null;
  })();
  const activeConsumerReviewItem = consumerReviewQueueSession.open ? (reviewQueue[0] ?? null) : null;
  const consumerReviewProgressLabel =
    consumerReviewQueueSession.open && consumerReviewQueueSession.total > 0
      ? `${Math.min(consumerReviewQueueSession.processed + 1, consumerReviewQueueSession.total)} of ${
          consumerReviewQueueSession.total
        }`
      : null;
  const getConsumerReservationStatus = useCallback(
    (reservation: Reservation): { label: string; className: string } => {
      if (reservation.type === "flight") {
        const checkedStatus = flightStatusCheckByReservationId[reservation.id];
        if (checkedStatus?.busy) {
          return {
            label: "Checking...",
            className: "bg-cyan-500/15 text-cyan-700 ring-1 ring-cyan-500/30 dark:text-cyan-100",
          };
        }
        if (checkedStatus && !checkedStatus.error) {
          const delayed =
            checkedStatus.onTime === false ||
            (typeof checkedStatus.delayMinutes === "number" && checkedStatus.delayMinutes > 0) ||
            /\b(delay|cancel)\b/iu.test(checkedStatus.flightStatus);
          if (delayed) {
            return {
              label:
                typeof checkedStatus.delayMinutes === "number" && checkedStatus.delayMinutes > 0
                  ? `Delayed ${checkedStatus.delayMinutes}m`
                  : "Delayed",
              className: "bg-amber-500/15 text-amber-700 ring-1 ring-amber-500/30 dark:text-amber-200",
            };
          }
          if (checkedStatus.onTime === true) {
            return {
              label: "On time",
              className: "bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-200",
            };
          }
        }
        const flightStatus = flightLiveStatusByReservationId.get(reservation.id);
        if (flightStatus === "delayed") {
          return {
            label: "Delayed",
            className: "bg-amber-500/15 text-amber-700 ring-1 ring-amber-500/30 dark:text-amber-200",
          };
        }
        if (flightStatus === "on-time") {
          return {
            label: "On time",
            className: "bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-200",
          };
        }
        // Past flight — use flightDate (most reliable) to avoid misclassifying future flights
        const _depCandidates = [
          reservation.flightDate ? parseDateInput(reservation.flightDate + " 23:59") : Number.NaN,
          reservation.flightDepartureTime ? parseDateInput(reservation.flightDepartureTime) : Number.NaN,
          parseDateInput(reservation.localTime ?? ""),
        ].filter(v => !Number.isNaN(v));
        const depMs = _depCandidates.length > 0 ? Math.max(..._depCandidates) : Number.NaN;
        if (!Number.isNaN(depMs) && Date.now() - depMs > 4 * 3_600_000) {
          return {
            label: "Completed",
            className: "bg-slate-400/20 text-slate-500 ring-1 ring-slate-400/20 dark:text-slate-400",
          };
        }
        return {
          label: "Check status",
          className: "bg-slate-900/10 text-slate-700 ring-1 ring-slate-400/30 dark:text-slate-200",
        };
      }
      if (reservation.type === "hotel") {
        const checkedStatus = flightStatusCheckByReservationId[reservation.id];
        if (checkedStatus?.hotelStatusSummary) {
          return {
            label: "Check-in info",
            className: "bg-cyan-500/15 text-cyan-700 ring-1 ring-cyan-500/30 dark:text-cyan-100",
          };
        }
        return {
          label: "Check status",
          className: "bg-slate-900/10 text-slate-700 ring-1 ring-slate-400/30 dark:text-slate-200",
        };
      }
      if (reservation.critical) {
        return {
          label: "Action needed",
          className: "bg-amber-500/15 text-amber-700 ring-1 ring-amber-500/30 dark:text-amber-200",
        };
      }
      return {
        label: "Confirmed",
        className: "bg-slate-900/10 text-slate-700 ring-1 ring-slate-400/30 dark:text-slate-200",
      };
    },
    [flightLiveStatusByReservationId, flightStatusCheckByReservationId],
  );

  const activeDrawerPanel = activeDrawer ? (
    <div className="fixed inset-0 z-[140] flex items-end justify-end bg-slate-950/70 p-3 md:p-6">
      <div
        ref={drawerContainerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="travel-assistant-drawer-title"
        tabIndex={-1}
        className="h-full w-full max-w-xl overflow-y-auto rounded-2xl border border-[var(--border-default)] bg-[var(--bg-card)] p-4 text-[var(--text-primary)] md:max-h-[92vh]"
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
            className="rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] px-2 py-1 text-sm hover:opacity-80"
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
              className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-card)] px-3 py-2 text-[var(--text-primary)]"
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
                className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-card)] px-3 py-2 text-[var(--text-primary)]"
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
                className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-card)] px-3 py-2 text-[var(--text-primary)]"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-slate-300">Local time</span>
              <input
                value={drawerDraft.localTime}
                onChange={(event) => setDrawerDraft((prev) => ({ ...prev, localTime: event.target.value }))}
                className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-card)] px-3 py-2 text-[var(--text-primary)]"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-slate-300">Timezone</span>
              <input
                value={formatTimezoneForDisplay(drawerDraft.timezone) === "Not set" ? "" : drawerDraft.timezone}
                onChange={(event) => setDrawerDraft((prev) => ({ ...prev, timezone: event.target.value }))}
                placeholder="Not set"
                className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-card)] px-3 py-2 text-[var(--text-primary)]"
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-slate-300">Location</span>
            <input
              value={drawerDraft.location}
              onChange={(event) => setDrawerDraft((prev) => ({ ...prev, location: event.target.value }))}
              className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-card)] px-3 py-2 text-[var(--text-primary)]"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-slate-300">Confirmation code</span>
            <input
              value={drawerDraft.confirmationCode}
              onChange={(event) =>
                setDrawerDraft((prev) => ({ ...prev, confirmationCode: event.target.value }))
              }
              className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-card)] px-3 py-2 text-[var(--text-primary)]"
            />
          </label>
          {(drawerDraft.type === "flight" ||
            /\bflight\b/iu.test(`${drawerDraft.title} ${drawerDraft.provider}`) ||
            /\b[A-Z]{2,3}\s?\d{1,4}[A-Z]?\b/u.test(drawerDraft.title)) ? (
            <section className="rounded-xl border border-sky-200 dark:border-sky-500/40 bg-sky-50 dark:bg-sky-500/10 p-4 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">Flight details</p>
              <div className="grid gap-3 grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs text-sky-700 dark:text-sky-300">Flight number</span>
                  <input
                    value={drawerDraft.flightNumber ?? ""}
                    onChange={(event) =>
                      setDrawerDraft((prev) => ({ ...prev, flightNumber: event.target.value.trim().toUpperCase() }))
                    }
                    placeholder="AA123"
                    className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-card)] px-3 py-2 text-[var(--text-primary)] text-sm"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-sky-700 dark:text-sky-300">Airline</span>
                  <input
                    value={drawerDraft.flightAirline ?? ""}
                    onChange={(event) =>
                      setDrawerDraft((prev) => ({ ...prev, flightAirline: event.target.value }))
                    }
                    placeholder="American Airlines"
                    className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-card)] px-3 py-2 text-[var(--text-primary)] text-sm"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-sky-700 dark:text-sky-300">Date</span>
                  <input
                    type="date"
                    value={drawerDraft.flightDate ?? ""}
                    onChange={(event) =>
                      setDrawerDraft((prev) => ({ ...prev, flightDate: event.target.value }))
                    }
                    className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-card)] px-3 py-2 text-[var(--text-primary)] text-sm"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-sky-700 dark:text-sky-300">From (IATA)</span>
                  <input
                    value={drawerDraft.flightDepartureAirport ?? ""}
                    onChange={(event) => setDrawerDraft((prev) => ({ ...prev, flightDepartureAirport: event.target.value.toUpperCase() }))}
                    placeholder="HND"
                    className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-card)] px-3 py-2 text-[var(--text-primary)] text-sm font-mono"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-sky-700 dark:text-sky-300">To (IATA)</span>
                  <input
                    value={drawerDraft.flightArrivalAirport ?? ""}
                    onChange={(event) => setDrawerDraft((prev) => ({ ...prev, flightArrivalAirport: event.target.value.toUpperCase() }))}
                    placeholder="ONT"
                    className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-card)] px-3 py-2 text-[var(--text-primary)] text-sm font-mono"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-sky-700 dark:text-sky-300">Depart time</span>
                  <input
                    value={drawerDraft.flightDepartureTime ?? ""}
                    onChange={(event) => setDrawerDraft((prev) => ({ ...prev, flightDepartureTime: event.target.value }))}
                    placeholder="2026-05-29 21:20"
                    className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-card)] px-3 py-2 text-[var(--text-primary)] text-sm"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-sky-700 dark:text-sky-300">Arrive time</span>
                  <input
                    value={drawerDraft.flightArrivalTime ?? ""}
                    onChange={(event) => setDrawerDraft((prev) => ({ ...prev, flightArrivalTime: event.target.value }))}
                    placeholder="2026-05-30 08:00"
                    className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-card)] px-3 py-2 text-[var(--text-primary)] text-sm"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-sky-700 dark:text-sky-300">Gate</span>
                  <input
                    value={drawerDraft.flightDepartureGate ?? ""}
                    onChange={(event) => setDrawerDraft((prev) => ({ ...prev, flightDepartureGate: event.target.value.toUpperCase() }))}
                    placeholder="A14"
                    className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-card)] px-3 py-2 text-[var(--text-primary)] text-sm"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-sky-700 dark:text-sky-300">Terminal</span>
                  <input
                    value={drawerDraft.flightDepartureTerminal ?? ""}
                    onChange={(event) => setDrawerDraft((prev) => ({ ...prev, flightDepartureTerminal: event.target.value.toUpperCase() }))}
                    placeholder="2"
                    className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-card)] px-3 py-2 text-[var(--text-primary)] text-sm"
                  />
                </label>
                <label className="block col-span-2">
                  <span className="mb-1 block text-xs text-sky-700 dark:text-sky-300">Seat number</span>
                  <input
                    value={drawerDraft.flightSeatNumber ?? ""}
                    onChange={(event) => setDrawerDraft((prev) => ({ ...prev, flightSeatNumber: event.target.value.toUpperCase() }))}
                    placeholder="14A"
                    className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-card)] px-3 py-2 text-[var(--text-primary)] text-sm font-mono"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() => {
                  void handleLookupReviewFlight();
                }}
                disabled={
                  flightLookupBusy ||
                  !(drawerDraft.flightNumber?.trim() && drawerDraft.flightAirline?.trim() && drawerDraft.flightDate?.trim())
                }
                className="mt-3 rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {flightLookupBusy ? "Looking up..." : "Look up flight"}
              </button>
              {flightLookupError ? <p className="mt-2 text-xs text-rose-300">{flightLookupError}</p> : null}
              {drawerDraft.flightDepartureAirport || drawerDraft.flightArrivalAirport || drawerDraft.flightStatus ? (
                <div className="mt-3 space-y-1 text-xs text-cyan-50">
                  <p>
                    <span className="font-semibold">Departure:</span>{" "}
                    {drawerDraft.flightDepartureAirport || "Unknown"} {drawerDraft.flightDepartureTime ? `• ${drawerDraft.flightDepartureTime}` : ""}
                  </p>
                  <p>
                    <span className="font-semibold">Arrival:</span>{" "}
                    {drawerDraft.flightArrivalAirport || "Unknown"} {drawerDraft.flightArrivalTime ? `• ${drawerDraft.flightArrivalTime}` : ""}
                  </p>
                  <p>
                    <span className="font-semibold">Status:</span> {drawerDraft.flightStatus || "Unknown"}
                  </p>
                </div>
              ) : null}
            </section>
          ) : null}
          <label className="block">
            <span className="mb-1 block text-slate-300">Assigned people</span>
            <div className="grid gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-muted)] p-3 text-xs">
              {assignmentTravelerOptions.map((member) => (
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
              {assignmentTravelerOptions.length === 0 ? (
                <p className="text-xs text-slate-400">No travelers found for this trip yet.</p>
              ) : null}
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-slate-300">Notes</span>
            <textarea
              value={drawerDraft.notes}
              onChange={(event) => setDrawerDraft((prev) => ({ ...prev, notes: event.target.value }))}
              className="h-24 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-card)] px-3 py-2 text-[var(--text-primary)]"
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
          {activeDrawer.kind === "reservation" ? (
            <button
              type="button"
              onClick={() => {
                handleDeleteReservation(activeDrawer.id);
                closeDrawer();
              }}
              className="rounded-lg bg-red-500 px-3 py-2 text-sm font-semibold text-white hover:bg-red-400"
            >
              Delete reservation
            </button>
          ) : null}
          {activeDrawer.kind === "reservation" && trips.filter((trip) => trip.id !== activeTripId).length > 0 ? (
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) void handleMoveReservationToTrip(activeDrawer.id, e.target.value);
              }}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="" disabled>Move to trip…</option>
              {trips.filter((trip) => trip.id !== activeTripId).map((trip) => (
                <option key={trip.id} value={trip.id}>{trip.name}</option>
              ))}
            </select>
          ) : null}
          {activeDrawer.kind === "review" ? (
            <button
              type="button"
              onClick={() => {
                acceptReviewWithDraft(activeDrawer.id, drawerDraft);
                closeDrawer();
              }}
              className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
            >
              Save + accept review
            </button>
          ) : null}
          {activeDrawer.kind === "review" ? (
            <button
              type="button"
              onClick={() => {
                handleSkipReviewAndAdvance(activeDrawer.id);
              }}
              className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-600"
            >
              Skip review
            </button>
          ) : null}
          {activeDrawer.kind === "review" ? (
            <button
              type="button"
              onClick={() => {
                requestDeleteConfirmation({
                  kind: "review",
                  id: activeDrawer.id,
                  source: "review-drawer",
                });
              }}
              className="rounded-lg bg-rose-500 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-400"
            >
              Delete review item
            </button>
          ) : null}
        </div>
      </div>
    </div>
  ) : null;

  const deleteConfirmationDialog = pendingDeleteConfirmation ? (
    <div className="fixed inset-0 z-[170] flex items-center justify-center bg-slate-950/70 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--border-default)] bg-[var(--bg-card)] p-4 text-[var(--text-primary)] shadow-2xl">
        <h2 className="text-base font-semibold">Delete this reservation? This cannot be undone.</h2>
        <p className="mt-2 text-sm text-slate-300">
          {pendingDeleteConfirmation.kind === "review"
            ? "This will permanently remove the pending review item."
            : "This will permanently remove the saved reservation."}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={handleCloseDeleteConfirmation}
            className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-600"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmPendingDelete}
            className="rounded-lg bg-rose-500 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-400"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const plannerFlightCount = consumerReservationsSorted.filter((reservation) => reservation.type === "flight").length;
  const plannerHotelCount = consumerReservationsSorted.filter((reservation) => reservation.type === "hotel").length;
  const plannerOtherBookingCount = consumerReservationsSorted.length - plannerFlightCount - plannerHotelCount;
  const plannerReadyStepCount =
    (activeTrip ? 1 : 0) +
    (consumerTripStartDate && consumerTripEndDate ? 1 : 0) +
    (plannerFlightCount > 0 ? 1 : 0) +
    (plannerHotelCount > 0 ? 1 : 0);

  if (!advancedWorkspaceEnabled) {
    return (
      <main className="relative min-h-screen overflow-x-hidden bg-[var(--bg-base)] pb-24 text-[var(--text-primary)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,rgba(14,165,233,0.12),transparent_38%),radial-gradient(circle_at_80%_10%,rgba(34,197,94,0.10),transparent_35%)]" />
        <div className="relative z-10 mx-auto max-w-3xl space-y-4 px-4 py-4 sm:py-6">
          <header className="sticky top-0 z-30 -mx-4 border-b border-slate-200/70 bg-slate-50/90 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <Logo size="sm" showWordmark={false} className="shrink-0" />
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setConsumerAvatarMenuOpen((value) => !value)}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-cyan-500 text-base font-bold text-slate-950 shadow-sm ring-1 ring-cyan-300"
                  aria-label="Open account menu"
                >
                  {selectedFamilyMember.name.slice(0, 1).toUpperCase()}
                </button>
                {consumerAvatarMenuOpen ? (
                  <div className="absolute right-0 top-[calc(100%+0.5rem)] z-40 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                    <button
                      type="button"
                      onClick={() => {
                        clerk.openUserProfile();
                        setConsumerAvatarMenuOpen(false);
                      }}
                      className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      Account
                    </button>
                    <Link
                      href="/billing"
                      className="block rounded-xl px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                      onClick={() => setConsumerAvatarMenuOpen(false)}
                    >
                      Billing
                    </Link>
                    {isAdminUser ? (
                      <Link
                        href="/admin"
                        className="block rounded-xl px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                        onClick={() => setConsumerAvatarMenuOpen(false)}
                      >
                        Admin
                      </Link>
                    ) : null}
                    <div className="mt-2 rounded-xl bg-slate-100 p-2 dark:bg-slate-950">
                      <p className="mb-2 px-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Language</p>
                      <LanguageToggle />
                    </div>
                    <div className="mt-2 flex items-center justify-between rounded-xl bg-slate-100 p-2 text-sm dark:bg-slate-950">
                      <span>Theme</span>
                      <ThemeToggle />
                    </div>
                    {showAdvancedShortcut ? (
                      <div className="mt-2">
                        <AdvancedModeToggle
                          enabled={advancedModeEnabled}
                          onChange={handleAdvancedModeChange}
                          disabled={advancedModeSaving}
                          description="Unlocked from the trip header."
                        />
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        void clerk.signOut();
                      }}
                      className="mt-2 w-full rounded-xl px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10"
                    >
                      Sign out
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </header>

          {/* Apple-style tab bar */}
          <div className="relative flex items-stretch rounded-2xl bg-white/90 shadow-sm ring-1 ring-black/[0.06] dark:bg-slate-900/90 dark:ring-white/[0.08] overflow-hidden">
            {CONSUMER_TABS.map(({ id: tab, label, icon }) => (
              <button
                key={tab}
                type="button"
                onClick={() => tab === "map" ? router.push("/travel-assistant/live-map") : navigateToConsumerTab(tab)}
                className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 transition-all ${
                  consumerTab === tab
                    ? "text-[#007AFF] dark:text-[#0A84FF]"
                    : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                }`}
              >
                <span className="text-[15px] leading-none">{icon}</span>
                <span className={`text-[10px] font-semibold tracking-tight ${consumerTab === tab ? "text-[#007AFF] dark:text-[#0A84FF]" : ""}`}>{label}</span>
                {consumerTab === tab && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[2.5px] w-8 rounded-full bg-[#007AFF] dark:bg-[#0A84FF]" />
                )}
              </button>
            ))}
          </div>

          {tripsLoading ? (
            <section className="space-y-4">
              <div className="h-48 rounded-3xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800" />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="h-28 rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800" />
                <div className="h-28 rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800" />
              </div>
            </section>
          ) : consumerTab === "plan" ? (
            <PlannerTab
              tripName={activeTrip?.name ?? null}
              destination={consumerTripDestination}
              startDate={consumerTripStartDate}
              endDate={consumerTripEndDate}
              flightCount={plannerFlightCount}
              hotelCount={plannerHotelCount}
              otherBookingCount={plannerOtherBookingCount}
              readyStepCount={plannerReadyStepCount}
              forwardAddress={emptyStateForwardAddress}
              canUseGmailImport={canUseGmailImport}
              gmailImportBusy={gmailImportBusy}
              onAddBooking={() => setManualReservationModalOpen(true)}
              onCreateTrip={() => {
                void handleCreateTrip();
              }}
              onImportGmail={() => setGmailScopeModalOpen(true)}
              onRequestGmailUpgrade={() =>
                openUpgradeModal("gmail-import", "Upgrade to Pro to import reservations from your connected email account.")
              }
              onCopyForwardAddress={() => {
                void handleCopyForwardAddress();
              }}
              onViewTrip={() => navigateToConsumerTab("trip")}
              onViewFlights={() => navigateToConsumerTab("flights")}
              onViewHotels={() => navigateToConsumerTab("hotels")}
            />
          ) : consumerTab === "trip" ? (
            <section className="space-y-4">
              {/* ── TRIP TAB: phase-driven, single source of truth ── */}
              {(placeholderReservationCount > 0 || importBannerHighlighted) &&
              journeyPhase.kind !== "post-trip" &&
              journeyPhase.kind !== "no-trip" ? (
                <ImportReservationsCard
                  forwardAddress={emptyStateForwardAddress}
                  placeholderCount={placeholderReservationCount}
                  highlighted={importBannerHighlighted}
                  canUseGmailImport={canUseGmailImport}
                  gmailImportBusy={gmailImportBusy}
                  onCopyForward={() => void handleCopyForwardAddress()}
                  onImportGmail={() => setGmailScopeModalOpen(true)}
                  onConnectGmail={() => {
                    window.location.href = `/api/gmail/connect?returnTo=${encodeURIComponent("/travel-assistant?tab=trip&gmail=connected")}`;
                  }}
                  onAddManual={() => setManualReservationModalOpen(true)}
                  onRequestUpgrade={() =>
                    openUpgradeModal("gmail-import", "Upgrade to Pro to import reservations from your connected email account.")
                  }
                  onDismiss={() => setImportBannerHighlighted(false)}
                />
              ) : null}
              {(guidanceLocationStatus === "at-airport" || guidanceLocationStatus === "in-terminal") &&
              journeyPhase.kind !== "post-trip" &&
              journeyPhase.kind !== "no-trip" &&
              journeyPhase.kind !== "airborne" ? (
                <Link
                  href="/travel-assistant/live-map?view=airport"
                  className="flex items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 to-blue-50 p-4 shadow-sm transition hover:border-sky-300 dark:border-sky-500/40 dark:from-sky-950/60 dark:to-blue-950/40"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-sky-950 dark:text-sky-100">
                      {guidanceLocationStatus === "in-terminal" ? "Inside the terminal" : "You're at the airport"}
                    </p>
                    <p className="mt-0.5 text-xs text-sky-900/80 dark:text-sky-100/80">
                      {guidanceNearestAirport
                        ? `Open ${guidanceNearestAirport} navigator for gate routing, lounges, and terminal map`
                        : "Open terminal navigator for gate routing and lounges"}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-xl bg-sky-600 px-3 py-2 text-xs font-bold text-white">
                    Navigate →
                  </span>
                </Link>
              ) : null}
              {/* Apple principle: one card at the top tells you exactly where you are */}
              {/* ── AIRBORNE ── */}
              {journeyPhase.kind === "airborne" ? (
                <div className="rounded-3xl overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 shadow-xl">
                  <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-sky-300/70">In flight</p>
                      <p className="text-2xl font-black text-white mt-1 leading-tight">
                        {(journeyPhase.onFlight as Reservation & Record<string, string | undefined>).flightDepartureAirport ?? ""} → {journeyPhase.landingAt}
                      </p>
                      <p className="text-sky-200/60 text-sm mt-1">
                        {(journeyPhase.onFlight as Reservation & Record<string, string | undefined>).flightNumber ?? journeyPhase.onFlight.provider} · Landing in {journeyPhase.landingIn}
                      </p>
                    </div>
                    <span className="text-4xl mt-1">✈️</span>
                  </div>
                  <div className="mx-4 mb-4 rounded-2xl bg-white/10 px-4 py-3">
                    <p className="text-sky-100/80 text-sm leading-relaxed">
                      Everything&apos;s taken care of. Relax — check the <span className="font-bold text-white">Flights tab</span> for your landing guide including baggage claim and ground transport at {journeyPhase.landingAt}.
                    </p>
                  </div>
                </div>

              ) : journeyPhase.kind === "just-landed" ? (
                /* ── JUST LANDED ── */
                <div className="rounded-3xl overflow-hidden bg-gradient-to-br from-emerald-900 via-teal-950 to-slate-900 shadow-xl">
                  <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-300/70">Welcome to {journeyPhase.landedMinutesAgo < 30 ? "your destination" : (journeyPhase.flight as Reservation & Record<string,string|undefined>).flightArrivalAirport ?? "your destination"}</p>
                      <p className="text-2xl font-black text-white mt-1 leading-tight">You&apos;ve landed 🛬</p>
                      <p className="text-emerald-200/60 text-sm mt-1">
                        {journeyPhase.landedMinutesAgo < 2 ? "Just now" : `${journeyPhase.landedMinutesAgo} min ago`}
                      </p>
                    </div>
                    <span className="text-4xl mt-1">🎉</span>
                  </div>
                  <div className="mx-4 mb-4 rounded-2xl bg-white/10 px-4 py-3">
                    <p className="text-emerald-100/80 text-sm leading-relaxed">
                      Tap <span className="font-bold text-white">Flights</span> for baggage claim directions, rideshare pickup, and ground transport at this airport.
                    </p>
                  </div>
                </div>

              ) : journeyPhase.kind === "pre-trip" ? (
                /* ── PRE-TRIP ── */
                <>
                  <NextUpCard
                    reservations={consumerReservationsSorted}
                    tripName={activeTrip?.name ?? "Your trip"}
                    onReservationTap={(id) => openDrawer("reservation", id)}
                    locationStatus={guidanceLocationStatus}
                    nearestAirport={guidanceNearestAirport}
                  />
                  <OnTrackButton
                    reservations={consumerReservationsSorted}
                    tripName={activeTrip?.name ?? "Your trip"}
                    locationStatus={guidanceLocationStatus}
                    nearestAirport={guidanceNearestAirport}
                  />
                  {journeyPhase.daysUntil <= 1 && (
                    <button
                      type="button"
                      onClick={() => setTravelDayOpen(true)}
                      className="w-full rounded-2xl bg-gradient-to-r from-[#0c2461] via-[#1a56b0] to-[#0ea5e9] px-4 py-3.5 text-left shadow-lg shadow-blue-900/40 transition"
                    >
                      <p className="text-xs font-bold uppercase tracking-widest text-sky-200">Today&apos;s travel plan</p>
                      <div className="mt-1 flex items-center justify-between">
                        <p className="text-lg font-bold text-white">Travel Day →</p>
                        <span className="text-2xl">✈️</span>
                      </div>
                      <p className="text-xs text-sky-100 mt-0.5">Timeline · Leave by time · What to expect</p>
                    </button>
                  )}
                  <GapAlerts
                    reservations={consumerReservationsSorted}
                    onActionTap={(tab) => navigateToConsumerTab(tab as ConsumerTab)}
                  />
                </>

              ) : journeyPhase.kind === "post-trip" ? (
                <div className="rounded-3xl overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 shadow-xl">
                  <div className="px-5 pt-6 pb-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">No current trips</p>
                    <p className="text-2xl font-black text-white mt-1">Ready for what&apos;s next?</p>
                    <p className="text-slate-300/80 text-sm mt-3 leading-relaxed">
                      Your last trip
                      {journeyPhase.lastDestination ? ` (${journeyPhase.lastDestination})` : ""} is finished.
                      Kepi only shows live trip mode when you have upcoming flights or stays.
                    </p>
                  </div>
                  <div className="mx-4 mb-4 flex flex-col gap-2 sm:flex-row">
                    <Link
                      href="/travel-assistant?tab=plan"
                      className="flex-1 rounded-2xl bg-emerald-600 px-4 py-3 text-center text-sm font-bold text-white transition hover:bg-emerald-500"
                    >
                      Plan your next trip →
                    </Link>
                    <button
                      type="button"
                      onClick={() => setManualReservationModalOpen(true)}
                      className="flex-1 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
                    >
                      Add a flight or hotel
                    </button>
                  </div>
                </div>

              ) : journeyPhase.kind === "no-trip" ? (
                /* ── WELCOME — new user, no trips yet ── */
                <div className="rounded-3xl overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 shadow-xl">
                  <div className="px-5 pt-6 pb-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-sky-300/70">Welcome to Kepi</p>
                    <p className="text-2xl font-black text-white mt-1">Your travel assistant ✈️</p>
                    <p className="text-sky-100/70 text-sm mt-3 leading-relaxed">
                      Kepi keeps track of everything so you can relax. Forward a confirmation email or add a flight to get started.
                    </p>
                  </div>
                  <div className="mx-4 mb-4 space-y-2">
                    {[
                      { icon: "🧭", tab: "plan" as ConsumerTab, label: "Plan", desc: "Build the trip before bookings land" },
                      { icon: "🛫", tab: "flights" as ConsumerTab, label: "Flights", desc: "Gate · terminal · live status · baggage claim" },
                      { icon: "🏨", tab: "hotels" as ConsumerTab, label: "Hotels", desc: "Check-in · check-out · confirmation" },
                      { icon: "🗺", tab: "map" as ConsumerTab, label: "Map", desc: "Family location sharing in real time" },
                    ].map(({ icon, tab, label, desc }) => (
                      <button key={label} type="button"
                        onClick={() => tab === "map" ? router.push("/travel-assistant/live-map") : navigateToConsumerTab(tab)}
                        className="w-full rounded-2xl bg-white/10 border border-white/10 px-4 py-3 text-left flex items-center gap-3 hover:bg-white/15 transition">
                        <span className="text-xl">{icon}</span>
                        <div>
                          <p className="text-white font-semibold text-sm">{label}</p>
                          <p className="text-white/50 text-xs">{desc}</p>
                        </div>
                        <span className="ml-auto text-white/30">›</span>
                      </button>
                    ))}
                  </div>
                  <div className="mx-4 mb-4 rounded-2xl bg-white/8 border border-white/10 px-4 py-3">
                    <p className="text-white/60 text-xs leading-relaxed">
                      💡 <span className="text-white/80 font-medium">Tip:</span> Forward any flight or hotel confirmation email to your Kepi address and it will appear here automatically.
                    </p>
                  </div>
                </div>

              ) : null}
              {journeyPhase.kind !== "post-trip" ? (
              <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                      {journeyPhase.kind === "airborne" ? "In flight" :
                       journeyPhase.kind === "just-landed" ? "Just landed" :
                       journeyPhase.kind === "pre-trip" ? "Upcoming trip" :
                       "Trip"}
                    </p>
                    <h1 className="mt-1 text-2xl font-bold text-slate-950 dark:text-slate-100">
                      {activeTrip?.name ?? "Your next trip"}
                    </h1>
                    <p className="mt-1 text-base text-slate-600 dark:text-slate-300">
                      {journeyPhase.kind === "airborne"
                        ? `Flying to ${journeyPhase.landingAt} · ${journeyPhase.landingIn} to land`
                        : journeyPhase.kind === "just-landed"
                          ? `Landed ${journeyPhase.landedMinutesAgo < 2 ? "just now" : `${journeyPhase.landedMinutesAgo} min ago`}`
                          : journeyPhase.kind === "pre-trip"
                            ? journeyPhase.daysUntil === 0 ? "Departing today" : `${journeyPhase.daysUntil} day${journeyPhase.daysUntil === 1 ? "" : "s"} until departure`
                            : consumerTripDestination ?? "Destination pending"}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${consumerHeroStatus.className}`}>
                    {journeyPhase.kind === "airborne" ? "In flight" :
                     journeyPhase.kind === "just-landed" ? "Landed" :
                     journeyPhase.kind === "pre-trip" ? "Scheduled" :
                     consumerHeroStatus.label}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{consumerStatus.detail}</p>
              </article>
              ) : null}

              {firstForwardedReviewItem ? (
                <button
                  type="button"
                  onClick={() => openDrawer("review", firstForwardedReviewItem.id)}
                  className="w-full rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-left shadow-sm transition hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/15 dark:hover:bg-amber-500/20"
                >
                  <p className="text-sm font-bold text-amber-900 dark:text-amber-100">
                    ✋ We need your help with a reservation
                  </p>
                  <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-200">
                    {firstForwardedReviewItem.reasons[0] ?? "Tap to review and confirm the details."}
                  </p>
                  <p className="mt-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                    Tap to fill in missing info →
                  </p>
                </button>
              ) : reviewQueue.length > 0 ? (
                <button
                  type="button"
                  onClick={() => navigateToConsumerTab("flights")}
                  className="w-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900 shadow-sm transition hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-100 dark:hover:bg-amber-500/20"
                >
                  {reviewQueue.length} reservation{reviewQueue.length === 1 ? "" : "s"} need{reviewQueue.length === 1 ? "s" : ""} your input — tap to review
                </button>
              ) : null}

              {/* AirportMode: only when pre-trip, not airborne or landed */}
              {(journeyPhase.kind === "pre-trip" || journeyPhase.kind === "no-trip") && (
                <AirportMode
                  reservations={consumerReservationsSorted}
                  onViewReservations={() => navigateToConsumerTab("flights")}
                />
              )}

              {/* ArrivalMode: only when just-landed or close to landing */}
              {(journeyPhase.kind === "just-landed" || journeyPhase.kind === "airborne") && (
                <ArrivalMode
                  reservations={consumerReservationsSorted}
                  onViewReservations={() => navigateToConsumerTab("flights")}
                />
              )}

              {upcomingHotelNeedingDates && !tripDatesPromptDismissed ? (
                <NewTripDatesCard
                  hotelName={upcomingHotelNeedingDates.provider || upcomingHotelNeedingDates.title || "Hotel stay"}
                  suggestedCheckIn={upcomingHotelNeedingDates.localTime.trim().slice(0, 10)}
                  suggestedCheckOut={
                    upcomingHotelNeedingDates.checkOutDate?.trim().slice(0, 10) ||
                    upcomingHotelNeedingDates.localTime.trim().slice(0, 10)
                  }
                  startDate={tripDatesDraft.start}
                  endDate={tripDatesDraft.end}
                  onStartDateChange={(value) => setTripDatesDraft((current) => ({ ...current, start: value }))}
                  onEndDateChange={(value) => setTripDatesDraft((current) => ({ ...current, end: value }))}
                  onSave={saveTripDateRange}
                  onDismiss={() => setTripDatesPromptDismissed(true)}
                />
              ) : null}

              {tripHasUpcomingEvents ? (
              <TripTimeline
                reservations={consumerReservationsSorted}
                tripName={activeTrip?.name ?? "Your trip"}
                tripStartDate={consumerTripStartDate}
                tripEndDate={consumerTripEndDate}
                tripDaysAway={tripDaysAway}
                onReservationTap={(id) => openDrawer("reservation", id)}
                suppressMidTripBanner={journeyPhase.kind === "post-trip"}
              />
              ) : journeyPhase.kind === "post-trip" ? (
                <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
                  <p className="font-semibold text-slate-800 dark:text-slate-200">Past trip archived</p>
                  <p className="mt-1">
                    Older reservations stay in Flights and Hotels for reference, but Trip mode stays clear until your next booking.
                  </p>
                </section>
              ) : null}

              {consumerReservationsSorted.length === 0 ? (
                <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                  <p className="font-semibold text-slate-900 dark:text-slate-100">No reservations yet</p>
                  <p className="mt-1">Forward any booking confirmation email to {emptyStateForwardAddress}</p>
                  <p className="mt-1">Or tap + to add one manually</p>
                  <button
                    type="button"
                    onClick={() => setManualReservationModalOpen(true)}
                    className="mt-3 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400"
                  >
                    + Add manually
                  </button>
                </section>
              ) : null}

              {showAirportTransportPrompt ? (
                airportTransportChoice ? (
                  <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-100">
                    Airport transport: {AIRPORT_TRANSPORT_LABEL[airportTransportChoice]} ✓
                  </section>
                ) : (
                  <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">How are you getting to the airport?</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {AIRPORT_TRANSPORT_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            void persistAirportTransportChoice(option.value);
                          }}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </section>
                )
              ) : null}

              {hasDetectedHotel && tripHasUpcomingEvents && journeyPhase.kind === "pre-trip" ? (
                hotelArrivalTime ? (
                  <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-100">
                    Hotel arrival: ~{formatHotelArrivalDisplay(hotelArrivalTime)} ✓
                  </section>
                ) : (
                  <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      What time do you expect to arrive at the hotel?
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <input
                        type="time"
                        value={hotelArrivalDraft}
                        onChange={(event) => setHotelArrivalDraft(event.target.value)}
                        className="w-40 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={saveHotelArrivalExpectation}
                        className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-slate-200"
                      >
                        Save
                      </button>
                    </div>
                  </section>
                )
              ) : null}
            </section>
          ) : consumerTab === "flights" ? (
            <section className="space-y-4">
              {!pushSubscribed && canUsePushNotifications && hasUpcomingFlightWithin24h ? (
                <article className="rounded-2xl border border-sky-200 bg-sky-50 p-4 shadow-sm dark:border-sky-500/40 dark:bg-sky-950/40">
                  <h2 className="font-semibold text-sky-950 dark:text-sky-100">Flight within 24 hours</h2>
                  <p className="mt-1 text-sm text-sky-900/90 dark:text-sky-100/90">
                    Turn on push alerts so gate changes and delays reach you even when the app is closed. Kepi checks status every 5 minutes.
                  </p>
                  <button
                    type="button"
                    disabled={pushBusy}
                    onClick={() => { void handleEnablePush(); }}
                    className="mt-3 w-full rounded-xl bg-sky-600 py-2.5 text-sm font-bold text-white hover:bg-sky-500 disabled:opacity-60"
                  >
                    {pushBusy ? "Enabling…" : "🔔 Enable flight alerts"}
                  </button>
                </article>
              ) : null}
              <FlightsTab
                reservations={consumerReservationsSorted.filter(r => r.type === "flight")}
                liveStatus={flightStatusCheckByReservationId}
                locationStatus={guidanceLocationStatus}
                nearestAirport={guidanceNearestAirport}
                onReservationTap={(id) => openDrawer("reservation", id)}
                onCheckStatus={(id) => void handleCheckFlightStatus(id)}
                onDelete={(id) => void handleDeleteReservation(id)}
                onAdd={() => setManualReservationModalOpen(true)}
              />
            </section>
                    ) : consumerTab === "hotels" ? (
            <HotelsTab
              reservations={consumerReservationsSorted.filter(r => r.type === "hotel")}
              onReservationTap={(id) => openDrawer("reservation", id)}
              onCheckStatus={(id) => void handleCheckFlightStatus(id)}
              onDelete={(id) => void handleDeleteReservation(id)}
              onAdd={() => setManualReservationModalOpen(true)}
            />
          ) : (
            <section className="space-y-3">
              {/* Packing + Bags — now in More tab */}
              <div className="rounded-3xl bg-white dark:bg-slate-900 shadow-sm ring-1 ring-black/[0.06] dark:ring-white/[0.08] overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-5 py-4 text-left"
                  onClick={() => document.getElementById("packing-section")?.classList.toggle("hidden")}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">🎒</span>
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">Packing &amp; Bags</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Checklist · weight tracking · critical items</p>
                    </div>
                  </div>
                  <span className="text-slate-400 text-sm">›</span>
                </button>
                <div id="packing-section" className="hidden border-t border-slate-100 dark:border-slate-800 px-4 pb-4">
                  <PackingList
                    mode="consumer"
                    tripId={activeTripId}
                    onCompletionChange={(percent) => setPackingCompletionPercent(percent)}
                  />
                  <BagControl tripId={activeTripId} />
                </div>
              </div>

              {/* Family tracker */}
              <Suspense fallback={<div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 animate-pulse">Loading Family Tracker...</div>}>
                <FamilyPanel
                  isPremium={hasProAccess || isLifetime || isTrial}
                  lastSentAt={lastFamilyLocationSentAt}
                  onUpgrade={() => openUpgradeModal("multi-trip", "Upgrade to Pro to unlock Family Tracker — real-time location sharing for your whole group.")}
                />
              </Suspense>
              {/* Share trip */}
              <ShareTripCard tripName={activeTrip?.name ?? "My Trip"} />
              <section
                id="readiness-checklist-section"
                ref={readinessChecklistSectionRef}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-semibold">Readiness checklist</h2>
                  <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-900 dark:bg-amber-500/20 dark:text-amber-100">
                    {unresolvedReadinessCount} pending
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  {readinessItems.map((item) => (
                    <div
                      key={item.id}
                      role="checkbox"
                      aria-checked={item.complete}
                      tabIndex={0}
                      onClick={() => handleChecklistToggle(item.id)}
                      onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); handleChecklistToggle(item.id); } }}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 ${
                        item.complete
                          ? "border-emerald-500/40 bg-emerald-500/10"
                          : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950/60"
                      }`}
                    >
                      <div className={`mt-1 h-4 w-4 shrink-0 rounded border-2 flex items-center justify-center ${
                        item.complete ? "border-emerald-500 bg-emerald-500" : "border-slate-400"
                      }`}>
                        {item.complete && <span className="text-white text-[10px] font-bold">✓</span>}
                      </div>
                      <span className="flex-1">
                        <span className="block text-sm font-medium">{item.title}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {item.category} {item.required ? "• Required" : "• Optional"}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm dark:border-emerald-500/40 dark:bg-emerald-500/10">
                <h2 className="font-semibold text-emerald-900 dark:text-emerald-100">Forward email address</h2>
                {emailForwardAddress ? (
                  <>
                    <p className="mt-1 text-sm text-emerald-900 dark:text-emerald-100">
                      {emailForwardAddress}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        void handleCopyForwardAddress();
                      }}
                      className="mt-3 w-full rounded-lg bg-emerald-500 px-3 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400"
                    >
                      Copy forward address
                    </button>
                    <p className="mt-2 text-xs text-emerald-900/90 dark:text-emerald-100/90">
                      Forward any flight, hotel, or booking confirmation from any email app to this address.
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-emerald-900 dark:text-emerald-100">Assigning your forwarding address...</p>
                )}
              </article>

              {/* Push notifications */}
              <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-semibold">Flight alerts</h2>
                  {pushSubscribed && (
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">Active</span>
                  )}
                </div>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  Get push alerts for gate changes, delays, and departure reminders — even when the app isn&apos;t open.
                </p>
                {!pushSubscribed ? (
                  <button
                    type="button"
                    onClick={() => { void handleEnablePush(); }}
                    disabled={pushBusy}
                    className="mt-3 w-full rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-500 disabled:opacity-60"
                  >
                    {pushBusy ? "Enabling..." : "🔔 Enable flight alerts"}
                  </button>
                ) : (
                  <p className="mt-3 text-sm font-semibold text-emerald-600 dark:text-emerald-400">🔔 Alerts are on</p>
                )}
                {pushMessage && (
                  <p className={`mt-2 text-xs ${pushMessage.startsWith("✅") ? "text-emerald-700 dark:text-emerald-300" : "text-rose-600 dark:text-rose-400"}`}>
                    {pushMessage}
                  </p>
                )}
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-semibold">Plan status</h2>
                  <span className="rounded-full bg-slate-900 px-2 py-1 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-950">
                    {isLifetime ? "Pro" : isTrial ? `Trial — ${trialDaysRemaining}d` : hasProAccess ? "Pro" : "Free"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  {billingLoading
                    ? "Loading your plan..."
                    : isLifetime
                      ? "You have lifetime Pro access."
                      : isTrial
                        ? `Trial ends ${trialExpiresAt ? new Date(trialExpiresAt).toLocaleDateString() : "soon"}.`
                        : hasProAccess
                          ? "Your Pro plan is active."
                          : "You are on the free plan."}
                </p>
              </article>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">Theme</h2>
                  <ThemeToggle />
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <h2 className="font-semibold">Language</h2>
                <div className="mt-3">
                  <LanguageToggle />
                </div>
              </section>

              <Link
                href="/support"
                className="block rounded-2xl border border-slate-200 bg-white p-4 font-semibold shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
              >
                Support
              </Link>

              {emailForwardSetupMessage ? (
                <p className="text-xs text-emerald-700 dark:text-emerald-300">{emailForwardSetupMessage}</p>
              ) : null}

              {/* Clear cache */}
              <button
                type="button"
                onClick={() => {
                  const doReload = () => {
                    setToast("Cache cleared — reloading...");
                    setTimeout(() => window.location.reload(), 800);
                  };
                  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
                    navigator.serviceWorker.controller.postMessage("CLEAR_ALL_CACHES");
                    navigator.serviceWorker.onmessage = doReload;
                    setTimeout(doReload, 1500); // fallback if no message reply
                  } else {
                    void window.caches?.keys().then(keys => Promise.all(keys.map(k => window.caches.delete(k)))).then(doReload).catch(doReload);
                  }
                }}
                className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                🔄 Clear cache &amp; refresh
                <p className="mt-0.5 text-xs font-normal text-slate-500 dark:text-slate-400">Fixes map issues, outdated screens, or loading problems</p>
              </button>

              <button
                type="button"
                onClick={() => {
                  void clerk.signOut();
                }}
                className="w-full rounded-2xl border border-red-200 bg-white p-4 text-left font-semibold text-red-600 shadow-sm dark:border-red-500/30 dark:bg-slate-900 dark:text-red-300"
              >
                Sign out
              </button>
            </section>
          )}
        </div>

        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-default)] bg-[var(--bg-card)]/95 px-3 py-2 shadow-2xl backdrop-blur md:hidden">
          <div className="mx-auto grid max-w-md grid-cols-6 gap-0.5 text-[11px] font-semibold">
            {CONSUMER_TABS.map(({ id: tab, label, icon }) => (
              <button
                key={tab}
                type="button"
                onClick={() => tab === "map" ? router.push("/travel-assistant/live-map") : navigateToConsumerTab(tab)}
                className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition-all ${
                  consumerTab === tab
                    ? "text-[#007AFF] dark:text-[#0A84FF]"
                    : "text-slate-400 dark:text-slate-500"
                }`}
              >
                <span className="text-[15px] leading-none">{icon}</span>
                <span className="text-[10px] font-semibold tracking-tight">{label}</span>
                {consumerTab === tab && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 h-[2.5px] w-8 rounded-full bg-[#007AFF] dark:bg-[#0A84FF]" />
                )}
              </button>
            ))}
          </div>
        </nav>
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {toast ?? ""}
        </div>
        {activeDrawerPanel}
        {deleteConfirmationDialog}
        {toast ? (
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="fixed bottom-20 right-4 z-50 max-w-sm rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            {toast}
          </div>
        ) : null}
        <UpgradeModal
          open={Boolean(upgradeModalGate)}
          gate={upgradeModalGate}
          currentPlan={billingStatusPlan}
          onClose={closeUpgradeModal}
        />
        {travelDayOpen && reservations.length > 0 && (
          <TravelDayView
            flights={reservations
              .filter(r => r.type === "flight")
              .sort((a, b) => {
                const aMs = Date.parse(a.localTime ?? "");
                const bMs = Date.parse(b.localTime ?? "");
                return aMs - bMs;
              })
              .map(r => ({
                id: r.id,
                flightNumber: r.flightNumber,
                flightAirline: r.flightAirline,
                flightDepartureAirport: r.flightDepartureAirport,
                flightArrivalAirport: r.flightArrivalAirport,
                localTime: r.localTime,
                timezone: r.timezone,
                flightArrivalTime: r.flightArrivalTime,
                confirmationCode: r.confirmationCode,
                provider: r.provider,
              }))}
            departureDate={activeTrip?.startDate ?? new Date().toISOString().slice(0, 10)}
            tripName={activeTrip?.name ?? "My Trip"}
            transport={airportTransportChoice}
            onTransportChange={(t) => {
              setAirportTransportChoice(t);
              queueMutation("Airport transport updated.");
            }}
            onClose={() => setTravelDayOpen(false)}
          />
        )}
        {shareModalOpen && (
          <ShareModal
            open={shareModalOpen}
            tripId={activeTripId}
            tripName={activeTrip?.name ?? null}
            onClose={() => setShareModalOpen(false)}
          />
        )}
        {manualReservationModalOpen ? (
          <ManualReservationEntryModal
            familyMembers={familyMembers.map((member) => ({ id: member.id, name: member.name }))}
            defaultAssignedTo={[selectedFamilyMember.id]}
            onClose={() => setManualReservationModalOpen(false)}
            onSave={handleSaveManualReservation}
          />
        ) : null}
        <GmailImportScopeModal
          key={gmailScopeModalKey}
          open={gmailScopeModalOpen}
          isSubmitting={gmailImportBusy}
          onCancel={() => {
            if (gmailImportBusy) return;
            setGmailScopeModalOpen(false);
          }}
          onConfirm={(scope) => {
            void handleImportFromGmailWithScope(scope).finally(() => {
              setGmailScopeModalOpen(false);
            });
          }}
        />
        <InstallPrompt />
        <OnboardingFlow onCreateFirstTrip={handleCreateOnboardingTrip} />
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[var(--bg-base)] text-[var(--text-primary)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(56,189,248,0.14),transparent_45%),radial-gradient(circle_at_85%_25%,rgba(129,140,248,0.18),transparent_42%),radial-gradient(circle_at_50%_100%,rgba(34,197,94,0.08),transparent_45%)]" />
      <div className="relative z-10 mx-auto max-w-[1400px] space-y-5 px-3 py-5 sm:space-y-6 sm:px-4 sm:py-6 md:px-6">
        <header className="space-y-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <TripSwitcher
              trips={trips.map((trip) => ({
                id: trip.id,
                name: trip.name,
                destination: trip.destination,
                startDate: trip.startDate,
                endDate: trip.endDate,
              }))}
              activeTripId={activeTripId}
              onSwitchTrip={handleSwitchTrip}
              onCreateTrip={handleCreateTrip}
              disabled={tripsLoading}
              canCreateTrip={canCreateAdditionalTrips}
              createDisabledMessage="Free plan supports one trip."
              onRequestUpgrade={() =>
                openUpgradeModal("multi-trip", "Upgrade to Pro to create and switch between multiple trips.")
              }
            />
            <button
              type="button"
              onClick={() => setShowSearchBar((value) => !value)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-900/70 text-cyan-200 transition hover:border-cyan-400 hover:text-cyan-100"
              aria-label={showSearchBar ? "Hide search bar" : "Show search bar"}
              title={showSearchBar ? "Hide search bar" : "Show search bar"}
            >
              <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </button>
            {showSearchBar ? (
              <TripSearch
                trips={trips.map((trip) => ({
                  id: trip.id,
                  name: trip.name,
                  destination: trip.destination,
                  startDate: trip.startDate,
                  endDate: trip.endDate,
                  reservations: trip.reservations.map((reservation) => ({
                    id: reservation.id,
                    type: reservation.type,
                    title: reservation.title,
                    confirmationCode: reservation.confirmationCode,
                    localTime: reservation.localTime,
                  })),
                }))}
                onSelectResult={handleTripSearchSelection}
                disabled={tripsLoading}
              />
            ) : null}
          </div>
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
            toggleDisruption={toggleDisruption}
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
        <nav className="hidden rounded-2xl border border-slate-700 bg-slate-900/70 p-1 shadow-sm md:flex md:w-fit" aria-label="Desktop planning tabs">
          {([
            ["plan", "🧭 Plan"],
            ["trip", "Overview"],
          ] as const).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              onClick={() => navigateToConsumerTab(tab)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                consumerTab === tab
                  ? "bg-cyan-500 text-slate-950"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
        {consumerTab === "plan" ? (
          <PlannerTab
            tripName={activeTrip?.name ?? null}
            destination={consumerTripDestination}
            startDate={consumerTripStartDate}
            endDate={consumerTripEndDate}
            flightCount={plannerFlightCount}
            hotelCount={plannerHotelCount}
            otherBookingCount={plannerOtherBookingCount}
            readyStepCount={plannerReadyStepCount}
            forwardAddress={emptyStateForwardAddress}
            canUseGmailImport={canUseGmailImport}
            gmailImportBusy={gmailImportBusy}
            onAddBooking={() => setManualReservationModalOpen(true)}
            onCreateTrip={() => {
              void handleCreateTrip();
            }}
            onImportGmail={() => setGmailScopeModalOpen(true)}
            onRequestGmailUpgrade={() =>
              openUpgradeModal("gmail-import", "Upgrade to Pro to import reservations from your connected email account.")
            }
            onCopyForwardAddress={() => {
              void handleCopyForwardAddress();
            }}
            onViewTrip={() => setConsumerTab("trip")}
            onViewFlights={() => {
              setTimelineSectionTab("reservations");
              setConsumerTab("trip");
              setToast("Flights are in the reservations timeline below.");
            }}
            onViewHotels={() => {
              setTimelineSectionTab("reservations");
              setConsumerTab("trip");
              setToast("Hotels are in the reservations timeline below.");
            }}
          />
        ) : (
          <>
        <TripOrientationCard
          travelerName={viewerDisplayName}
          destination={activeTrip?.destination ?? "your trip"}
          tripDaysAway={tripDaysAway}
          statusTitle={consumerStatus.title}
          statusDetail={consumerStatus.detail}
          nextActionLabel={consumerPrimaryAction?.label ?? nextStageAction}
          actionTargetTab={consumerPrimaryAction?.targetTab}
          onSwitchTab={(tab) => {
            if (isConsumerTab(tab)) {
              navigateToConsumerTab(tab);
              return;
            }
            if (tab === "reservations") {
              navigateToConsumerTab("flights");
              return;
            }
            navigateToConsumerTab("more");
          }}
          onNextAction={consumerPrimaryAction?.onClick ?? advanceTripStage}
          statusToneClassName={consumerStatus.tone}
        />
        {shouldRenderMobilePanel("essentials") ? (
          <section className="grid gap-4 sm:gap-6 xl:grid-cols-2">
            <WeatherCard destination={activeTrip?.destination ?? "Set destination"} />
            {tripStage === "readiness" ? (
              <LocalIntelligencePanel
                destination={activeTrip?.destination ?? "Set destination"}
                startDate={activeTrip?.startDate}
                endDate={activeTrip?.endDate}
              />
            ) : (
              <article className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
                <h2 className="text-sm font-semibold text-slate-100">Local intelligence</h2>
                <p className="mt-2 text-xs text-slate-400">
                  Local destination tips are emphasized in readiness mode so your plan is set before departure.
                </p>
              </article>
            )}
          </section>
        ) : null}
        {shouldRenderMobilePanel("essentials") ? (
          <AISuggestionPanel
            tripStage={tripStage}
            activeScenario={activeScenario}
            reservations={reservations}
            updateFeed={updateFeed}
            canUseSuggestions={canUseAiSuggestions}
            onRequestUpgrade={() =>
              openUpgradeModal("ai-suggestions", "Upgrade to Pro to unlock stage-aware AI itinerary guidance.")
            }
          />
        ) : null}
        {shouldRenderMobilePanel("essentials") ? (
          <ConciergePanel
            tripId={activeTripId}
            tripName={activeTrip?.name ?? "Current trip"}
            destination={activeTrip?.destination ?? ""}
            billingPlan={billingBasePlan}
            showUpsellWhenUnavailable={!hasProAccess}
            reservations={reservations}
            onRequestUpgrade={() =>
              openUpgradeModal(
                "concierge-monitoring",
                "Upgrade to Concierge for proactive 5-minute monitoring and VIP recovery support.",
              )
            }
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
            canUsePushNotifications={canUsePushNotifications}
            onRequestUpgradeForPush={() =>
              openUpgradeModal("push-notifications", "Upgrade to Pro to enable gate and delay push alerts.")
            }
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
          <section className="space-y-4">
            <article className="rounded-2xl border border-slate-700 bg-slate-900/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-100">Trip execution workspace</p>
                  <p className="text-xs text-slate-400">
                    Switch between reservation operations, document vault, and smart packing.
                  </p>
                </div>
                <div className="inline-flex rounded-full border border-slate-700 bg-slate-950/60 p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setTimelineSectionTab("reservations")}
                    className={`rounded-full px-3 py-1.5 font-semibold transition ${
                      timelineSectionTab === "reservations"
                        ? "bg-cyan-500 text-slate-950"
                        : "text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    Reservations
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimelineSectionTab("documents")}
                    className={`rounded-full px-3 py-1.5 font-semibold transition ${
                      timelineSectionTab === "documents"
                        ? "bg-cyan-500 text-slate-950"
                        : "text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    Documents
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimelineSectionTab("packing")}
                    className={`rounded-full px-3 py-1.5 font-semibold transition ${
                      timelineSectionTab === "packing"
                        ? "bg-cyan-500 text-slate-950"
                        : "text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    Packing
                  </button>
                </div>
              </div>
            </article>

            {timelineSectionTab === "reservations" ? (
              <section className="grid gap-4 sm:gap-6 xl:grid-cols-[1.2fr_1fr]">
                <article className="space-y-4">
                  <TripTimeline
                    reservations={visibleReservations}
                    tripName={activeTrip?.name ?? "Your trip"}
                    tripStartDate={consumerTripStartDate}
                    tripEndDate={consumerTripEndDate}
                    tripDaysAway={tripDaysAway}
                    onReservationTap={(id) => openDrawer("reservation", id)}
                    suppressMidTripBanner={journeyPhase.kind === "post-trip"}
                  />
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
                    highlightedReservationId={highlightedReservationId}
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
                    onDeleteReservation={handleDeleteReservation}
                    onCheckFlightStatus={(reservationId) => {
                      void handleCheckFlightStatus(reservationId);
                    }}
                    flightStatusCheckByReservationId={flightStatusCheckMapByReservationId}
                  />
                </article>

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
                          {selectedEmail.parsed.localTime} ({formatTimezoneForDisplay(selectedEmail.parsed.timezone)})
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
                    onConfirmIncompleteReview={handleConfirmIncompleteReview}
                    onImportParsedReservations={handleImportParsedReservations}
                    canUseGmailImport={canUseGmailImport}
                    onRequestUpgradeForGmailImport={() =>
                      openUpgradeModal("gmail-import", "Upgrade to Pro to import reservations from your connected email account.")
                    }
                  />
                </article>
              </section>
            ) : timelineSectionTab === "documents" ? (
              <DocumentVault activeTripId={activeTripId} />
            ) : (
              <PackingList
                tripId={activeTripId}
                onCompletionChange={(percent) => setPackingCompletionPercent(percent)}
              />
            )}
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

          {/* FamilyPanel now lives in the More tab with real location sharing */}
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

          </>
        )}
      </div>

      {activeDrawerPanel}

      <footer className="relative z-10 mx-auto mt-2 max-w-[1400px] px-3 pb-6 text-xs text-slate-300 sm:px-4 md:px-6">
        Accessibility mode enabled: keyboard navigation, live status announcements, and screen-reader labels are active.
      </footer>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {toast ?? ""}
      </div>
      {deleteConfirmationDialog}

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
      <UpgradeModal
        open={Boolean(upgradeModalGate)}
        gate={upgradeModalGate}
        currentPlan={billingStatusPlan}
        onClose={closeUpgradeModal}
      />
      <GmailImportScopeModal
        key={gmailScopeModalKey}
        open={gmailScopeModalOpen}
        isSubmitting={gmailImportBusy}
        onCancel={() => {
          if (gmailImportBusy) return;
          setGmailScopeModalOpen(false);
        }}
        onConfirm={(scope) => {
          void handleImportFromGmailWithScope(scope).finally(() => {
            setGmailScopeModalOpen(false);
          });
        }}
      />
      {manualReservationModalOpen ? (
        <ManualReservationEntryModal
          familyMembers={familyMembers.map((member) => ({ id: member.id, name: member.name }))}
          defaultAssignedTo={[selectedFamilyMember.id]}
          onClose={() => setManualReservationModalOpen(false)}
          onSave={handleSaveManualReservation}
        />
      ) : null}
      <InstallPrompt />
      <OnboardingFlow onCreateFirstTrip={handleCreateOnboardingTrip} />
    </main>
  );
}
