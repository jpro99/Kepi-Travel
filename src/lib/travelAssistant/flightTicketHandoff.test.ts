import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPassengerTicketSourceLinks,
} from "@/lib/travelAssistant/railPassengerTicketLinks";
import {
  BARI_VENICE_PDF_ATTACHMENTS,
  BARI_VENICE_TRIP_ID,
} from "@/lib/travelAssistant/fixtures/bariVeniceSep12Fixture";
import {
  buildFlightTicketHandoffContent,
  flightReservationHasStoredTicketArtifact,
  isBookedFlightTicketReservation,
  resolveFlightTicketOpenTarget,
} from "@/lib/travelAssistant/flightTicketHandoff";

const Z84T4Z_FLIGHT = {
  id: "flight-bri-vce",
  type: "flight",
  title: "ITA Airways",
  provider: "ITA Airways",
  confirmationCode: "Z84T4Z",
  localTime: "2026-09-12 15:20",
  flightDate: "2026-09-12",
  flightDepartureTime: "2026-09-12 15:20",
  flightArrivalTime: "2026-09-12 18:25",
  flightDepartureAirport: "BRI",
  flightArrivalAirport: "VCE",
  flightArrivalTerminal: "1",
  flightConnectionStops: 1,
  timezone: "Europe/Rome",
};

test("isBookedFlightTicketReservation accepts gospel Z84T4Z without flight number", () => {
  assert.equal(isBookedFlightTicketReservation(Z84T4Z_FLIGHT), true);
});

test("buildFlightTicketHandoffContent returns null when no stored artifacts (gospel Z84T4Z)", () => {
  const content = buildFlightTicketHandoffContent(Z84T4Z_FLIGHT, BARI_VENICE_TRIP_ID);
  assert.equal(content, null);
  assert.equal(flightReservationHasStoredTicketArtifact(Z84T4Z_FLIGHT, BARI_VENICE_TRIP_ID), false);
});

test("buildFlightTicketHandoffContent surfaces both-pax boarding passes from named PDF sourceLinks", () => {
  const passengerLinks = buildPassengerTicketSourceLinks({
    pdfAttachments: BARI_VENICE_PDF_ATTACHMENTS,
    tripId: BARI_VENICE_TRIP_ID,
    reservationId: "flight-bri-vce",
  });
  const content = buildFlightTicketHandoffContent(
    {
      ...Z84T4Z_FLIGHT,
      hasPdfAttachment: true,
      originalEmailText: "ITA Airways boarding pass Z84T4Z",
      sourceLinks: passengerLinks,
    },
    BARI_VENICE_TRIP_ID,
  );
  assert.ok(content);
  assert.match(content!.headline, /Z84T4Z/i);
  assert.match(content!.headline, /BRI → VCE/i);
  assert.doesNotMatch(content!.headline, /AZ1464/i);
  assert.equal(content!.passengerTickets.length, 2);
  assert.match(content!.passengerTickets[0]!.passengerName, /Stephanie/i);
  assert.match(content!.passengerTickets[1]!.passengerName, /Jeffery/i);
  assert.match(content!.passengerTickets[0]!.actionUrl, /passenger=stephanie/i);
  assert.match(content!.passengerTickets[1]!.actionUrl, /passenger=jeffery/i);
  assert.match(content!.honestyNote, /stored boarding-pass PDF|Kepi/i);
});

test("resolveFlightTicketOpenTarget prefers in-app source-view when PDF on file", () => {
  const target = resolveFlightTicketOpenTarget(
    {
      ...Z84T4Z_FLIGHT,
      hasPdfAttachment: true,
      originalEmailText: "ITA Airways Z84T4Z",
    },
    BARI_VENICE_TRIP_ID,
  );
  assert.match(target?.url ?? "", /\/api\/reservations\/source-view\?/u);
  assert.equal(target?.isExternal, false);
  assert.equal(target?.label, "Boarding passes");
});

test("resolveFlightTicketOpenTarget uses external boarding pass URL when no stored artifact", () => {
  const target = resolveFlightTicketOpenTarget({
    ...Z84T4Z_FLIGHT,
    boardingPassUrl: "https://www.ita-airways.com/boarding/example",
  });
  assert.equal(target?.url, "https://www.ita-airways.com/boarding/example");
  assert.equal(target?.isExternal, true);
});
