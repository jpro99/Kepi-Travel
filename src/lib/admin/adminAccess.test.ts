import test from "node:test";
import assert from "node:assert/strict";
import { isAdminUserId, resetAdminUserIdsCacheForTests } from "./adminAccess";

test("isAdminUserId reads ADMIN_USER_IDS from env", () => {
  const previous = process.env.ADMIN_USER_IDS;
  resetAdminUserIdsCacheForTests();
  process.env.ADMIN_USER_IDS = "user_clerk_abc,user_clerk_xyz";
  try {
    assert.equal(isAdminUserId("user_clerk_abc"), true);
    assert.equal(isAdminUserId("user_clerk_xyz"), true);
    assert.equal(isAdminUserId("user_random"), false);
    assert.equal(isAdminUserId(null), false);
  } finally {
    process.env.ADMIN_USER_IDS = previous;
    resetAdminUserIdsCacheForTests();
  }
});

// Regression lock for the fix that removed the unconditional `ids.add("1")`
// admin backdoor: user id "1" must NOT be treated as admin, even with no
// ADMIN_USER_IDS configured. Previously this test asserted the opposite
// (that "1" was always an admin) — that was the vulnerability, not a law to
// preserve. See adminAccess.ts.
test("isAdminUserId does not grant admin to legacy dev id 1", () => {
  const previous = process.env.ADMIN_USER_IDS;
  resetAdminUserIdsCacheForTests();
  delete process.env.ADMIN_USER_IDS;
  try {
    assert.equal(isAdminUserId("1"), false);
  } finally {
    process.env.ADMIN_USER_IDS = previous;
    resetAdminUserIdsCacheForTests();
  }
});
