"use client";

import { useEffect, useMemo, useState } from "react";

type TripStage = "readiness" | "pre-departure" | "airport" | "arrival" | "recovery";
type TripStatus = "green" | "yellow" | "red";
type NetworkMode = "wifi" | "cellular" | "offline";
type ReservationType = "flight" | "hotel" | "train" | "ride" | "dinner";
type Confidence = "high" | "medium" | "low";
type VisibilityMode = "all-members" | "organizer-only";

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

function buildWordHtml(rows: ExportRow[], generatedAt: string): string {
  const tableRows = rows
    .map(
      (row) =>
        `<tr><td>${row.owner}</td><td>${row.itemType}</td><td>${row.title}</td><td>${row.provider}</td><td>${row.localTime}</td><td>${row.timezone}</td><td>${row.location}</td><td>${row.confirmation}</td><td>${row.notes}</td></tr>`,
    )
    .join("");
  return [
    "<html><head><meta charset='utf-8'><title>Travel Itinerary</title></head><body>",
    "<h1>Adaptive Travel Assistant - Static Itinerary</h1>",
    `<p>Generated at: ${generatedAt}</p>`,
    "<p>This is a static copy. Always confirm live itinerary for last-minute updates.</p>",
    "<table border='1' cellspacing='0' cellpadding='6'>",
    "<tr><th>Owner</th><th>Type</th><th>Title</th><th>Provider</th><th>Local Time</th><th>Timezone</th><th>Location</th><th>Confirmation</th><th>Notes</th></tr>",
    tableRows,
    "</table></body></html>",
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

export default function TravelAssistantPage() {
  const [tripStage, setTripStage] = useState<TripStage>("readiness");
  const [tripStatus, setTripStatus] = useState<TripStatus>("yellow");
  const [networkMode, setNetworkMode] = useState<NetworkMode>("wifi");
  const [wifiOnlySync, setWifiOnlySync] = useState(false);
  const [allowCellularLocationUpdates, setAllowCellularLocationUpdates] = useState(true);
  const [showFamilyMap, setShowFamilyMap] = useState(true);
  const [selectedFamilyMemberId, setSelectedFamilyMemberId] = useState("alex");
  const [personalTimelineOnly, setPersonalTimelineOnly] = useState(false);
  const [minutesToDeparture, setMinutesToDeparture] = useState(165);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(new Date().toISOString());
  const [toast, setToast] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>(INITIAL_FAMILY);
  const [reservations, setReservations] = useState<Reservation[]>(INITIAL_RESERVATIONS);
  const [reviewQueue, setReviewQueue] = useState<ReviewItem[]>(INITIAL_REVIEW_QUEUE);
  const [readinessItems, setReadinessItems] = useState<ReadinessItem[]>(INITIAL_CHECKLIST);

  const [selectedEmailId, setSelectedEmailId] = useState(EMAIL_SAMPLES[0]?.id ?? "");
  const [activeDrawer, setActiveDrawer] = useState<DrawerState | null>(null);
  const [drawerDraft, setDrawerDraft] = useState<ReservationDraft>(EMPTY_DRAFT);
  const [mergeTargetByReview, setMergeTargetByReview] = useState<Record<string, string>>({});
  const [exportScope, setExportScope] = useState<"full-trip" | "selected-person">("full-trip");
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");

  const selectedFamilyMember = useMemo(
    () => familyMembers.find((member) => member.id === selectedFamilyMemberId) ?? familyMembers[0],
    [familyMembers, selectedFamilyMemberId],
  );

  const selectedEmail = useMemo(
    () => EMAIL_SAMPLES.find((sample) => sample.id === selectedEmailId) ?? EMAIL_SAMPLES[0],
    [selectedEmailId],
  );

  const canSyncItineraryNow = networkMode === "wifi" || (!wifiOnlySync && networkMode === "cellular");
  const canSendLocationNow =
    networkMode === "wifi" || (networkMode === "cellular" && allowCellularLocationUpdates);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
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

  const queueMutation = (message: string): void => {
    if (canSyncItineraryNow) {
      setLastSyncAt(new Date().toISOString());
      setToast(`${message} Synced.`);
      return;
    }
    setPendingSyncCount((count) => count + 1);
    setToast(`${message} Queued until sync is allowed.`);
  };

  const flushPendingSync = (): void => {
    if (networkMode === "offline") {
      setToast("Still offline. Pending updates remain queued.");
      return;
    }
    setPendingSyncCount(0);
    setLastSyncAt(new Date().toISOString());
    setToast("Manual sync completed.");
  };

  const evaluateStatus = (): void => {
    if (minutesToDeparture <= 75 || unresolvedReviewCount >= 2 || unresolvedReadinessCount >= 2) {
      setTripStatus("red");
      return;
    }
    if (minutesToDeparture <= 160 || unresolvedReadinessCount > 0) {
      setTripStatus("yellow");
      return;
    }
    setTripStatus("green");
  };

  const handleImportAction = (target: "live" | "review"): void => {
    if (!selectedEmail) return;
    if (target === "live") {
      const reservation: Reservation = {
        id: nextId("res"),
        ...selectedEmail.parsed,
        source: "imported",
      };
      setReservations((prev) => [reservation, ...prev]);
      queueMutation("Imported reservation to live trip.");
      return;
    }
    const queueItem: ReviewItem = {
      id: nextId("review"),
      reasons:
        selectedEmail.issues.length > 0 ? selectedEmail.issues : ["Manual review requested before activation"],
      impact: "Needs confirmation before becoming active itinerary item.",
      sourceEmailSubject: selectedEmail.subject,
      draft: selectedEmail.parsed,
    };
    setReviewQueue((prev) => [queueItem, ...prev]);
    queueMutation("Import sent to review queue.");
  };

  const openDrawer = (kind: "reservation" | "review", id: string): void => {
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
  };

  const closeDrawer = (): void => {
    setActiveDrawer(null);
  };

  const saveDrawer = (): void => {
    if (!activeDrawer) return;
    if (activeDrawer.kind === "reservation") {
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
      queueMutation("Reservation updated.");
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
    const newReservation: Reservation = {
      ...target.draft,
      id: nextId("res"),
      source: "review-accepted",
    };
    setReservations((prev) => [newReservation, ...prev]);
    setReviewQueue((prev) => prev.filter((item) => item.id !== reviewId));
    queueMutation("Review item accepted into live trip.");
  };

  const handleRejectReview = (reviewId: string): void => {
    setReviewQueue((prev) => prev.filter((item) => item.id !== reviewId));
    queueMutation("Review item archived.");
  };

  const handleReparseReview = (reviewId: string): void => {
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
    queueMutation("Review item merged into existing reservation.");
  };

  const handleChecklistToggle = (id: string): void => {
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
    const html = buildWordHtml(exportRows, new Date().toLocaleString());
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
    const generatedAt = new Date().toLocaleString();
    const rowHtml = exportRows
      .map(
        (row) =>
          `<tr><td>${row.owner}</td><td>${row.itemType}</td><td>${row.title}</td><td>${row.provider}</td><td>${row.localTime}</td><td>${row.timezone}</td><td>${row.location}</td><td>${row.confirmation}</td></tr>`,
      )
      .join("");
    printWindow.document.write(`
      <html>
        <head>
          <title>Static Itinerary PDF</title>
          <style>
            body { font-family: Inter, system-ui, sans-serif; color: #111827; padding: 24px; }
            h1 { margin: 0 0 12px; }
            p { margin: 0 0 10px; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; font-size: 12px; }
            th { background: #f1f5f9; }
          </style>
        </head>
        <body>
          <h1>Adaptive Travel Assistant - Static Itinerary</h1>
          <p>Generated at: ${generatedAt}</p>
          <p>Static copy: verify live itinerary for last-minute updates.</p>
          <table>
            <tr><th>Owner</th><th>Type</th><th>Title</th><th>Provider</th><th>Local Time</th><th>Timezone</th><th>Location</th><th>Confirmation</th></tr>
            ${rowHtml}
          </table>
        </body>
      </html>
    `);
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

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 md:px-6">
        <section className="overflow-hidden rounded-3xl border border-slate-700/70 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 shadow-2xl shadow-indigo-950/30">
          <div className="grid gap-6 p-6 lg:grid-cols-[1.8fr_1fr]">
            <div className="space-y-4">
              <p className="text-xs uppercase tracking-[0.24em] text-cyan-300">Adaptive Travel Assistant</p>
              <h1 className="text-3xl font-semibold leading-tight md:text-4xl">
                Premium trip execution for families, with anti-miss safeguards.
              </h1>
              <p className="max-w-3xl text-sm text-slate-300">
                Stage-adaptive controls, confidence-aware imports, recovery playbooks, static exports, and
                consent-based family location sharing.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-sm font-medium ring-1 ${STATUS_BADGE[tripStatus]}`}>
                  {STATUS_LABEL[tripStatus]} ({tripStatus.toUpperCase()})
                </span>
                <span className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-300 ring-1 ring-slate-700">
                  Stage: {STAGE_LABEL[tripStage]}
                </span>
                <span className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-300 ring-1 ring-slate-700">
                  Leave-by buffer: {leaveByMinutes} min
                </span>
                <span className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-300 ring-1 ring-slate-700">
                  Review queue: {reviewQueue.length}
                </span>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
              <p className="text-sm font-semibold text-slate-100">Trip-state editor (live)</p>
              <p className="mt-1 text-xs text-slate-400">Controls update status and screens in real time.</p>
              <div className="mt-3 space-y-3 text-sm">
                <label className="block">
                  <span className="mb-1 block text-slate-300">Trip stage</span>
                  <select
                    value={tripStage}
                    onChange={(event) => setTripStage(event.target.value as TripStage)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
                  >
                    {STAGES.map((stage) => (
                      <option key={stage} value={stage}>
                        {STAGE_LABEL[stage]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-slate-300">Trip status</span>
                  <select
                    value={tripStatus}
                    onChange={(event) => setTripStatus(event.target.value as TripStatus)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
                  >
                    {(["green", "yellow", "red"] as TripStatus[]).map((status) => (
                      <option key={status} value={status}>
                        {STATUS_LABEL[status]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-slate-300">Minutes to departure-critical event</span>
                  <input
                    type="range"
                    min={20}
                    max={360}
                    value={minutesToDeparture}
                    onChange={(event) => setMinutesToDeparture(Number(event.target.value))}
                    className="w-full"
                  />
                  <div className="mt-1 text-xs text-slate-400">{minutesToDeparture} minutes</div>
                </label>
                <button
                  type="button"
                  onClick={evaluateStatus}
                  className="w-full rounded-lg bg-cyan-500/90 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-cyan-400"
                >
                  Auto-evaluate status from risk
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr_1fr]">
          <article className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
            <h2 className="text-lg font-semibold">Adaptive stage actions</h2>
            <p className="text-xs text-slate-400">
              Primary buttons and guidance shift with stage and urgency level.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {STAGES.map((stage) => (
                <button
                  key={stage}
                  type="button"
                  onClick={() => setTripStage(stage)}
                  className={`rounded-full px-3 py-1.5 text-sm ring-1 transition ${
                    stage === tripStage
                      ? "bg-cyan-500 text-slate-950 ring-cyan-300"
                      : "bg-slate-800 text-slate-200 ring-slate-700 hover:bg-slate-700"
                  }`}
                >
                  {STAGE_LABEL[stage]}
                </button>
              ))}
            </div>
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

          <article className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
            <h2 className="text-lg font-semibold">Sync & connectivity policy</h2>
            <p className="text-xs text-slate-400">
              Set Wi-Fi-only itinerary updates while optionally keeping location updates on cellular.
            </p>
            <div className="mt-3 space-y-3 text-sm">
              <label className="block">
                <span className="mb-1 block text-slate-300">Current network</span>
                <select
                  value={networkMode}
                  onChange={(event) => setNetworkMode(event.target.value as NetworkMode)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
                >
                  <option value="wifi">Wi-Fi</option>
                  <option value="cellular">Cellular</option>
                  <option value="offline">Offline</option>
                </select>
              </label>
              <label className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900 px-3 py-2">
                <span>Update itinerary only on Wi-Fi</span>
                <input
                  type="checkbox"
                  checked={wifiOnlySync}
                  onChange={(event) => setWifiOnlySync(event.target.checked)}
                />
              </label>
              <label className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900 px-3 py-2">
                <span>Allow location updates on cellular</span>
                <input
                  type="checkbox"
                  checked={allowCellularLocationUpdates}
                  onChange={(event) => setAllowCellularLocationUpdates(event.target.checked)}
                />
              </label>
              <div className="rounded-lg border border-slate-700 bg-slate-950/70 p-3">
                <p className="text-xs text-slate-300">{locationStatusMessage}</p>
                <p className="mt-1 text-xs text-slate-400">Last sync: {formatClock(lastSyncAt)}</p>
                <p className="text-xs text-slate-400">Pending updates: {pendingSyncCount}</p>
              </div>
              <button
                type="button"
                onClick={flushPendingSync}
                className="w-full rounded-lg bg-indigo-500/90 px-3 py-2 font-semibold hover:bg-indigo-400"
              >
                Sync now once
              </button>
            </div>
          </article>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
          <article className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">Reservation cards</h2>
                <p className="text-xs text-slate-400">
                  Structured reservations with detail drawers, assignment controls, and operational quick actions.
                </p>
              </div>
              <label className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs">
                <input
                  type="checkbox"
                  checked={personalTimelineOnly}
                  onChange={(event) => setPersonalTimelineOnly(event.target.checked)}
                />
                Personal schedule only ({selectedFamilyMember.name})
              </label>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {visibleReservations.map((reservation) => (
                <div key={reservation.id} className="rounded-xl border border-slate-700 bg-slate-950/70 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-400">
                        {RESERVATION_TYPE_LABEL[reservation.type]} • {reservation.provider}
                      </p>
                      <p className="text-sm font-semibold">{reservation.title}</p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        reservation.confidence === "high"
                          ? "bg-emerald-500/20 text-emerald-200"
                          : reservation.confidence === "medium"
                            ? "bg-amber-500/20 text-amber-200"
                            : "bg-red-500/20 text-red-200"
                      }`}
                    >
                      {reservation.confidence}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-300">
                    {reservation.localTime} ({reservation.timezone})
                  </p>
                  <p className="text-xs text-slate-400">{reservation.location}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Assigned:{" "}
                    {reservation.assignedTo
                      .map((memberId) => familyMembers.find((member) => member.id === memberId)?.name ?? memberId)
                      .join(", ")}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => openDrawer("reservation", reservation.id)}
                      className="rounded-md bg-slate-800 px-2 py-1 ring-1 ring-slate-700 hover:bg-slate-700"
                    >
                      Details
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        copyScript(
                          `Call ${reservation.provider} and confirm ${reservation.title}. Confirmation code: ${reservation.confirmationCode}.`,
                        )
                      }
                      className="rounded-md bg-slate-800 px-2 py-1 ring-1 ring-slate-700 hover:bg-slate-700"
                    >
                      Copy call script
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(reservation.confirmationCode);
                          setToast("Confirmation code copied.");
                        } catch {
                          setToast("Clipboard unavailable.");
                        }
                      }}
                      className="rounded-md bg-slate-800 px-2 py-1 ring-1 ring-slate-700 hover:bg-slate-700"
                    >
                      Copy code
                    </button>
                  </div>
                </div>
              ))}
            </div>
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
                  {EMAIL_SAMPLES.map((sample) => (
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

            <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
              <h2 className="text-lg font-semibold">Intake review queue</h2>
              <p className="text-xs text-slate-400">
                Handle uncertain imports before they affect the active itinerary.
              </p>
              <div className="mt-3 space-y-3">
                {reviewQueue.map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                    <p className="text-sm font-semibold">{item.draft.title}</p>
                    <p className="text-xs text-slate-400">Source: {item.sourceEmailSubject}</p>
                    <p className="mt-1 text-xs text-red-200">Impact: {item.impact}</p>
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-amber-200">
                      {item.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => handleAcceptReview(item.id)}
                        className="rounded-md bg-emerald-500/90 px-2 py-1 font-semibold text-slate-950 hover:bg-emerald-400"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => openDrawer("review", item.id)}
                        className="rounded-md bg-slate-800 px-2 py-1 ring-1 ring-slate-700 hover:bg-slate-700"
                      >
                        Edit + accept
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRejectReview(item.id)}
                        className="rounded-md bg-slate-800 px-2 py-1 ring-1 ring-slate-700 hover:bg-slate-700"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReparseReview(item.id)}
                        className="rounded-md bg-slate-800 px-2 py-1 ring-1 ring-slate-700 hover:bg-slate-700"
                      >
                        Re-parse
                      </button>
                    </div>
                    <div className="mt-2 flex gap-2 text-xs">
                      <select
                        value={mergeTargetByReview[item.id] ?? ""}
                        onChange={(event) =>
                          setMergeTargetByReview((prev) => ({ ...prev, [item.id]: event.target.value }))
                        }
                        className="flex-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1"
                      >
                        <option value="">Select merge target</option>
                        {reservations.map((reservation) => (
                          <option key={reservation.id} value={reservation.id}>
                            {reservation.title}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => handleMergeReview(item.id)}
                        className="rounded-md bg-indigo-500/90 px-2 py-1 font-semibold hover:bg-indigo-400"
                      >
                        Merge duplicate
                      </button>
                    </div>
                  </div>
                ))}
                {reviewQueue.length === 0 ? (
                  <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                    Review queue clear. No unresolved import ambiguity.
                  </p>
                ) : null}
              </div>
            </div>
          </article>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
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

          <article className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">Family sharing and optional location map</h2>
                <p className="text-xs text-slate-400">
                  Consent-based location sharing with identity context and per-person timeline controls.
                </p>
              </div>
              <label className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs">
                <input
                  type="checkbox"
                  checked={showFamilyMap}
                  onChange={(event) => setShowFamilyMap(event.target.checked)}
                />
                Show family map
              </label>
            </div>

            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-slate-300">Who am I right now?</span>
              <select
                value={selectedFamilyMember.id}
                onChange={(event) => setSelectedFamilyMemberId(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
              >
                {familyMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} ({member.role})
                  </option>
                ))}
              </select>
            </label>

            <div className="mt-3 grid gap-2">
              {familyMembers.map((member) => {
                const isVisibleToViewer = canViewerSeeMember(selectedFamilyMember, member);
                const updatedMs = Date.parse(member.location.updatedAt);
                const stale = nowMs - updatedMs > 5 * 60_000 || !canSendLocationNow;
                return (
                  <div key={member.id} className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: member.color }}
                        />
                        <span className="font-medium">{member.name}</span>
                        <span className="text-xs text-slate-400">({member.role})</span>
                      </div>
                      <span className="text-xs text-slate-400">
                        {isVisibleToViewer ? (stale ? "Stale" : "Live") : "Hidden"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">Last update: {formatClock(member.location.updatedAt)}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => toggleMemberSharing(member.id)}
                        className="rounded-md bg-slate-800 px-2 py-1 ring-1 ring-slate-700 hover:bg-slate-700"
                      >
                        Sharing: {member.sharingEnabled ? "On" : "Off"}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleMemberVisibility(member.id)}
                        className="rounded-md bg-slate-800 px-2 py-1 ring-1 ring-slate-700 hover:bg-slate-700"
                      >
                        Visible to: {member.visibility === "all-members" ? "All" : "Organizer only"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {showFamilyMap ? (
              <div className="relative mt-4 h-64 overflow-hidden rounded-xl border border-slate-700 bg-gradient-to-br from-slate-950 via-indigo-950/40 to-slate-950">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(56,189,248,0.08),transparent_55%)]" />
                {visibleFamilyMarkers.map(({ member, x, y }) => {
                  const stale = nowMs - Date.parse(member.location.updatedAt) > 5 * 60_000 || !canSendLocationNow;
                  return (
                    <div
                      key={member.id}
                      className="absolute -translate-x-1/2 -translate-y-1/2 text-center"
                      style={{ left: `${x}%`, top: `${y}%` }}
                    >
                      <span
                        className={`mx-auto block h-4 w-4 rounded-full ring-2 ring-slate-900 ${
                          stale ? "opacity-55" : ""
                        }`}
                        style={{ backgroundColor: member.color }}
                      />
                      <span className="mt-1 block rounded bg-slate-900/80 px-1.5 py-0.5 text-[11px] text-slate-100">
                        {member.name}
                      </span>
                    </div>
                  );
                })}
                {visibleFamilyMarkers.length === 0 ? (
                  <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
                    No visible shared locations yet.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-4 rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-xs text-slate-400">
                Family map is optional and currently hidden.
              </p>
            )}
          </article>
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
          <h2 className="text-lg font-semibold">Missed-flight / disruption recovery panel</h2>
          <p className="text-xs text-slate-400">
            Who to call, what to say, and decision path guidance by urgency level.
          </p>
          <div className="mt-3 grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-3">
              <p className="text-sm font-semibold text-slate-100">Who to call now</p>
              <ul className="mt-2 space-y-2 text-sm text-slate-300">
                <li>1) Airline priority desk</li>
                <li>2) Hotel front desk (late arrival hold)</li>
                <li>3) Transfer provider</li>
                <li>4) Family coordinator</li>
              </ul>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-3">
              <p className="text-sm font-semibold text-slate-100">What to say (script)</p>
              <p className="mt-2 text-xs text-slate-300">{recoveryScript}</p>
              <button
                type="button"
                onClick={() => copyScript(recoveryScript)}
                className="mt-3 rounded-md bg-slate-800 px-2.5 py-1.5 text-xs ring-1 ring-slate-700 hover:bg-slate-700"
              >
                Copy script
              </button>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-3">
              <p className="text-sm font-semibold text-slate-100">Decision path</p>
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-slate-300">
                <li>Missed flight confirmed? If yes, switch status to red and enter recovery stage.</li>
                <li>Rebooking available within 3 hours? If yes, keep hotel and transfer timeline.</li>
                <li>If no, notify hotel and split family schedule by person assignments.</li>
                <li>Re-export static itinerary and resync shared timeline.</li>
              </ol>
            </div>
          </div>
        </section>
      </div>

      {activeDrawer ? (
        <div className="fixed inset-0 z-40 flex items-end justify-end bg-slate-950/80 p-3 md:p-6">
          <div className="h-full w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-4 md:max-h-[92vh]">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                {activeDrawer.kind === "reservation" ? "Reservation details" : "Review item details"}
              </h3>
              <button
                type="button"
                onClick={closeDrawer}
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

      {toast ? (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-900 shadow-xl">
          {toast}
        </div>
      ) : null}
    </main>
  );
}
