import assert from "node:assert/strict";
import test from "node:test";
import {
  MOBILE_TAB_BAR_Z_INDEX,
  SUPPORT_CHAT_Z_INDEX,
} from "@/lib/support/supportChatShell";

test("G61 — support chat z-index stays above mobile tab bar", () => {
  assert.ok(
    SUPPORT_CHAT_Z_INDEX > MOBILE_TAB_BAR_Z_INDEX,
    "help input must not sit under the portaled tab bar",
  );
});
