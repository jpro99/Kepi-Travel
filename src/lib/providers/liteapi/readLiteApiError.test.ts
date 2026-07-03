import test from "node:test";
import assert from "node:assert/strict";
import { readLiteApiErrorMessage } from "@/lib/providers/liteapi/readLiteApiError";

test("readLiteApiErrorMessage extracts nested LiteAPI error message", () => {
  const message = readLiteApiErrorMessage(
    {
      error: {
        code: 400,
        description: "Bad Request",
        message: "Invalid prebook parameters: the ID format is invalid",
      },
    },
    "fallback",
  );
  assert.equal(message, "Invalid prebook parameters: the ID format is invalid");
});

test("readLiteApiErrorMessage avoids object Object", () => {
  const message = readLiteApiErrorMessage({ error: { message: "Rate expired" } }, "fallback");
  assert.notEqual(message, "[object Object]");
  assert.match(message, /expired/i);
});
