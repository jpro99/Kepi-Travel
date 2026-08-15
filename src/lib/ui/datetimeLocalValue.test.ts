import assert from "node:assert/strict";
import test from "node:test";
import { fromDatetimeLocalValue, toDatetimeLocalValue } from "@/lib/ui/datetimeLocalValue";

test("toDatetimeLocalValue converts stored space format for datetime-local", () => {
  assert.equal(toDatetimeLocalValue("2026-09-12 09:40"), "2026-09-12T09:40");
  assert.equal(toDatetimeLocalValue("2026-09-12T09:40"), "2026-09-12T09:40");
  assert.equal(toDatetimeLocalValue(""), "");
  assert.equal(toDatetimeLocalValue("   "), "");
  assert.equal(toDatetimeLocalValue("not-a-date"), "");
});

test("fromDatetimeLocalValue stores datetime-local as YYYY-MM-DD HH:MM", () => {
  assert.equal(fromDatetimeLocalValue("2026-09-12T09:40"), "2026-09-12 09:40");
  assert.equal(fromDatetimeLocalValue(""), "");
});

test("datetime-local helpers round-trip", () => {
  const stored = "2026-09-12 09:40";
  assert.equal(fromDatetimeLocalValue(toDatetimeLocalValue(stored)), stored);
});
