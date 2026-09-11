import assert from "node:assert/strict";
import test from "node:test";
import {
  BARI_VENICE_SEP_12_RESERVATIONS,
  BARI_VENICE_TRIP_ID,
  ITA_JEFFERY_BRI_FCO_BOARDING_TEXT,
  ITA_STEPHANIE_BRI_FCO_BOARDING_TEXT,
  ITA_STEPHANIE_FCO_VCE_BOARDING_TEXT,
} from "@/lib/travelAssistant/fixtures/bariVeniceSep12Fixture";
import type { SessionReservation } from "@/lib/travelAssistant/clientSessionState";
import {
  buildBoardingPassArtifactsFromForward,
  extractBoardingPassRoute,
  extractPassengerNameFromBoardingPass,
  ingestBoardingPassForward,
  isBoardingPassForwardEmail,
} from "@/lib/travelAssistant/flightBoardingPassIngest";

test("G56: detects ITA boarding pass forward from subject", () => {
  assert.equal(
    isBoardingPassForwardEmail("Boarding pass for your flight BRI to FCO"),
    true,
  );
  assert.equal(isBoardingPassForwardEmail("ITA Airways Electronic travel receipt"), false);
});

test("G56: extracts BRI→FCO route from boarding pass subject", () => {
  const route = extractBoardingPassRoute("Boarding pass — BRI to FCO — Sep 12");
  assert.deepEqual(route, { dep: "BRI", arr: "FCO" });
});

test("G57: extracts Stephanie from gospel LAST, FIRST MRS plain-text email", () => {
  const name = extractPassengerNameFromBoardingPass({
    subject: "Boarding pass FCO to VCE",
    text: ITA_STEPHANIE_FCO_VCE_BOARDING_TEXT,
  });
  assert.match(name ?? "", /Stephanie/i);
});

test("G56: extracts passenger name from boarding pass PDF filename", () => {
  const name = extractPassengerNameFromBoardingPass({
    subject: "Boarding pass BRI to FCO",
    pdfFilename: "Stephanie-Russell-1980665325.pdf",
    pdfText: ITA_STEPHANIE_BRI_FCO_BOARDING_TEXT,
  });
  assert.match(name ?? "", /Stephanie Russell/i);
});

test("G57: text-only FCO→VCE boarding pass forward builds artifact", () => {
  const artifacts = buildBoardingPassArtifactsFromForward({
    subject: "Boarding pass — FCO to VCE",
    text: ITA_STEPHANIE_FCO_VCE_BOARDING_TEXT,
    pdfAttachments: [],
  });
  assert.equal(artifacts.length, 1);
  assert.equal(artifacts[0]!.route.dep, "FCO");
  assert.equal(artifacts[0]!.route.arr, "VCE");
  assert.equal(artifacts[0]!.confirmationCode, "Z84T4Z");
  assert.match(artifacts[0]!.passengerName, /Stephanie/i);
});

test("G56: ingest merges BRI→FCO boarding pass onto Z84T4Z summary flight", () => {
  const bareFlight = BARI_VENICE_SEP_12_RESERVATIONS.find((row) => row.id === "flight-bri-vce");
  assert.ok(bareFlight);
  const flightWithoutPasses = {
    ...bareFlight,
    hasPdfAttachment: undefined,
    originalEmailText: undefined,
    sourceLinks: undefined,
  };
  const reservations = [
    ...BARI_VENICE_SEP_12_RESERVATIONS.filter((row) => row.id !== "flight-bri-vce"),
    flightWithoutPasses,
  ];

  const result = ingestBoardingPassForward({
    subject: "Boarding pass — BRI to FCO",
    text: "Booking code Z84T4Z",
    tripId: BARI_VENICE_TRIP_ID,
    reservations: [...reservations] as SessionReservation[],
    pdfAttachments: [
      { filename: "Stephanie-Russell-1980665325.pdf", text: ITA_STEPHANIE_BRI_FCO_BOARDING_TEXT },
      { filename: "Jeffery Paul-Russell-1980665325.pdf", text: ITA_JEFFERY_BRI_FCO_BOARDING_TEXT },
    ],
  });

  assert.equal(result.handled, true);
  assert.equal(result.mergedCount, 2);
  const flight = result.reservations.find((row) => row.id === "flight-bri-vce");
  assert.ok(flight?.originalEmailText);
  assert.match(flight!.originalEmailText!, /Stephanie Russell — BRI-FCO/i);
  assert.match(flight!.sourceLinks?.[0]?.url ?? "", /leg=bri-fco/i);
});

test("G56: buildBoardingPassArtifactsFromForward never invents passenger names", () => {
  const artifacts = buildBoardingPassArtifactsFromForward({
    subject: "Boarding pass FCO to VCE",
    text: "Booking code Z84T4Z",
    pdfAttachments: [],
  });
  assert.equal(artifacts.length, 0);
});
