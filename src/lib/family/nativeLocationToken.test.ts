import assert from "node:assert/strict";
import test from "node:test";
import {
  readBearerToken,
  signNativeLocationToken,
  verifyNativeLocationToken,
} from "./nativeLocationToken";

test("M20 native location token signs and verifies", () => {
  process.env.FAMILY_LOCATION_TOKEN_SECRET = "test-family-location-hmac-secret";
  const token = signNativeLocationToken({ userId: "user_1", ownerId: "owner_1", nowSec: 1_700_000_000 });
  const payload = verifyNativeLocationToken(token, 1_700_000_000);
  assert.equal(payload?.userId, "user_1");
  assert.equal(payload?.ownerId, "owner_1");
  assert.equal(verifyNativeLocationToken(token, 1_700_000_000 + 91 * 24 * 60 * 60), null);
  assert.equal(verifyNativeLocationToken("nope", 1_700_000_000), null);
  assert.equal(readBearerToken("Bearer abc"), "abc");
  assert.equal(readBearerToken("Token abc"), null);
});
