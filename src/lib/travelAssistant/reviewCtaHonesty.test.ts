import assert from "node:assert/strict";
import test from "node:test";
import { pickHomeNextAction } from "./homeNextAction";
import {
  REVIEW_INBOX_HONEST_DETAIL,
  isHonestReviewCta,
  presentReviewInboxItem,
  shouldAutoResolveReviewLeftover,
} from "./reviewCtaHonesty";

test("G27: session flag with no sheet is a ghost; a mounted sheet is honest", () => {
  assert.equal(
    isHonestReviewCta({ unresolvedReviewCount: 6, surface: "session-flag-only" }),
    false,
  );
  assert.equal(isHonestReviewCta({ unresolvedReviewCount: 6, surface: "none" }), false);
  assert.equal(isHonestReviewCta({ unresolvedReviewCount: 6, surface: "review-sheet" }), true);
  assert.equal(isHonestReviewCta({ unresolvedReviewCount: 6, surface: "review-drawer" }), true);
  assert.equal(isHonestReviewCta({ unresolvedReviewCount: 0, surface: "none" }), true);
});

test("G27: Home review copy does not pretend leftovers are missing from the trip", () => {
  const next = pickHomeNextAction({
    attentionTop3: [],
    unresolvedReviewCount: 6,
  });
  assert.equal(next.kind, "review");
  assert.equal(next.detail, REVIEW_INBOX_HONEST_DETAIL);
  assert.equal(next.detail?.includes("show up on your trip timeline"), false);
});

test("G27: duplicate confirmation is presented as already on the trip", () => {
  const presented = presentReviewInboxItem(
    {
      id: "review-hotel",
      reasons: ["Low parsing confidence (32/100)."],
      draft: {
        type: "hotel",
        title: "A Casa di Elena",
        provider: "Booking.com",
        localTime: "2026-09-02",
        location: "Polignano a Mare",
        confirmationCode: "ELENA-1",
      },
    },
    [
      {
        type: "hotel",
        title: "A Casa di Elena",
        provider: "Booking.com",
        localTime: "2026-09-02",
        location: "Polignano a Mare",
        confirmationCode: "ELENA-1",
      },
    ],
  );
  assert.equal(presented.alreadyOnTrip, true);
  assert.match(presented.why, /already on your trip/u);
  assert.equal(presented.headline, "A Casa di Elena");
});

test("G27: a leftover with facts tells the real parser reason", () => {
  const presented = presentReviewInboxItem(
    {
      id: "review-new",
      reasons: ["Low parsing confidence (32/100)."],
      draft: {
        type: "hotel",
        title: "Unknown stay",
        provider: "Hotel",
        localTime: "2026-09-04",
        location: "Monopoli",
        confirmationCode: "",
      },
    },
    [],
  );
  assert.equal(presented.alreadyOnTrip, false);
  assert.equal(presented.why, "Low parsing confidence (32/100).");
  assert.equal(presented.when, "Fri, Sep 4");
  assert.equal(presented.where, "Monopoli");
  assert.equal(presented.canAddToTrip, true);
});

test("G27: empty leftover shows the original forward and does not offer Add", () => {
  const presented = presentReviewInboxItem(
    {
      id: "review-train",
      reasons: ["Low parsing confidence (0/100)."],
      sourceEmailSubject: "Trenitalia ticket Lecce – Venezia S. Lucia",
      originalEmailText: "Venezia S. Lucia  13/09/2026  10:42\nLecce  06:20",
      hasPdfAttachment: true,
      parseConfidenceScore: 0,
      draft: {
        type: "train",
        title: "Train tickets",
        provider: "",
        localTime: "",
        location: "",
        confirmationCode: "",
      },
    },
    [
      {
        type: "train",
        title: "Lecce → Venezia S. Lucia",
        provider: "Trenitalia",
        localTime: "2026-09-13 06:20",
        location: "Venezia S. Lucia",
        confirmationCode: "TICKET-1",
      },
    ],
  );
  assert.equal(presented.canAddToTrip, false);
  assert.equal(presented.alreadyOnTrip, true);
  assert.equal(presented.when, "Sun, Sep 13 · 06:20");
  assert.equal(presented.where, "Lecce → Venezia S. Lucia");
  assert.ok(presented.sourceBody?.includes("Venezia S. Lucia"));
  assert.equal(presented.sourceSubject, "Trenitalia ticket Lecce – Venezia S. Lucia");
  assert.match(presented.why, /already on your trip/u);
  assert.equal(presented.liveHints.length, 1);
  assert.match(presented.liveHints[0] ?? "", /Lecce/u);
});

test("G27: leftover with no readable facts still hides Add", () => {
  const presented = presentReviewInboxItem(
    {
      id: "review-empty",
      reasons: ["Low parsing confidence (0/100)."],
      sourceEmailSubject: "Fwd: hello",
      originalEmailText: "Thanks for forwarding this.",
      draft: {
        type: "train",
        title: "Train tickets",
        provider: "",
        localTime: "",
        location: "",
        confirmationCode: "",
      },
    },
    [],
  );
  assert.equal(presented.canAddToTrip, false);
  assert.equal(presented.when, null);
  assert.match(presented.why, /could not read a date/u);
});

const gygLegalPdf = `--- PDF attachment ---

Legal Notice
Privacy Policy
General Terms and Conditions
Version 1. Oct. 2025
Please review this booking reference on getyourguide.com.
`;

test("G28: GetYourGuide ticket-terms PDF matches booking ID and does not offer Add", () => {
  const presented = presentReviewInboxItem(
    {
      id: "review-gyg",
      reasons: ["Low parsing confidence (19/100)."],
      sourceEmailSubject: "Fwd: Booking GYGVN24XVY58 confirmed | Ticket instructions",
      originalEmailText: gygLegalPdf,
      hasPdfAttachment: true,
      parseConfidenceScore: 19,
      draft: {
        type: "flight",
        title: "Fwd: Booking GYGVN24XVY58 confirmed | Ticket instructions",
        provider: "",
        localTime: "",
        location: "",
        confirmationCode: "ERENCE",
      },
    },
    [
      {
        type: "dinner",
        title: "Boat tour",
        provider: "GetYourGuide",
        localTime: "2026-09-03 10:00",
        location: "Monopoli Harbor",
        confirmationCode: "GYGVN24XVY58",
      },
      {
        type: "flight",
        title: "AZ1467 FCO → VCE",
        provider: "ITA",
        localTime: "2026-09-12 17:20",
        location: "VCE",
        confirmationCode: "AZ1467",
      },
    ],
  );
  assert.equal(presented.alreadyOnTrip, true);
  assert.equal(presented.canAddToTrip, false);
  assert.equal(presented.confirmation, "GYGVN24XVY58");
  assert.equal(presented.sourceKind, "legal-terms");
  assert.equal(presented.sourceBody, null);
  assert.equal(presented.autoResolve, "already-on-trip");
  assert.equal(shouldAutoResolveReviewLeftover(presented), true);
  assert.equal(presented.liveHints.length, 1);
  assert.match(presented.liveHints[0] ?? "", /Boat tour/u);
  assert.doesNotMatch(presented.headline, /Fwd:/u);
});

test("G28: legal-only GetYourGuide PDF without a live match still does not offer Add", () => {
  const presented = presentReviewInboxItem(
    {
      id: "review-gyg-new",
      reasons: ["Low parsing confidence (19/100)."],
      sourceEmailSubject: "Fwd: Booking GYGVN24XVY58 confirmed | Ticket instructions",
      originalEmailText: gygLegalPdf,
      hasPdfAttachment: true,
      draft: {
        type: "flight",
        title: "Fwd: Booking GYGVN24XVY58 confirmed | Ticket instructions",
        provider: "",
        localTime: "",
        location: "",
        confirmationCode: "ERENCE",
      },
    },
    [],
  );
  assert.equal(presented.alreadyOnTrip, false);
  assert.equal(presented.canAddToTrip, false);
  assert.equal(presented.sourceKind, "legal-terms");
  assert.equal(presented.autoResolve, "legal-terms");
  assert.match(presented.why, /ticket terms/u);
  assert.equal(presented.confirmation, "GYGVN24XVY58");
});

test("G28: leftover titled damage with legal location still auto-resolves and never offers Add", () => {
  const presented = presentReviewInboxItem(
    {
      id: "review-gyg-damage",
      reasons: ["Low parsing confidence (19/100)."],
      sourceEmailSubject: "Fwd: Booking GYGVN24XVY58 confirmed | Ticket instructions",
      originalEmailText: `${gygLegalPdf}\nyou may create a GetYourGuide Account using your existing social media`,
      hasPdfAttachment: true,
      draft: {
        type: "flight",
        title: "damage",
        provider: "",
        localTime: "2025-10-01 12:00",
        location: "you may create a GetYourGuide Account using your existing social media",
        confirmationCode: "GYGVN24XVY58",
      },
    },
    [],
  );
  assert.equal(presented.canAddToTrip, false);
  assert.equal(presented.sourceKind, "legal-terms");
  assert.equal(presented.autoResolve, "legal-terms");
  assert.equal(shouldAutoResolveReviewLeftover(presented), true);
  assert.notEqual(presented.headline.toLowerCase(), "damage");
  assert.equal(presented.when, null);
  assert.equal(presented.where, null);
});
