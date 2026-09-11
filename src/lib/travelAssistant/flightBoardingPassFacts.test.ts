import assert from "node:assert/strict";
import test from "node:test";
import {
  ITA_STEPHANIE_FCO_VCE_BOARDING_TEXT,
} from "@/lib/travelAssistant/fixtures/bariVeniceSep12Fixture";
import {
  extractBoardingPassLegFacts,
  formatBoardingPassLegDetail,
  normalizeItaPassengerDisplayName,
} from "@/lib/travelAssistant/flightBoardingPassFacts";

test("G57: normalize ITA LAST, FIRST MRS to display name", () => {
  assert.equal(normalizeItaPassengerDisplayName("RUSSELL, STEPHANIE MRS"), "Stephanie Russell");
});

test("G57: extract Stephanie FCO→VCE gospel facts without inventing", () => {
  const facts = extractBoardingPassLegFacts(ITA_STEPHANIE_FCO_VCE_BOARDING_TEXT);
  assert.equal(facts.confirmationCode, "Z84T4Z");
  assert.equal(facts.ticketNumber, "0552116012180");
  assert.equal(facts.flightNumber, "AZ1467");
  assert.equal(facts.departureAirport, "FCO");
  assert.equal(facts.arrivalAirport, "VCE");
  assert.equal(facts.departureTime, "17:20");
  assert.equal(facts.arrivalTime, "18:25");
  assert.equal(facts.terminal, "1");
  assert.equal(facts.boardingTime, "16:50");
  assert.equal(facts.gateClosesTime, "17:05");
  assert.equal(facts.seat, "6D");
  assert.equal(facts.boardingGroup, "4");
  assert.equal(facts.gate, "A00");
  assert.match(facts.baggageNote ?? "", /1 personal/i);

  const detail = formatBoardingPassLegDetail(facts, "Z84T4Z");
  assert.match(detail, /AZ1467/i);
  assert.match(detail, /FCO → VCE/i);
  assert.match(detail, /Gate A00/i);
  assert.doesNotMatch(detail, /AZ1616/i);
});
