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

test("isAdminUserId keeps legacy dev id 1", () => {
  const previous = process.env.ADMIN_USER_IDS;
  resetAdminUserIdsCacheForTests();
  delete process.env.ADMIN_USER_IDS;
  try {
    assert.equal(isAdminUserId("1"), true);
  } finally {
    process.env.ADMIN_USER_IDS = previous;
    resetAdminUserIdsCacheForTests();
  }
});
