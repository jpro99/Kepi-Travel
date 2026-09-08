import assert from "node:assert/strict";
import test from "node:test";
import {
  SUPPORT_CHAT_PANEL_Z_CLASS,
  SUPPORT_CHAT_STATE_EVENT,
} from "@/components/support/SupportChat";

test("support chat panel stacks above mobile tab bar (z-[99999])", () => {
  assert.match(SUPPORT_CHAT_PANEL_Z_CLASS, /z-\[100010\]/);
});

test("support chat open state event is stable for tab-bar suppression", () => {
  assert.equal(SUPPORT_CHAT_STATE_EVENT, "kepi:support-chat-state");
});
