import assert from "node:assert/strict";
import test from "node:test";
import {
  extractActivityBookingCode,
  extractActivityTicketFacts,
  isGarbageConfirmationCode,
  isGarbageLeftoverTitle,
  isLegalBoilerplateText,
  isTicketInstructionsLeftover,
  stripLegalBoilerplate,
} from "./activityTicketExtract";

const gygLegalPdf = `
--- PDF attachment ---

Legal Notice
Privacy Policy
General Terms and Conditions
Version 1. Oct. 2025

These terms apply to users in the USA, Switzerland, and Canada.
Please review this booking reference on getyourguide.com.
`;

test("I59: Booking GYGVN24XVY58 is the confirmation, not ERENCE from reference", () => {
  assert.equal(
    extractActivityBookingCode("Fwd: Booking GYGVN24XVY58 confirmed | Ticket instructions", gygLegalPdf),
    "GYGVN24XVY58",
  );
  assert.equal(isGarbageConfirmationCode("ERENCE"), true);
  assert.equal(isGarbageConfirmationCode("REFERENCE"), true);
  assert.equal(isGarbageConfirmationCode("GYGVN24XVY58"), false);
});

test("I59: GetYourGuide ticket-instructions PDF is legal terms, not a tour", () => {
  assert.equal(isLegalBoilerplateText(gygLegalPdf), true);
  assert.equal(stripLegalBoilerplate(gygLegalPdf).includes("Privacy Policy"), false);
  const facts = extractActivityTicketFacts(
    gygLegalPdf,
    "Fwd: Booking GYGVN24XVY58 confirmed | Ticket instructions",
  );
  assert.ok(facts);
  assert.equal(facts?.type, "dinner");
  assert.equal(facts?.provider, "GetYourGuide");
  assert.equal(facts?.confirmationCode, "GYGVN24XVY58");
});

test("I59: a real GetYourGuide tour body is not treated as legal-only", () => {
  const body = `
GetYourGuide
Sunset Boat Excursion
Saturday, September 3, 2026 at 10:00 AM
Meet at Monopoli Harbor
Confirmation GYGVN24XVY58
`;
  assert.equal(isLegalBoilerplateText(body), false);
  const facts = extractActivityTicketFacts(body, "Booking GYGVN24XVY58 confirmed");
  assert.equal(facts?.confirmationCode, "GYGVN24XVY58");
});

test("G28: Ticket instructions subject is a leftover the traveler must not see", () => {
  assert.equal(
    isTicketInstructionsLeftover(
      "Fwd: Booking GYGVN24XVY58 confirmed | Ticket instructions",
      "you may create a GetYourGuide Account using your existing social media",
    ),
    true,
  );
  assert.equal(isGarbageLeftoverTitle("damage"), true);
  assert.equal(isGarbageLeftoverTitle("GetYourGuide · GYGVN24XVY58"), false);
});
