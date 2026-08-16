import assert from "node:assert/strict";
import test from "node:test";
import { pickHomeNextAction } from "./homeNextAction";
import {
  REVIEW_INBOX_HONEST_DETAIL,
  isHonestReviewCta,
  presentReviewInboxItem,
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

test("G27: a new leftover tells the real parser reason", () => {
  const presented = presentReviewInboxItem(
    {
      id: "review-new",
      reasons: ["Missing check-in time or location."],
      draft: {
        type: "hotel",
        title: "Unknown stay",
        provider: "Hotel",
        localTime: "",
        location: "",
        confirmationCode: "",
      },
    },
    [],
  );
  assert.equal(presented.alreadyOnTrip, false);
  assert.equal(presented.why, "Missing check-in time or location.");
  assert.equal(presented.confirmation, "No confirmation code yet");
});
