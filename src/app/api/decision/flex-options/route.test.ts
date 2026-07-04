import assert from "node:assert/strict";
import test from "node:test";

test("decision flex-options route returns date flex without live keys", async () => {
  process.env.NODE_ENV = "test";
  const { POST } = await import("./route");
  const response = await POST(
    new Request("http://localhost/api/decision/flex-options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "Beaumont California to Italy in September",
        strategyId: "direct_cash",
        comfortWeight: 0.55,
      }),
    }),
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.ok(payload.flex);
  assert.equal(payload.flex.strategyId, "direct_cash");
  assert.ok(Array.isArray(payload.flex.options));
  assert.ok(payload.flex.options.length > 0);
  assert.ok(payload.flex.options.length <= 3);
  assert.ok(typeof payload.flex.notice === "string");
  assert.ok(payload.flex.baselineDate);
});

test("decision flex-options route rejects missing strategyId and originIata", async () => {
  process.env.NODE_ENV = "test";
  const { POST } = await import("./route");
  const response = await POST(
    new Request("http://localhost/api/decision/flex-options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "Beaumont California to Italy in September",
        comfortWeight: 0.55,
      }),
    }),
  );

  assert.equal(response.status, 400);
});
