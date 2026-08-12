import {
  describeBookedAirportPath,
  findBookedAirportPath,
  hasBookedAirportPath,
  type ItineraryPathSegment,
} from "@/lib/travelAssistant/itineraryPathCoverage";
import type { PlannedFlightLeg } from "@/lib/travelAssistant/tripPlanBooking";
import {
  buildTripTransportRoute,
  type TransportRouteReservation,
  type TripTransportRoute,
} from "@/lib/travelAssistant/tripTransportRoute";
import { itineraryConnectionSelfCheckQuestion } from "@/lib/travelAssistant/disruptionCalm";

export type ItineraryCheckStatus = "pass" | "warn" | "fail";

export interface ItinerarySelfCheckItem {
  id: string;
  question: string;
  status: ItineraryCheckStatus;
  answer: string;
}

export interface ItinerarySelfCheckResult {
  items: ItinerarySelfCheckItem[];
  passed: boolean;
  summary: string;
}

function normalizeIata(code: string | undefined): string {
  return code?.trim().toUpperCase() ?? "";
}

function reservationsToPathHops(reservations: TransportRouteReservation[]): ItineraryPathSegment[] {
  return reservations
    .filter((reservation) => reservation.type === "flight")
    .map((reservation) => ({
      fromCode: normalizeIata(reservation.flightDepartureAirport),
      toCode: normalizeIata(reservation.flightArrivalAirport),
      booked: Boolean(
        reservation.confirmationCode?.trim() &&
          !["PENDING", "SELECTED", "TBD", "PENDING-BOOK", "UNKNOWN", "PLANNED"].includes(
            reservation.confirmationCode.trim().toUpperCase(),
          ) &&
          !reservation.plannedOnly,
      ),
      departMs: reservation.flightDepartureTime
        ? Date.parse(reservation.flightDepartureTime)
        : reservation.flightDate
          ? Date.parse(`${reservation.flightDate.slice(0, 10)}T12:00:00`)
          : null,
    }))
    .filter((hop) => hop.fromCode && hop.toCode);
}

function bookedHops(hops: ItineraryPathSegment[]): ItineraryPathSegment[] {
  return hops.filter((hop) => hop.booked);
}

function statusFromBool(ok: boolean, warn = false): ItineraryCheckStatus {
  if (ok) return "pass";
  return warn ? "warn" : "fail";
}

/**
 * Walks the trip like a concierge checklist — re-run whenever reservations change.
 */
export function runItinerarySelfCheck(args: {
  reservations: TransportRouteReservation[];
  plannedFlightLegs: PlannedFlightLeg[];
  route?: TripTransportRoute;
}): ItinerarySelfCheckResult {
  const route = args.route ?? buildTripTransportRoute(args.reservations, args.plannedFlightLegs);
  const items: ItinerarySelfCheckItem[] = [];
  const hops = reservationsToPathHops(args.reservations);
  const booked = bookedHops(hops);

  const returnLeg =
    args.plannedFlightLegs.find((leg) => leg.role === "return") ??
    args.plannedFlightLegs[args.plannedFlightLegs.length - 1];
  const homeIata = returnLeg ? normalizeIata(returnLeg.toIata) : "";
  const returnFromIata = returnLeg ? normalizeIata(returnLeg.fromIata) : "";

  items.push({
    id: "home-target",
    question: "Do we know where you're flying home to?",
    status: homeIata ? "pass" : "warn",
    answer: homeIata ? `Home airport: ${homeIata}` : "No return destination on the trip plan yet.",
  });

  const homePath = homeIata && returnFromIata ? findBookedAirportPath(booked, returnFromIata, homeIata) : null;
  const homeCovered =
    Boolean(homePath) ||
    booked.some((hop) => hop.toCode === homeIata) ||
    route.summary.allSet;

  items.push({
    id: "flight-home",
    question: "Is your flight home booked (including connections)?",
    status: statusFromBool(homeCovered, !homeIata),
    answer: homePath
      ? `Yes — ${describeBookedAirportPath(booked, returnFromIata, homeIata) ?? homePath.join("→")}`
      : homeIata
        ? `Not yet — still need ${returnFromIata || "?"} → ${homeIata}`
        : "Add a return leg to the trip plan first.",
  });

  items.push({
    id: "return-origin",
    question: "Where does the return trip start?",
    status: returnFromIata ? "pass" : "warn",
    answer: returnFromIata
      ? `Last stop before home: ${returnFromIata}`
      : "Could not determine the city you're leaving from.",
  });

  const firstReturnHop = booked.find((hop) => hop.fromCode === returnFromIata);
  const canStartReturn =
    !returnFromIata ||
    Boolean(firstReturnHop) ||
    (returnLeg?.status === "booked" && Boolean(homePath));

  items.push({
    id: "reach-return-start",
    question: "Is there a flight departing from your return starting city?",
    status: statusFromBool(canStartReturn, !returnFromIata),
    answer: firstReturnHop
      ? `Yes — ${firstReturnHop.fromCode} → ${firstReturnHop.toCode} is booked`
      : homePath && homePath.length > 2
        ? `Yes — return starts via ${homePath.slice(0, 2).join("→")}`
        : returnFromIata
          ? `No booked departure from ${returnFromIata} yet`
          : "N/A",
  });

  for (const leg of args.plannedFlightLegs.filter((item) => item.enabled !== false && item.status === "needed")) {
    const from = normalizeIata(leg.fromIata);
    const to = normalizeIata(leg.toIata);
    const covered = hasBookedAirportPath(booked, from, to);
    items.push({
      id: `planned-${leg.id}`,
      question: `Is ${from} → ${to} still missing, or covered by connections?`,
      status: covered ? "pass" : "fail",
      answer: covered
        ? `Covered — ${describeBookedAirportPath(booked, from, to) ?? "connections booked"}`
        : `Still open — book ${from} → ${to} or connecting hops`,
    });
  }

  items.push({
    id: "connections",
    question: itineraryConnectionSelfCheckQuestion(),
    status: route.summary.conflicts === 0 ? "pass" : "fail",
    answer:
      route.summary.conflicts === 0
        ? "All timed connections look feasible."
        : `${route.summary.conflicts} connection${route.summary.conflicts === 1 ? "" : "s"} need attention.`,
  });

  items.push({
    id: "open-transport",
    question: "Any transportation segments still unbooked?",
    status: route.summary.unbooked === 0 ? "pass" : "fail",
    answer:
      route.summary.unbooked === 0
        ? "Every segment on the route map is ticketed."
        : `${route.summary.unbooked} segment${route.summary.unbooked === 1 ? "" : "s"} still to book.`,
  });

  const failures = items.filter((item) => item.status === "fail").length;
  const passed = failures === 0;

  return {
    items,
    passed,
    summary: passed
      ? "Trip itinerary checks out — connections and return home are covered."
      : `${failures} item${failures === 1 ? "" : "s"} still need attention.`,
  };
}

export function reconcileTripItinerary(args: {
  reservations: TransportRouteReservation[];
  plannedFlightLegs: PlannedFlightLeg[];
}): { route: TripTransportRoute; selfCheck: ItinerarySelfCheckResult } {
  const route = buildTripTransportRoute(args.reservations, args.plannedFlightLegs);
  const selfCheck = runItinerarySelfCheck({ ...args, route });
  return { route, selfCheck };
}
