import assert from "node:assert/strict";
import test from "node:test";

test("decision strategies route returns fast brief without live provider blocking", async () => {
  process.env.NODE_ENV = "test";
  const { POST } = await import("./route");
  const startedAt = Date.now();
  const response = await POST(
    new Request("http://localhost/api/decision/strategies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "on September 1st i want to fly from beaumont ca to new york",
        comfortWeight: 0.55,
        planMode: "flights",
        paymentMode: "cash",
      }),
    }),
  );

  const elapsedMs = Date.now() - startedAt;
  assert.equal(response.status, 200);
  assert.ok(elapsedMs < 1_500, `expected fast response, got ${elapsedMs}ms`);

  const payload = await response.json();
  assert.ok(payload.brief);
  assert.ok(Array.isArray(payload.brief.strategies));
  assert.ok(payload.brief.strategies.length > 0);
  assert.equal(payload.brief.topologySearch, undefined);
  assert.equal(payload.brief.fusedFlightSearch, undefined);
});
