import test from "node:test";
import assert from "node:assert/strict";
import { countPlaceholderReservations, isPlaceholderConfirmation } from "@/lib/travelAssistant/placeholderReservations";

test("isPlaceholderConfirmation detects planning stubs", () => {
  assert.equal(isPlaceholderConfirmation("PENDING"), true);
  assert.equal(isPlaceholderConfirmation("selected"), true);
  assert.equal(isPlaceholderConfirmation("ABC123"), false);
  assert.equal(isPlaceholderConfirmation(""), true);
});

test("countPlaceholderReservations ignores confirmed bookings", () => {
  const count = countPlaceholderReservations([
    { type: "flight", confirmationCode: "PENDING" },
    { type: "hotel", confirmationCode: "SELECTED" },
    { type: "flight", confirmationCode: "AS832" },
    { type: "train", confirmationCode: "PENDING" },
  ]);
  assert.equal(count, 2);
});
