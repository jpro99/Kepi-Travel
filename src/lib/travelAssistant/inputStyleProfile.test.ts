import assert from "node:assert/strict";
import test from "node:test";
import {
  INPUT_STYLE_MIN_ATTEMPTS,
  recordInputStyleEvent,
  suggestInputStyleShortcut,
} from "@/lib/travelAssistant/inputStyleProfile";

test("suggestInputStyleShortcut requires minimum evidence before offering a shortcut", () => {
  let profile = recordInputStyleEvent(undefined, { channel: "email-forward", corrected: false });
  profile = recordInputStyleEvent(profile, { channel: "email-forward", corrected: false });
  assert.equal(suggestInputStyleShortcut(profile), null);
  profile = recordInputStyleEvent(profile, { channel: "email-forward", corrected: false });
  const suggestion = suggestInputStyleShortcut(profile);
  assert.ok(suggestion);
  assert.equal(suggestion?.channel, "email-forward");
  assert.ok(suggestion?.message.includes("forward"));
});

test("high correction rate channels do not produce silent personalization", () => {
  let profile = recordInputStyleEvent(undefined, { channel: "manual", corrected: true });
  for (let index = 0; index < INPUT_STYLE_MIN_ATTEMPTS; index += 1) {
    profile = recordInputStyleEvent(profile, { channel: "manual", corrected: true });
  }
  assert.equal(suggestInputStyleShortcut(profile), null);
});
