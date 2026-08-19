import assert from "node:assert/strict";
import test from "node:test";
import { PDF_ATTACHMENT_MARKER } from "@/lib/travelAssistant/emailSourceText";
import {
  enrichReservationFromTripPeers,
  hydrateReservationsPricing,
  propagatePricingAcrossPeerGroups,
} from "@/lib/travelAssistant/hydrateReservationQuotedPrice";
import { reservationMissingPrice, computeTripSpend } from "@/lib/travelAssistant/tripSpendSummary";

const ITA_BOILERPLATE =
  "ITA Airways Electronic travel receipt Reservation code Z84T4Z Please review this booking confirmation carefully. ".repeat(
    3,
  );

const ITA_PDF = `
--- PDF attachment ---
FARE DETAILS
Total Amount EUR 149.78
Flight AZ1616 BRI FCO
Flight AZ1467 FCO VCE
`;

test("G34 peer: sibling with boilerplate inherits PDF email text from donor leg", () => {
  const legs = [
    {
      id: "leg-1",
      confirmationCode: "Z84T4Z",
      sourceEmailId: "email-ita-1",
      originalEmailText: ITA_BOILERPLATE + ITA_PDF,
      flightNumber: "AZ1616",
      flightDepartureAirport: "BRI",
      flightArrivalAirport: "FCO",
    },
    {
      id: "leg-2",
      confirmationCode: "Z84T4Z",
      sourceEmailId: "email-ita-1",
      originalEmailText: ITA_BOILERPLATE,
      flightNumber: "AZ1467",
      flightDepartureAirport: "FCO",
      flightArrivalAirport: "VCE",
    },
  ];

  const enriched = enrichReservationFromTripPeers(legs[1]!, legs);
  assert.ok(enriched.originalEmailText?.includes(PDF_ATTACHMENT_MARKER));

  const hydrated = hydrateReservationsPricing(legs);
  assert.equal(hydrated[0]?.quotedPriceUsd, 150);
  assert.equal(hydrated[1]?.quotedPriceUsd, 150);
});

test("propagatePricingAcrossPeerGroups copies cash and miles to every leg in PNR", () => {
  const reservations = [
    {
      id: "f1",
      type: "flight",
      title: "BRI-FCO",
      confirmationCode: "Z84T4Z",
      sourceEmailId: "email-1",
      originalEmailText: ITA_BOILERPLATE + ITA_PDF,
      flightNumber: "AZ1616",
      flightDepartureAirport: "BRI",
      flightArrivalAirport: "FCO",
    },
    {
      id: "f2",
      type: "flight",
      title: "FCO-VCE",
      confirmationCode: "Z84T4Z",
      sourceEmailId: "email-1",
      originalEmailText: ITA_BOILERPLATE,
      flightNumber: "AZ1467",
      flightDepartureAirport: "FCO",
      flightArrivalAirport: "VCE",
    },
  ];

  const summary = computeTripSpend(reservations);
  assert.equal(summary.missingPriceCount, 0);
  assert.equal(reservationMissingPrice(reservations[1]!, reservations), false);

  const persisted = propagatePricingAcrossPeerGroups(
    hydrateReservationsPricing(reservations),
  );
  assert.equal(persisted[0]?.quotedPriceUsd, 150);
  assert.equal(persisted[1]?.quotedPriceUsd, 150);
});
