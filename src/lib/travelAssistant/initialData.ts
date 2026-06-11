import type { Reservation, ReviewItem, ReadinessItem } from "./travelUpdateTypes";

export const BASE_CHECKLIST: ReadinessItem[] = [
  { id: "ready-flight", category: "Flights", title: "Flight confirmation codes verified", complete: false, required: true },
  { id: "ready-hotel", category: "Hotels", title: "Hotel check-in and check-out confirmed", complete: false, required: true },
  { id: "ready-transport", category: "Transportation", title: "Airport transfer planned with fallback", complete: false, required: true },
  { id: "ready-passport", category: "Passport", title: "Passport validity verified", complete: false, required: true },
  { id: "ready-checkin", category: "Check-in timing", title: "Online check-in reminders set", complete: false, required: true },
  { id: "ready-arrival", category: "Arrival transfer", title: "Pickup location pinned", complete: false, required: true },
  { id: "ready-essentials", category: "Essentials", title: "Medication and chargers packed", complete: false, required: false },
  { id: "ready-night", category: "First-night", title: "First meal and sleep plan prepared", complete: false, required: false },
];

export function buildChecklistFromReservations(
  reservations: { type: string; confirmationCode?: string; checkOutDate?: string; flightNumber?: string }[],
  savedItems?: ReadinessItem[],
): ReadinessItem[] {
  const hasFlights = reservations.some((r) => r.type === "flight" && r.confirmationCode);
  const hasHotel = reservations.some((r) => r.type === "hotel" && r.confirmationCode);
  const hasTransport = reservations.some((r) => r.type === "ride" || r.type === "train");

  return BASE_CHECKLIST.map((item) => {
    const saved = savedItems?.find((s) => s.id === item.id);
    if (saved) return saved;
    let complete = false;
    if (item.id === "ready-flight") complete = hasFlights;
    if (item.id === "ready-hotel") complete = hasHotel;
    if (item.id === "ready-transport") complete = hasTransport;
    return { ...item, complete };
  });
}

export const INITIAL_CHECKLIST = BASE_CHECKLIST;

export const INITIAL_RESERVATIONS: Reservation[] = [
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

export const INITIAL_REVIEW_QUEUE: ReviewItem[] = [
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
