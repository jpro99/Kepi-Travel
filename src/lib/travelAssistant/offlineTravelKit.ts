import type {
  SessionReadinessItem,
  SessionReservation,
} from "@/lib/travelAssistant/clientSessionState";
import { filterConsumerTimelineReservations } from "@/lib/travelAssistant/consumerTimeline";
import { computeJourneyPhase, type JourneyPhase } from "@/lib/travelAssistant/journeyPhase";
import { buildSharedHotelContact } from "@/lib/travelAssistant/sharedHotelInfo";
import type { TripAirportTransport } from "@/lib/travelAssistant/tripStore";

export const OFFLINE_KIT_DB_NAME = "kepi-offline";
export const OFFLINE_KIT_DB_VERSION = 2;
export const OFFLINE_KIT_STORE = "travel-kit";
export const OFFLINE_KIT_RECORD_KEY = "active";

export interface OfflineKitHotelContact {
  address: string;
  phone: string;
  phoneTelHref: string | null;
  mapsUrl: string;
  checkInLabel: string;
  checkOutLabel: string;
  roomType: string;
  confirmationCode: string;
}

export interface OfflineKitReservation {
  id: string;
  type: SessionReservation["type"];
  title: string;
  provider: string;
  localTime: string;
  timezone: string;
  location: string;
  confirmationCode: string;
  notes: string;
  flightNumber?: string;
  flightAirline?: string;
  flightDate?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  flightDepartureTime?: string;
  flightArrivalTime?: string;
  flightStatus?: string;
  flightOnTime?: boolean;
  flightDelayMinutes?: number;
  flightDepartureGate?: string;
  flightDepartureTerminal?: string;
  flightArrivalGate?: string;
  flightArrivalTerminal?: string;
  checkOutDate?: string;
  roomType?: string;
  hotelPhone?: string;
  manageUrl?: string;
  hotelContact?: OfflineKitHotelContact;
}

export interface OfflineTravelKit {
  version: 1;
  savedAt: string;
  tripId: string;
  tripName: string;
  destination: string;
  startDate: string;
  endDate: string;
  airportTransport: TripAirportTransport | null;
  airportTransportLabel: string;
  hotelArrivalTime: string | null;
  gettingToHotelHint: string;
  journeyHeadline: string;
  journeyDetail: string;
  nextReservationId: string | null;
  reservations: OfflineKitReservation[];
  readinessItems: SessionReadinessItem[];
  dayNotes: Record<string, string>;
  hotelNotebookNote: string;
  documentEssentials: string[];
}

export interface BuildOfflineTravelKitInput {
  tripId: string;
  tripName: string;
  destination: string;
  startDate: string;
  endDate: string;
  airportTransport?: TripAirportTransport | null;
  hotelArrivalTime?: string | null;
  reservations: SessionReservation[];
  readinessItems?: SessionReadinessItem[];
  dayNotes?: Record<string, string>;
  hotelNotebookNote?: string;
  savedAt?: string;
  nowMs?: number;
}

const AIRPORT_TRANSPORT_LABELS: Record<TripAirportTransport, string> = {
  "driving-myself": "You plan to drive yourself from the airport.",
  "getting-dropped-off": "Someone is picking you up at arrivals.",
  "uber-lyft": "Take Uber or Lyft from the airport to your hotel.",
  "train-bus": "Take train or public transit from the airport.",
  other: "Use your planned ground transport from the airport.",
};

const OFFLINE_DOCUMENT_ESSENTIALS = [
  "Passport or government ID",
  "Boarding passes saved offline (screenshots or wallet)",
  "Hotel confirmation codes",
  "Hotel address and front-desk phone",
  "Travel insurance card (if applicable)",
];

function reservationSortMs(reservation: SessionReservation): number {
  const parsed = Date.parse(reservation.localTime.replace(" ", "T"));
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

function formatShortDate(value: string): string {
  const ms = Date.parse(value.replace(" ", "T"));
  if (Number.isNaN(ms)) return value.trim();
  return new Date(ms).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatShortTime(value: string): string {
  const ms = Date.parse(value.replace(" ", "T"));
  if (Number.isNaN(ms)) return "";
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function reservationSummary(reservation: OfflineKitReservation): string {
  if (reservation.type === "flight") {
    const dep = reservation.flightDepartureAirport ?? "???";
    const arr = reservation.flightArrivalAirport ?? "???";
    const fn = reservation.flightNumber ?? reservation.provider;
    return `${dep} → ${arr}${fn ? ` · ${fn}` : ""}`;
  }
  if (reservation.type === "hotel") {
    return reservation.title || reservation.provider;
  }
  return reservation.title || reservation.provider;
}

function describeJourneyPhase(phase: JourneyPhase): { headline: string; detail: string } {
  switch (phase.kind) {
    case "airborne":
      return {
        headline: `In the air — landing at ${phase.landingAt}`,
        detail: `Estimated landing in ${phase.landingIn}. Gate and delay info below was saved when you were last online.`,
      };
    case "just-landed":
      return {
        headline: `Just landed at ${phase.flight.flightArrivalAirport ?? "your destination"}`,
        detail: `Landed about ${phase.landedMinutesAgo} minutes ago. Open your hotel card below for address, phone, and directions.`,
      };
    case "pre-trip":
      if (phase.nextFlight.type === "hotel") {
        return {
          headline: `Next stay: ${phase.nextFlight.provider ?? "Hotel"}`,
          detail:
            phase.daysUntil <= 0
              ? "Check-in is today. Your hotel details are below."
              : `Check-in in ${phase.daysUntil} day${phase.daysUntil === 1 ? "" : "s"}. Full itinerary saved offline.`,
        };
      }
      return {
        headline: `Next flight: ${phase.nextFlight.flightDepartureAirport ?? ""} → ${phase.nextFlight.flightArrivalAirport ?? ""}`,
        detail:
          phase.daysUntil <= 0
            ? "Departure is today. Flight details and gates are below."
            : `Departure in ${phase.daysUntil} day${phase.daysUntil === 1 ? "" : "s"}. Everything you need is saved below.`,
      };
    case "post-trip":
      return {
        headline: "Trip complete",
        detail: phase.lastDestination
          ? `Your ${phase.lastDestination} trip details remain available offline.`
          : "Your saved trip details remain available offline.",
      };
    case "no-trip":
      return {
        headline: "No trip saved yet",
        detail: "Open Kepi Travel while online to download your itinerary for offline use.",
      };
    default:
      return { headline: "Your trip", detail: "Full itinerary saved for offline use." };
  }
}

function findNextReservationId(reservations: OfflineKitReservation[], nowMs: number): string | null {
  const upcoming = reservations.find((reservation) => {
    const ms = Date.parse(reservation.localTime.replace(" ", "T"));
    if (Number.isNaN(ms)) return false;
    if (reservation.type === "hotel" && reservation.checkOutDate) {
      const outMs = Date.parse(reservation.checkOutDate.replace(" ", "T"));
      if (!Number.isNaN(outMs) && outMs >= nowMs) return true;
    }
    return ms >= nowMs - 6 * 60 * 60 * 1000;
  });
  return upcoming?.id ?? reservations[reservations.length - 1]?.id ?? null;
}

function buildGettingToHotelHint(args: {
  reservations: OfflineKitReservation[];
  airportTransport: TripAirportTransport | null;
  hotelArrivalTime: string | null;
  nowMs: number;
}): string {
  const transportLabel = args.airportTransport
    ? AIRPORT_TRANSPORT_LABELS[args.airportTransport]
    : "Plan ground transport from the airport to your hotel.";

  const nextHotel = args.reservations.find((reservation) => {
    if (reservation.type !== "hotel") return false;
    const checkInMs = Date.parse(reservation.localTime.replace(" ", "T"));
    const checkOutMs = reservation.checkOutDate
      ? Date.parse(reservation.checkOutDate.replace(" ", "T"))
      : Number.NaN;
    if (!Number.isNaN(checkOutMs) && checkOutMs < args.nowMs) return false;
    return Number.isNaN(checkInMs) || checkInMs >= args.nowMs - 12 * 60 * 60 * 1000;
  });

  if (!nextHotel) {
    return transportLabel;
  }

  const hotelName = nextHotel.title || nextHotel.provider;
  const address = nextHotel.hotelContact?.address || nextHotel.location;
  const phone = nextHotel.hotelContact?.phone || nextHotel.hotelPhone;
  const arrivalNote = args.hotelArrivalTime?.trim()
    ? ` Target arrival around ${args.hotelArrivalTime.trim()}.`
    : "";

  const parts = [
    transportLabel,
    `Hotel: ${hotelName}.`,
    address ? `Address: ${address}.` : "",
    phone ? `Front desk: ${phone}.` : "Save the hotel phone in your kit before you fly.",
    arrivalNote,
    "Tap the hotel card for Call and Open in Maps — maps links open your phone's map app.",
  ].filter(Boolean);

  return parts.join(" ");
}

function enrichReservation(reservation: SessionReservation): OfflineKitReservation {
  const base: OfflineKitReservation = {
    id: reservation.id,
    type: reservation.type,
    title: reservation.title,
    provider: reservation.provider,
    localTime: reservation.localTime,
    timezone: reservation.timezone,
    location: reservation.location,
    confirmationCode: reservation.confirmationCode,
    notes: reservation.notes,
    flightNumber: reservation.flightNumber,
    flightAirline: reservation.flightAirline,
    flightDate: reservation.flightDate,
    flightDepartureAirport: reservation.flightDepartureAirport,
    flightArrivalAirport: reservation.flightArrivalAirport,
    flightDepartureTime: reservation.flightDepartureTime,
    flightArrivalTime: reservation.flightArrivalTime,
    flightStatus: reservation.flightStatus,
    flightOnTime: reservation.flightOnTime,
    flightDelayMinutes: reservation.flightDelayMinutes,
    flightDepartureGate: reservation.flightDepartureGate,
    flightDepartureTerminal: reservation.flightDepartureTerminal,
    flightArrivalGate: reservation.flightArrivalGate,
    flightArrivalTerminal: reservation.flightArrivalTerminal,
    checkOutDate: reservation.checkOutDate,
    roomType: reservation.roomType,
    hotelPhone: reservation.hotelPhone,
    manageUrl: reservation.manageUrl,
  };

  if (reservation.type === "hotel") {
    const contact = buildSharedHotelContact({
      type: reservation.type,
      title: reservation.title,
      provider: reservation.provider,
      localTime: reservation.localTime,
      location: reservation.location,
      confirmationCode: reservation.confirmationCode,
      checkOutDate: reservation.checkOutDate,
      roomType: reservation.roomType,
      hotelPhone: reservation.hotelPhone,
      notes: reservation.notes,
    });
    base.hotelContact = {
      address: contact.address,
      phone: contact.phone,
      phoneTelHref: contact.phoneTelHref,
      mapsUrl: contact.mapsUrl,
      checkInLabel: contact.checkInLabel,
      checkOutLabel: contact.checkOutLabel,
      roomType: contact.roomType,
      confirmationCode: contact.confirmationCode,
    };
    if (contact.phone && !base.hotelPhone) {
      base.hotelPhone = contact.phone;
    }
  }

  return base;
}

export function buildOfflineTravelKit(input: BuildOfflineTravelKitInput): OfflineTravelKit {
  const nowMs = input.nowMs ?? Date.now();
  const savedAt = input.savedAt ?? new Date(nowMs).toISOString();
  const consumerReservations = filterConsumerTimelineReservations(input.reservations);
  const sorted = [...consumerReservations]
    .sort((left, right) => reservationSortMs(left) - reservationSortMs(right))
    .map(enrichReservation);

  const phase = computeJourneyPhase({
    reservations: consumerReservations,
    nowMs,
    tripDestination: input.destination,
  });
  const journey = describeJourneyPhase(phase);
  const airportTransport = input.airportTransport ?? null;

  const incompleteReadiness = (input.readinessItems ?? []).filter((item) => item.required && !item.complete);

  return {
    version: 1,
    savedAt,
    tripId: input.tripId,
    tripName: input.tripName.trim() || "Your trip",
    destination: input.destination.trim(),
    startDate: input.startDate,
    endDate: input.endDate,
    airportTransport,
    airportTransportLabel: airportTransport ? AIRPORT_TRANSPORT_LABELS[airportTransport] : "",
    hotelArrivalTime: input.hotelArrivalTime?.trim() || null,
    gettingToHotelHint: buildGettingToHotelHint({
      reservations: sorted,
      airportTransport,
      hotelArrivalTime: input.hotelArrivalTime ?? null,
      nowMs,
    }),
    journeyHeadline: journey.headline,
    journeyDetail: journey.detail,
    nextReservationId: findNextReservationId(sorted, nowMs),
    reservations: sorted,
    readinessItems: input.readinessItems ?? [],
    dayNotes: input.dayNotes ?? {},
    hotelNotebookNote: input.hotelNotebookNote?.trim() ?? "",
    documentEssentials: [
      ...OFFLINE_DOCUMENT_ESSENTIALS,
      ...incompleteReadiness.map((item) => item.title),
    ],
  };
}

export function formatOfflineKitSavedAt(savedAt: string): string {
  const ms = Date.parse(savedAt);
  if (Number.isNaN(ms)) return savedAt;
  return new Date(ms).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function reservationCardTitle(reservation: OfflineKitReservation): string {
  return reservationSummary(reservation);
}

export function reservationCardSubtitle(reservation: OfflineKitReservation): string {
  if (reservation.type === "flight") {
    const parts = [
      formatShortDate(reservation.localTime),
      formatShortTime(reservation.flightDepartureTime ?? reservation.localTime),
    ].filter(Boolean);
    if (reservation.flightDepartureGate) parts.push(`Gate ${reservation.flightDepartureGate}`);
    if (typeof reservation.flightDelayMinutes === "number" && reservation.flightDelayMinutes > 0) {
      parts.push(`${reservation.flightDelayMinutes}m delay`);
    } else if (reservation.flightStatus) {
      parts.push(reservation.flightStatus);
    }
    return parts.join(" · ");
  }
  if (reservation.type === "hotel") {
    const parts = [`Check-in ${formatShortDate(reservation.localTime)}`];
    if (reservation.checkOutDate) parts.push(`Out ${formatShortDate(reservation.checkOutDate)}`);
    if (reservation.hotelContact?.address || reservation.location) {
      parts.push(reservation.hotelContact?.address || reservation.location);
    }
    return parts.join(" · ");
  }
  return [formatShortDate(reservation.localTime), reservation.location].filter(Boolean).join(" · ");
}

function openOfflineKitDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const request = indexedDB.open(OFFLINE_KIT_DB_NAME, OFFLINE_KIT_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OFFLINE_KIT_STORE)) {
        db.createObjectStore(OFFLINE_KIT_STORE);
      }
      if (!db.objectStoreNames.contains("offline-cache")) {
        db.createObjectStore("offline-cache");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open offline kit database"));
  });
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

export async function saveOfflineTravelKit(kit: OfflineTravelKit): Promise<void> {
  const db = await openOfflineKitDb();
  try {
    const tx = db.transaction(OFFLINE_KIT_STORE, "readwrite");
    tx.objectStore(OFFLINE_KIT_STORE).put(kit, OFFLINE_KIT_RECORD_KEY);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Failed to save offline kit"));
    });
  } finally {
    db.close();
  }

  if (typeof navigator !== "undefined" && "serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: "CACHE_OFFLINE_KIT_ROUTE" });
  }
}

export async function loadOfflineTravelKit(): Promise<OfflineTravelKit | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openOfflineKitDb();
  try {
    const tx = db.transaction(OFFLINE_KIT_STORE, "readonly");
    const value = await idbRequest(tx.objectStore(OFFLINE_KIT_STORE).get(OFFLINE_KIT_RECORD_KEY));
    if (!value || typeof value !== "object") return null;
    const kit = value as Partial<OfflineTravelKit>;
    if (kit.version !== 1 || typeof kit.savedAt !== "string" || !Array.isArray(kit.reservations)) {
      return null;
    }
    return kit as OfflineTravelKit;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

export async function clearOfflineTravelKit(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openOfflineKitDb();
  try {
    const tx = db.transaction(OFFLINE_KIT_STORE, "readwrite");
    tx.objectStore(OFFLINE_KIT_STORE).delete(OFFLINE_KIT_RECORD_KEY);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Failed to clear offline kit"));
    });
  } finally {
    db.close();
  }
}
