import test from "node:test";
import assert from "node:assert/strict";
import {
  formatApiErrorMessage,
  parseResponseJson,
  readJsonResponse,
  userFacingFetchError,
} from "@/lib/api/readJsonResponse";

function mockResponse(body: string, init?: { status?: number; contentType?: string }): Response {
  const status = init?.status ?? 200;
  return new Response(body, {
    status,
    headers: { "content-type": init?.contentType ?? "text/html; charset=utf-8" },
  });
}

test("readJsonResponse returns parsed JSON when response is ok", async () => {
  const payload = await readJsonResponse<{ profile: { userId: string } }>(
    mockResponse(JSON.stringify({ profile: { userId: "u1" } }), {
      contentType: "application/json",
    }),
  );
  assert.equal(payload.profile.userId, "u1");
});

test("parseResponseJson throws friendly message for HTML error pages", async () => {
  await assert.rejects(
    parseResponseJson(mockResponse("An error occurred while processing your request.", { status: 500 })),
    /Something went wrong \(500\)/,
  );
});

test("readJsonResponse maps API error payloads on non-ok JSON responses", async () => {
  await assert.rejects(
    readJsonResponse(
      mockResponse(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        contentType: "application/json",
      }),
    ),
    /Unauthorized/,
  );
});

test("userFacingFetchError hides raw JSON parse failures", () => {
  const syntax = new SyntaxError(`Unexpected token 'A', "An error o"... is not valid JSON`);
  assert.equal(userFacingFetchError(syntax, "Could not save."), "Could not save.");
  assert.equal(formatApiErrorMessage(null, 503), "Something went wrong (503). Please try again.");
});
