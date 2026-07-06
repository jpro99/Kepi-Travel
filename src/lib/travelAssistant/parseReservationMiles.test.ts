import test from "node:test";
import assert from "node:assert/strict";
import { parseMilesFromText, resolvePricingNearBooking } from "@/lib/travelAssistant/parseReservationMiles";

test("parseMilesFromText reads Volare points spent", () => {
  const text = `
    ITA Airways confirmation Z84T4Z
    Punti Volare utilizzati: 12.500
    Totale EUR 45,60
  `;
  const parsed = parseMilesFromText(text);
  assert.equal(parsed.milesSpent, 12500);
  assert.equal(parsed.program, "Volare");
});

test("resolvePricingNearBooking scopes pricing to confirmation code window", () => {
  const first = resolvePricingNearBooking({
    originalEmailText: `
      Confirmation EFLQKE AZ 1607 FCO-BRI
      Punti utilizzati 8.000
      Totale EUR 72,30
    `,
    confirmationCode: "EFLQKE",
    flightNumber: "AZ1607",
  });
  const second = resolvePricingNearBooking({
    originalEmailText: `
      Confirmation Z84T4Z AZ 1616 BRI-VCE
      Punti utilizzati 15.000
      Totale EUR 54,10
    `,
    confirmationCode: "Z84T4Z",
    flightNumber: "AZ1616",
  });
  assert.equal(first.milesSpent, 8000);
  assert.equal(second.milesSpent, 15000);
});
