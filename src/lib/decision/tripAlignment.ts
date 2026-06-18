import { buildSeatsAeroSearchUrl } from "@/lib/decision/awardFlexEstimate";
import { resolveCashBookUrl } from "@/lib/decision/bookingLinks";
import type { DecisionBrief, TravelStrategy } from "@/lib/decision/types";

export type AlignmentStatus = "verified" | "estimated" | "recommended_skip" | "modeled";

export interface AlignmentLeg {
  id: string;
  step: number;
  role: "outbound" | "return" | "connector" | "hotel" | "ground" | "award";
  label: string;
  detail: string;
  status: AlignmentStatus;
  statusLabel: string;
  priceUsd?: number;
  originIata?: string;
  destinationIata?: string;
  departureDate?: string;
  airline?: string;
  bookUrl?: string;
  bookLabel?: string;
  verifyUrl?: string;
}

function statusChip(status: AlignmentStatus): string {
  switch (status) {
    case "verified":
      return "Live price verified";
    case "estimated":
      return "Award estimate — verify before booking";
    case "recommended_skip":
      return "Skip flight — train or drive usually better";
    case "modeled":
      return "Modeled playbook — confirm before you count on it";
  }
}

function parseRouteFromLabel(label: string): { origin?: string; destination?: string } {
  const match = label.match(/\b([A-Z]{3})\s*→\s*([A-Z]{3})\b/);
  if (!match) return {};
  return { origin: match[1], destination: match[2] };
}

export function buildAlignmentBoard(
  brief: DecisionBrief,
  strategy: TravelStrategy,
): AlignmentLeg[] {
  const legs: AlignmentLeg[] = [];
  const live = brief.livePricing;
  const intent = brief.intent;
  let step = 1;

  const outboundDate = intent.startDate;
  const returnDate = intent.endDate;
  const isAwardPlay =
    strategy.kind === "reposition_award" ||
    strategy.kind === "instrument_play" ||
    brief.paymentMode === "points";

  if (live?.bestOffer) {
    const offer = live.bestOffer;
    const book = resolveCashBookUrl({
      origin: offer.origin,
      destination: offer.destination,
      departureDate: outboundDate,
      airline: offer.airline,
      offerId: offer.offerId,
      quotedPriceUsd: offer.amount,
      flightNumber: offer.flightNumber,
    });
    legs.push({
      id: "outbound",
      step: step++,
      role: isAwardPlay && strategy.kind === "reposition_award" ? "award" : "outbound",
      label: `${offer.origin} → ${offer.destination}`,
      detail: `${offer.airline} · ${offer.stops === 0 ? "nonstop" : `${offer.stops} stop${offer.stops > 1 ? "s" : ""}`} · live Duffel`,
      status: "verified",
      statusLabel: statusChip("verified"),
      priceUsd: offer.amount,
      originIata: offer.origin,
      destinationIata: offer.destination,
      departureDate: outboundDate,
      airline: offer.airline,
      bookUrl: isAwardPlay ? undefined : book.url,
      bookLabel: isAwardPlay ? undefined : book.label,
      verifyUrl: isAwardPlay
        ? buildSeatsAeroSearchUrl({
            origin: offer.origin,
            destination: offer.destination,
            departureDate: outboundDate,
          })
        : undefined,
    });
  } else {
    const dep = strategy.departureAirports[0] ?? intent.originAirports?.[0];
    const arr = intent.stops?.[0]?.iata ?? intent.destinationIata;
    if (dep && arr) {
      const book = resolveCashBookUrl({
        origin: dep,
        destination: arr,
        departureDate: outboundDate,
      });
      legs.push({
        id: "outbound",
        step: step++,
        role: "outbound",
        label: `${dep} → ${arr}`,
        detail: strategy.segments.find((s) => s.mode === "flight")?.detail ?? "Modeled outbound",
        status: "modeled",
        statusLabel: statusChip("modeled"),
        priceUsd: strategy.segments.find((s) => s.mode === "flight")?.costUsd,
        originIata: dep,
        destinationIata: arr,
        departureDate: outboundDate,
        bookUrl: book.url,
        bookLabel: book.label,
      });
    }
  }

  for (const connector of brief.flightLegs?.filter((leg) => leg.role === "connector") ?? []) {
    const liveConnector = live?.connectorOffers?.find((offer) => offer.legId === connector.id);
    if (!connector.enabled) {
      legs.push({
        id: connector.id,
        step: step++,
        role: "ground",
        label: `${connector.fromLabel} → ${connector.toLabel}`,
        detail: connector.loyaltyNote ?? "Train or drive — flight optional",
        status: "recommended_skip",
        statusLabel: statusChip("recommended_skip"),
      });
      continue;
    }
    if (liveConnector) {
      const book = resolveCashBookUrl({
        origin: liveConnector.origin,
        destination: liveConnector.destination,
        departureDate: connector.departureDate,
        airline: liveConnector.airline,
        offerId: liveConnector.offerId,
        quotedPriceUsd: liveConnector.amount,
        flightNumber: liveConnector.flightNumber,
      });
      legs.push({
        id: connector.id,
        step: step++,
        role: "connector",
        label: `${liveConnector.origin} → ${liveConnector.destination}`,
        detail: `${liveConnector.airline} · live Duffel connector`,
        status: "verified",
        statusLabel: statusChip("verified"),
        priceUsd: liveConnector.amount,
        originIata: liveConnector.origin,
        destinationIata: liveConnector.destination,
        departureDate: connector.departureDate,
        airline: liveConnector.airline,
        bookUrl: book.url,
        bookLabel: book.label,
      });
    }
  }

  if (live?.returnOffer) {
    const offer = live.returnOffer;
    const book = resolveCashBookUrl({
      origin: offer.origin,
      destination: offer.destination,
      departureDate: returnDate,
      airline: offer.airline,
      offerId: offer.offerId,
      quotedPriceUsd: offer.amount,
      flightNumber: offer.flightNumber,
    });
    legs.push({
      id: "return",
      step: step++,
      role: "return",
      label: `${offer.origin} → ${offer.destination}`,
      detail: `${offer.airline} · ${offer.stops === 0 ? "nonstop" : `${offer.stops} stop${offer.stops > 1 ? "s" : ""}`} · live Duffel`,
      status: "verified",
      statusLabel: statusChip("verified"),
      priceUsd: offer.amount,
      originIata: offer.origin,
      destinationIata: offer.destination,
      departureDate: returnDate,
      airline: offer.airline,
      bookUrl: book.url,
      bookLabel: book.label,
    });
  } else if (intent.returnAirports?.[0]) {
    const dep = intent.returnAirports[0];
    const arr = strategy.departureAirports[0] ?? intent.originAirports?.[0];
    if (arr) {
      const book = resolveCashBookUrl({
        origin: dep,
        destination: arr,
        departureDate: returnDate,
      });
      legs.push({
        id: "return",
        step: step++,
        role: "return",
        label: `${dep} → ${arr}`,
        detail: "Return leg — confirm after outbound is booked",
        status: "modeled",
        statusLabel: statusChip("modeled"),
        originIata: dep,
        destinationIata: arr,
        departureDate: returnDate,
        bookUrl: book.url,
        bookLabel: book.label,
      });
    }
  }

  if (isAwardPlay && strategy.kind === "reposition_award" && !legs.some((leg) => leg.verifyUrl)) {
    const flightSeg = strategy.segments.find((s) => s.mode === "flight");
    const route = flightSeg ? parseRouteFromLabel(flightSeg.label) : {};
    const origin = route.origin ?? strategy.departureAirports[0];
    const destination =
      route.destination ?? intent.stops?.[0]?.iata ?? intent.destinationIata;
    if (origin && destination) {
      legs.push({
        id: "award-longhaul",
        step: step++,
        role: "award",
        label: flightSeg?.label ?? `${origin} → ${destination}`,
        detail: "Partner award — miles are estimated, not live inventory",
        status: "estimated",
        statusLabel: statusChip("estimated"),
        priceUsd: flightSeg?.costUsd,
        originIata: origin,
        destinationIata: destination,
        departureDate: outboundDate,
        verifyUrl: buildSeatsAeroSearchUrl({ origin, destination, departureDate: outboundDate }),
      });
    }
  }

  for (const segment of strategy.segments.filter((s) => s.mode === "hotel")) {
    legs.push({
      id: `hotel-${segment.label}`,
      step: step++,
      role: "hotel",
      label: segment.label,
      detail: segment.detail,
      status: "modeled",
      statusLabel: "Book after flights — ranked in Hotels mode",
      priceUsd: segment.costUsd,
    });
  }

  return legs;
}

export function countVerifiedLegs(legs: AlignmentLeg[]): { verified: number; total: number } {
  const bookable = legs.filter((leg) => leg.role !== "ground");
  const verified = bookable.filter((leg) => leg.status === "verified").length;
  return { verified, total: bookable.length };
}
