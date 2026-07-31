import assert from "node:assert/strict";
import test from "node:test";
import { shouldSkipWebhookSignatureVerification } from "./emailForwardWebhookAuth";

test("F12: production never skips when RESEND_WEBHOOK_SECRET is unset", () => {
  assert.equal(
    shouldSkipWebhookSignatureVerification({
      resendWebhookSecret: "",
      vercelEnv: "production",
      nodeEnv: "production",
    }),
    false,
  );
});

test("F12: local/dev may skip when secret is unset", () => {
  assert.equal(
    shouldSkipWebhookSignatureVerification({
      resendWebhookSecret: "",
      vercelEnv: "development",
      nodeEnv: "development",
    }),
    true,
  );
});

test("F12: never skips when secret is present", () => {
  assert.equal(
    shouldSkipWebhookSignatureVerification({
      resendWebhookSecret: "whsec_test",
      vercelEnv: "production",
      nodeEnv: "production",
    }),
    false,
  );
});
