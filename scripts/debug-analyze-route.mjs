/**
 * Invoke strategies route handler directly (test auth bypass).
 * Usage: node --import tsx scripts/debug-analyze-route.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

process.env.NODE_ENV = "test";

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    /* optional */
  }
}

loadEnvLocal();

const { POST } = await import("../src/app/api/decision/strategies/route.ts");

const body = {
  prompt: process.argv[2] ?? "Beaumont California to Italy in September",
  comfortWeight: 0.55,
  planMode: "full",
  paymentMode: "cash",
};

console.log("[analyze-debug] script:start", body);

const startedAt = Date.now();
const req = new Request("http://localhost/api/decision/strategies", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

try {
  const res = await POST(req);
  const elapsed = Date.now() - startedAt;
  console.log("[analyze-debug] script:response", { status: res.status, ms: elapsed });
  const json = await res.json();
  if (!res.ok) {
    console.log("[analyze-debug] script:error-body", json);
    process.exit(1);
  }
  console.log("[analyze-debug] script:success", {
    ms: elapsed,
    strategies: json.brief?.strategies?.length ?? 0,
    topologyWinners: json.brief?.topologySearch?.winners?.length ?? 0,
    duffelCallsUsed: json.brief?.topologySearch?.duffelCallsUsed ?? 0,
  });
} catch (error) {
  console.log("[analyze-debug] script:throw", {
    ms: Date.now() - startedAt,
    message: error instanceof Error ? error.message : String(error),
    name: error instanceof Error ? error.name : "unknown",
  });
  process.exit(1);
}
