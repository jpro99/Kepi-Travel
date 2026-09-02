import test from "node:test";
import assert from "node:assert/strict";
import { SUPPORT_TICKET_SCAN_EVENT } from "./supportChatEvents";

test("SUPPORT_TICKET_SCAN_EVENT is stable for travel shell listener", () => {
  assert.equal(SUPPORT_TICKET_SCAN_EVENT, "kepi:support-ticket-scan");
});
