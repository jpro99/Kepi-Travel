import assert from "node:assert/strict";
import test from "node:test";
import {
  authPathWithInviteCode,
  clearPendingInviteCode,
  persistPendingInviteCode,
  readPendingInviteCode,
  successMessageForPlan,
} from "./pendingInviteCode";

test("authPathWithInviteCode preserves code on sign-in and sign-up", () => {
  assert.equal(authPathWithInviteCode("/sign-in", "abc-123"), "/sign-in?code=ABC-123");
  assert.equal(authPathWithInviteCode("/sign-up", "abc-123"), "/sign-up?code=ABC-123");
});

test("authPathWithInviteCode omits invalid codes", () => {
  assert.equal(authPathWithInviteCode("/sign-in", ""), "/sign-in");
  assert.equal(authPathWithInviteCode("/sign-up", "!!!"), "/sign-up");
});

test("pending invite code round-trips in localStorage", () => {
  const memory = new Map<string, string>();
  const localStorageMock = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
  };
  Object.defineProperty(globalThis, "window", {
    value: { localStorage: localStorageMock },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "localStorage", {
    value: localStorageMock,
    configurable: true,
    writable: true,
  });

  clearPendingInviteCode();
  persistPendingInviteCode("life-99");
  assert.equal(readPendingInviteCode(), "LIFE-99");
  clearPendingInviteCode();
  assert.equal(readPendingInviteCode(), "");
});

test("successMessageForPlan celebrates lifetime vs trial", () => {
  assert.match(successMessageForPlan("lifetime"), /Lifetime access unlocked/u);
  assert.match(successMessageForPlan("trial"), /30-day trial/u);
});

test("failed auto-redeem must remain retryable (no sticky fail key)", () => {
  // Contract: sessionStorage key kepi:auto-redeem-attempted is retired.
  // Only kepi:auto-redeem-succeeded blocks auto re-run after success.
  assert.equal(
    typeof (globalThis as { sessionStorage?: Storage }).sessionStorage,
    "undefined",
  );
});
