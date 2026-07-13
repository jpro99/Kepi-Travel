/**
 * Runs against the kvStore in-memory fallback (no Redis env in tests) and
 * without BLOB_READ_WRITE_TOKEN (inline layout fallback) — which is exactly
 * the "empty Redis / missing env" survival guarantee these tests lock in.
 */

import assert from "node:assert/strict";
import test, { before } from "node:test";
import { resetRedisClientCacheForTests } from "@/lib/redis";
import {
  getStoredAirportLayoutPackage,
  listAirportLayoutPackageIatas,
  listAirportLayoutRevisionRecords,
  resolvePublishedAirportLayout,
  saveAirportLayoutPackage,
  SEED_PREVIEW_CONFIRMER,
} from "@/lib/airportNav/airportLayoutStore";
import { SEA_LAYOUT } from "@/lib/airportNav/layouts/sea";
import type { AirportLayout } from "@/lib/airportNav/types";

// Hermetic guarantee: these tests lock in the "empty Redis / missing env"
// survival path. CI and Vercel builds DO inject Redis + blob credentials, so we
// strip them here and reset the memoized client to force the in-memory fallback.
// Without this the tests read/WRITE shared Redis, drift across runs, and fail
// the Vercel build (M13: package-lifecycle tests must never touch shared Redis).
function forceInMemoryStore(): void {
  for (const key of [
    "UPSTASH_REDIS_REST_URL",
    "KV_REST_API_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "KV_REST_API_TOKEN",
    "BLOB_READ_WRITE_TOKEN",
  ]) {
    delete process.env[key];
  }
  resetRedisClientCacheForTests();
}
forceInMemoryStore();
before(forceInMemoryStore);

const SOURCE = {
  ownership: "kepi_original" as const,
  attribution: "Kepi original test schematic",
  sourceUrls: [],
  licenseNote: "Kepi-owned geometry; official artwork is not redistributed.",
  lastVerifiedAt: "2026-07-13",
};

function fakeAirport(iata: string): AirportLayout {
  return { ...structuredClone(SEA_LAYOUT), iata, name: `${iata} Test Airport` };
}

test("SEA resolves from the compiled seed with empty storage and missing env", async () => {
  const resolved = await resolvePublishedAirportLayout("SEA");
  assert.ok(resolved.layout, "SEA layout must always resolve");
  assert.equal(resolved.layout?.iata, "SEA");
  assert.equal(resolved.source, "bundled");
  // Seeding self-confirms the preview gate — compiled layouts are human-reviewed in code.
  assert.equal(resolved.package?.previewConfirmedBy, SEED_PREVIEW_CONFIRMER);

  const again = await resolvePublishedAirportLayout("SEA");
  assert.equal(again.source, "database");
});

test("publishing via the store requires visual preview confirmation", async () => {
  const layout = fakeAirport("ZZQ");
  await assert.rejects(
    saveAirportLayoutPackage(layout, SOURCE, { status: "published" }),
    /visual preview confirmation/,
  );
  const missing = await getStoredAirportLayoutPackage("ZZQ", "published");
  assert.equal(missing, null);
});

test("draft then confirmed publish records immutable history and index", async () => {
  const layout = fakeAirport("ZZR");

  const draft = await saveAirportLayoutPackage(layout, SOURCE, { status: "draft" });
  assert.equal(draft.status, "draft");
  assert.equal(draft.revision, 1);

  const publishedResult = await saveAirportLayoutPackage(layout, SOURCE, {
    status: "published",
    previewConfirmation: { by: "admin-test-user" },
  });
  assert.equal(publishedResult.status, "published");
  assert.equal(publishedResult.revision, 2);
  assert.equal(publishedResult.previewConfirmedBy, "admin-test-user");

  const resolved = await resolvePublishedAirportLayout("ZZR");
  assert.equal(resolved.source, "database");
  assert.equal(resolved.package?.revision, 2);

  const history = await listAirportLayoutRevisionRecords("ZZR");
  assert.deepEqual(history.map((record) => record.revision), [2, 1]);
  assert.deepEqual(history.map((record) => record.status), ["published", "draft"]);

  const index = await listAirportLayoutPackageIatas();
  assert.ok(index.includes("ZZR"));
});

test("unknown airports resolve to none without inventing geometry", async () => {
  const resolved = await resolvePublishedAirportLayout("ZZX");
  assert.equal(resolved.layout, null);
  assert.equal(resolved.source, "none");
});
