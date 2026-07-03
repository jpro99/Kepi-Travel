import assert from "node:assert/strict";
import test from "node:test";

test("decision enrich route skips live providers when origin missing", async () => {
  process.env.NODE_ENV = "test";
  const { POST } = await import("./route");
  const response = await POST(
    new Request("http://localhost/api/decision/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "I want to go to Italy in September",
        comfortWeight: 0.55,
        planMode: "flights",
        paymentMode: "cash",
      }),
    }),
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.ok(payload.brief);
  assert.equal(payload.brief.topologySearch, undefined);
  assert.equal(payload.brief.fusedFlightSearch, undefined);
});
