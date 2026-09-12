import assert from "node:assert/strict";
import test from "node:test";
import { detectMissionPhase } from "@/lib/travelAssistant/tripPhase";
import {
  buildBriAirportTransferHint,
  buildHomeTravelDayCoach,
  buildTravelDayWalkthroughSteps,
  dayHasBookedTravelMoves,
  formatTravelDayFlightLead,
  hasActiveTravelDayCoach,
  homeTravelDayCoachNextAction,
  resolveTomorrowTravelDayCoach,
  resolveTodayTravelDayCoach,
} from "@/lib/travelAssistant/homeTravelDayCoach";
import { buildMissionControlSnapshot } from "@/lib/travelAssistant/tripPhase";
import { buildHomeTodayCoach, homeTodayCoachNextAction } from "@/lib/travelAssistant/homeTodayCoach";
import { coverHopWithBookedFacts } from "@/lib/travelAssistant/bookedHopCoverage";
import { buildPlannedFlightLegs } from "@/lib/travelAssistant/tripPlanBooking";
import {
  BARI_VENICE_SEP_12_RESERVATIONS,
  BARI_VENICE_TRIP_ID,
  JEFFERY_PDF_FILENAME,
  STEPHANIE_PDF_FILENAME,
} from "@/lib/travelAssistant/fixtures/bariVeniceSep12Fixture";

const BARI_VENICE_SEP_12 = [...BARI_VENICE_SEP_12_RESERVATIONS];

const SEP_11_ROME_EVENING = Date.parse("2026-09-11T18:00:00Z");
const SEP_12_MORNING = Date.parse("2026-09-12T07:00:00Z");

test("G55: formatTravelDayFlightLead shows gospel Z84T4Z without invented flight number", () => {
  const lead = formatTravelDayFlightLead({
    id: "flight-bri-vce",
    confirmationCode: "Z84T4Z",
    flightDepartureAirport: "BRI",
    flightArrivalAirport: "VCE",
    flightDepartureTime: "2026-09-12 15:20",
    flightArrivalTime: "2026-09-12 18:25",
    flightArrivalTerminal: "1",
    flightConnectionStops: 1,
    provider: "ITA Airways",
  });
  assert.equal(
    lead,
    "Confirmation Z84T4Z · BRI → VCE · 3:20 PM–6:25 PM · 1 stop · VCE T1",
  );
});

test("G55: Sep 12 travel day coach surfaces both train legs then BRI flight", () => {
  const coach = buildHomeTravelDayCoach({
    reservations: BARI_VENICE_SEP_12,
    dateKey: "2026-09-12",
    timezone: "Europe/Rome",
    tripId: BARI_VENICE_TRIP_ID,
    nowMs: SEP_12_MORNING,
    flightLeaveByHint: "Leave for the airport by 12:20 PM (180 min before 3:20 PM departure — drive time not included)",
  });
  assert.ok(coach);
  assert.match(coach!.headline, /Travel day/i);
  assert.match(coach!.headline, /Venice|VCE/i);
  assert.doesNotMatch(coach!.headline, /fly to FCO|→ FCO/i);
  assert.doesNotMatch(coach!.headline, /Lecce/i);
  assert.equal(coach!.briAirportCoachSteps.length, 4);
  assert.match(coach!.leadDetail, /8312/i);
  assert.match(coach!.leadDetail, /91312|Regionale/i);
  assert.match(coach!.leadDetail, /BRI.*VCE|15:20|3:20/i);
  assert.equal(coach!.hasTrainBeforeFlight, true);
  assert.ok(coach!.airportTransferHint);
  assert.match(coach!.airportTransferHint!, /Bari Centrale/i);
  assert.match(coach!.airportTransferHint!, /BRI/i);
  assert.doesNotMatch(coach!.airportTransferHint!, /gate \d|platform \d/i);
  assert.equal(coach!.trainHandoffs.length, 2);
  assert.match(coach!.trainHandoffs[0]!.headline, /8312/i);
  assert.match(coach!.trainHandoffs[1]!.headline, /91312/i);
  assert.equal(coach!.trainHandoffs[0]!.passengerTickets.length, 2);
  assert.equal(coach!.trainHandoffs[1]!.passengerTickets.length, 2);
  assert.equal(coach!.flight?.confirmationCode, "Z84T4Z");
  assert.equal(coach!.flight?.flightNumber, undefined);
  assert.equal(coach!.flight?.flightConnectionStops, 1);
  const flightLead = formatTravelDayFlightLead(coach!.flight!);
  assert.match(flightLead, /Confirmation Z84T4Z/i);
  assert.match(flightLead, /BRI → VCE/i);
  assert.match(flightLead, /3:20 PM–6:25 PM|15:20–18:25/i);
  assert.match(flightLead, /1 stop/i);
  assert.match(flightLead, /VCE T1/i);
  assert.doesNotMatch(flightLead, /AZ1464/i);
  assert.doesNotMatch(flightLead, /\bAZ\d{3,4}\b/i);
  assert.match(coach!.trainHandoffs[0]!.passengerTickets[0]!.passengerName, /Stephanie/i);
  assert.match(coach!.trainHandoffs[0]!.passengerTickets[1]!.passengerName, /Jeffery/i);
  assert.match(coach!.trainHandoffs[0]!.passengerTickets[0]!.actionUrl, /passenger=stephanie/i);
  assert.match(coach!.trainHandoffs[0]!.passengerTickets[1]!.actionUrl, /passenger=jeffery/i);
  assert.match(coach!.leaveCue ?? "", /Train departs 9:35/i);
  assert.equal(coach!.briAirportCoachSteps.length, 4);
  assert.ok(coach!.walkthroughSteps.length >= 3);
  const walkText = [...coach!.briAirportCoachSteps, ...coach!.walkthroughSteps]
    .map((step) => `${step.title} ${step.detail}`)
    .join(" ");
  assert.match(walkText, /8312/i);
  assert.match(walkText, /After you alight at Bari Centrale/i);
  assert.match(walkText, /91312/i);
  assert.match(walkText, /FNB/i);
  assert.match(walkText, /Bari Aeroporto \/ Aeroporto K\.W\./i);
  assert.match(walkText, /~300 m tunnel into arrivals/i);
  assert.match(walkText, /Ferrotramviaria/i);
  assert.match(walkText, /Ground floor = arrivals/i);
  assert.match(walkText, /isole A\/B and C\/D/i);
  assert.match(walkText, /single acceptance area/i);
  assert.match(walkText, /Stephanie/i);
  assert.match(walkText, /Jeffery/i);
  assert.match(walkText, /BRI.*VCE/i);
  assert.match(walkText, /3:20 PM–6:25 PM|15:20/i);
  assert.match(walkText, /1 stop/i);
  assert.match(walkText, /VCE T1/i);
  assert.match(walkText, /Z84T4Z/i);
  assert.doesNotMatch(walkText, /AZ1464/i);
  assert.doesNotMatch(walkText, /\bAZ\d{3,4}\b/i);
  assert.doesNotMatch(walkText, /\bgate\s+[AB]\d{1,2}\b/i);
  assert.doesNotMatch(walkText, /ITA door/i);
});

test("G58: travel day coach surfaces tonight Airbnb with get-there cue", () => {
  const coach = buildHomeTravelDayCoach({
    reservations: BARI_VENICE_SEP_12,
    dateKey: "2026-09-12",
    timezone: "Europe/Rome",
    tripId: BARI_VENICE_TRIP_ID,
    nowMs: SEP_12_MORNING,
  });
  assert.ok(coach?.arrivalStay);
  assert.match(coach!.arrivalStay!.propertyName, /Venice Airbnb/i);
  assert.match(coach!.leadDetail, /Tonight: Venice Airbnb/i);
  assert.match(coach!.arrivalStay!.detail, /Venice/i);
  assert.ok(coach!.arrivalStay!.mapsUrl?.includes("google.com/maps"));
  const tonightStep = coach!.walkthroughSteps.find((step) => step.id === "tonight-stay");
  assert.ok(tonightStep);
  assert.match(tonightStep!.title, /Tonight/i);
});

test("G55: walkthrough order is 8312 → Centrale → 91312 → BRI coach (4) → ITA flight", () => {
  const coach = buildHomeTravelDayCoach({
    reservations: BARI_VENICE_SEP_12,
    dateKey: "2026-09-12",
    timezone: "Europe/Rome",
    tripId: BARI_VENICE_TRIP_ID,
    nowMs: SEP_12_MORNING,
  });
  assert.ok(coach);
  assert.equal(coach!.briAirportCoachSteps.length, 4);
  const itineraryTitles = coach!.walkthroughSteps.map((step) => step.title);
  const briTitles = coach!.briAirportCoachSteps.map((step) => step.title);
  const idx8312 = itineraryTitles.findIndex((title) => /8312/u.test(title));
  const idxCentrale = itineraryTitles.findIndex((title) => /After you alight/i.test(title));
  const idx91312 = itineraryTitles.findIndex((title) => /91312/u.test(title));
  const idxKwStop = briTitles.findIndex((title) => /Aeroporto K\.W\./i.test(title));
  const idxTunnel = briTitles.findIndex((title) => /tunnel into arrivals/i.test(title));
  const idxArrivals = briTitles.findIndex((title) => /Ground floor = arrivals/i.test(title));
  const idxCheckIn = briTitles.findIndex((title) => /isole A\/B and C\/D/i.test(title));
  const idxFlight = itineraryTitles.findIndex((title) => /BRI → VCE/u.test(title));
  assert.ok(idx8312 >= 0 && idxCentrale > idx8312);
  assert.ok(idx91312 > idxCentrale);
  assert.ok(idxKwStop >= 0);
  assert.ok(idxTunnel > idxKwStop);
  assert.ok(idxArrivals > idxTunnel);
  assert.ok(idxCheckIn > idxArrivals);
  assert.ok(idxFlight > idx91312);
  const idxTonight = itineraryTitles.findIndex((title) => /Tonight/i.test(title));
  assert.ok(idxTonight > idxFlight);
  assert.equal(idxTonight, coach!.walkthroughSteps.length - 1);
});

test("buildTravelDayWalkthroughSteps lists both passengers on train legs", () => {
  const coach = buildHomeTravelDayCoach({
    reservations: BARI_VENICE_SEP_12,
    dateKey: "2026-09-12",
    timezone: "Europe/Rome",
    tripId: BARI_VENICE_TRIP_ID,
  });
  assert.ok(coach);
  const steps = buildTravelDayWalkthroughSteps({
    trains: BARI_VENICE_SEP_12.filter((row) => row.type === "train") as never[],
    trainHandoffs: coach!.trainHandoffs,
    flight: coach!.flight,
  });
  const trainSteps = steps.filter((step) => /8312|91312/u.test(step.title));
  assert.equal(trainSteps.length, 2);
  assert.match(trainSteps[0]!.detail, /Stephanie/i);
  assert.match(trainSteps[0]!.detail, /Jeffery/i);
});

test("G55: stored source text includes both passenger PDF sections", () => {
  const train = BARI_VENICE_SEP_12.find((row) => row.id === "train-fa8312-lecce-bari");
  assert.ok(train?.originalEmailText);
  assert.match(train!.originalEmailText!, new RegExp(STEPHANIE_PDF_FILENAME.replace(".", "\\."), "u"));
  assert.match(train!.originalEmailText!, new RegExp(JEFFERY_PDF_FILENAME.replace(".", "\\."), "u"));
});

test("G55: Sep 11 evening previews tomorrow travel day (not generic mid-stay only)", () => {
  const tomorrow = resolveTomorrowTravelDayCoach({
    reservations: BARI_VENICE_SEP_12,
    nowMs: SEP_11_ROME_EVENING,
    timezone: "Europe/Rome",
    tripId: BARI_VENICE_TRIP_ID,
  });
  assert.ok(tomorrow);
  assert.equal(tomorrow!.dateKey, "2026-09-12");
  assert.match(tomorrow!.headline, /Travel day/i);

  const midStay = buildHomeTodayCoach({
    reservations: BARI_VENICE_SEP_12,
    nowMs: SEP_11_ROME_EVENING,
    timezone: "Europe/Rome",
  });
  assert.ok(midStay);
  assert.match(midStay!.leadTitle, /Lecce/i);
  assert.ok(midStay!.nextTravelMove);
  assert.equal(midStay!.nextTravelMove!.dateKey, "2026-09-12");
  assert.match(midStay!.nextTravelMove!.headline, /Lecce.*Bari/i);
});

test("G55: travel day ticket-first next action opens stored PDF for first leg", () => {
  const coach = resolveTodayTravelDayCoach({
    reservations: BARI_VENICE_SEP_12,
    nowMs: SEP_12_MORNING,
    timezone: "Europe/Rome",
    tripId: BARI_VENICE_TRIP_ID,
  });
  assert.ok(coach);
  const next = homeTravelDayCoachNextAction(coach!);
  assert.equal(next.ctaLabel, "Train tickets");
  assert.ok(next.prepHref);
  assert.match(next.prepHref!, /source-view/u);
});

test("G55: mid-stay vs travel-day — Sep 6 Monopoli is not travel day", () => {
  const reservations = BARI_VENICE_SEP_12.filter(
    (row) => !["train-fa8312-lecce-bari", "train-reg91312-bari-airport", "flight-bri-vce"].includes(row.id),
  );
  assert.equal(dayHasBookedTravelMoves(reservations, "2026-09-12"), false);
  assert.equal(
    buildHomeTravelDayCoach({ reservations, dateKey: "2026-09-12", timezone: "Europe/Rome" }),
    null,
  );
});

test("G55: mission phase is departure_day on Sep 12 BRI→VCE with Europe/Rome today", () => {
  const phase = detectMissionPhase(
    {
      reservations: BARI_VENICE_SEP_12,
      travelerTimezone: "Europe/Rome",
      hasActiveTrip: true,
      name: "Europe 2026",
    },
    SEP_12_MORNING,
  );
  assert.equal(phase, "departure_day");
});

test("G55: train + BRI flight covers Lecce→Venice connector hop", () => {
  const legs = buildPlannedFlightLegs(
    null,
    [],
    [
      { stop: { name: "Lecce, Italy" }, checkIn: "2026-09-08", checkOut: "2026-09-12", nights: 4 },
      { stop: { name: "Venice" }, checkIn: "2026-09-12", checkOut: "2026-09-15", nights: 3 },
    ],
    {},
    "2026-09-01",
    "2026-09-28",
  );
  const hop = legs.find(
    (leg) => leg.role === "connector" && /lecce/i.test(leg.fromLabel) && /venice/i.test(leg.toLabel),
  );
  assert.ok(hop);
  const coverage = coverHopWithBookedFacts(
    hop!,
    [
      {
        id: "flight-bri-vce",
        flightDepartureAirport: "BRI",
        flightArrivalAirport: "VCE",
        flightDate: "2026-09-12",
        localTime: "2026-09-12 15:20",
      },
    ],
    [
      {
        id: "train-fa8312-lecce-bari",
        type: "train",
        title: "Frecciargento 8312",
        location: "Lecce → Bari Centrale",
        provider: "Trenitalia",
        localTime: "2026-09-12 09:35",
        confirmationCode: "J7HBM5",
      },
      {
        id: "train-reg91312-bari-airport",
        type: "train",
        title: "Regionale 91312",
        location: "Bari Centrale FNB → Bari Aeroporto",
        provider: "Trenitalia",
        localTime: "2026-09-12 11:20",
        confirmationCode: "J7HBM5",
      },
    ],
  );
  assert.equal(coverage.covered, true);
});

test("buildBriAirportTransferHint stays honest — no invented gate", () => {
  const hint = buildBriAirportTransferHint({ trainArrivesBari: true, flightFromBri: true });
  assert.ok(hint);
  assert.match(hint!, /does not have verified BRI/i);
  assert.doesNotMatch(hint!, /\bgate\s+[A-Z]\d{1,2}\b/i);
});

test("G55: hasActiveTravelDayCoach true on Sep 12 even when next remaining flight is later connector", () => {
  const nowMs = SEP_12_MORNING;
  const reservations = [
    ...BARI_VENICE_SEP_12,
    {
      id: "az1616-connector",
      type: "flight",
      title: "ITA AZ1616",
      provider: "ITA Airways",
      localTime: "2026-09-14 10:00",
      timezone: "Europe/Rome",
      flightDepartureAirport: "BRI",
      flightArrivalAirport: "FCO",
      flightDepartureTime: "2026-09-14 10:00",
      flightNumber: "AZ1616",
      flightDate: "2026-09-14",
    },
  ];
  assert.equal(
    hasActiveTravelDayCoach({
      reservations,
      nowMs,
      timezone: "Europe/Rome",
      tripId: BARI_VENICE_TRIP_ID,
    }),
    true,
  );
  const snap = buildMissionControlSnapshot(
    {
      name: "Europe 2026",
      startDate: "2026-09-01",
      endDate: "2026-09-28",
      reservations,
      travelerTimezone: "Europe/Rome",
      hasActiveTrip: true,
    },
    nowMs,
  );
  assert.equal(snap.phase, "departure_day");
  assert.equal(snap.nextFlight?.id, "flight-bri-vce");
});

test("G55: mid-stay next action still uses next travel day coach on Sep 11", () => {
  const coach = buildHomeTodayCoach({
    reservations: BARI_VENICE_SEP_12,
    nowMs: SEP_11_ROME_EVENING,
    timezone: "Europe/Rome",
  });
  assert.ok(coach?.nextTravelMove);
  const next = homeTodayCoachNextAction(coach!, {
    hasTrainTicketHandoff: true,
    ticketUrl: `/api/reservations/source-view?tripId=${BARI_VENICE_TRIP_ID}&reservationId=train-fa8312-lecce-bari`,
  });
  assert.equal(next.ctaLabel, "Train tickets");
  assert.match(next.title, /Sep 12/i);
});
