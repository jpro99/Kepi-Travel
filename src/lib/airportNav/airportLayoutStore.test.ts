/**
 * Runs against the kvStore in-memory fallback (no Redis env in tests) and
 * without BLOB_READ_WRITE_TOKEN (inline layout fallback) — which is exactly
 * the "empty Redis / missing env" survival guarantee these tests lock in.
 */

import assert from "node:assert/strict";
import test, { before } from "node:test";
import { resetRedisClientCacheForTests } from "@/lib/redis";
import {
  bundledSource,
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

// M25 — a seed-originated published package must re-publish itself when the
// shipped bundle carries a newer layoutVersion. This is the exact bug behind the
// SEA check-in/security fix: the source geometry was corrected, but Redis kept
// serving an old seeded revision so the live map never changed.
test("stale seed-originated published package auto-refreshes to the newer bundle", async () => {
  // Simulate a previously-seeded SEA published at an old layoutVersion.
  const stale: AirportLayout = {
    ...structuredClone(SEA_LAYOUT),
    layoutVersion: "0.0.1-stale-seed",
  };
  const staleSaved = await saveAirportLayoutPackage(stale, bundledSource("SEA"), {
    status: "published",
    previewConfirmation: { by: SEED_PREVIEW_CONFIRMER },
  });
  assert.equal(staleSaved.layout.layoutVersion, "0.0.1-stale-seed");

  // Resolving now serves the CURRENT bundle, not the stale stored revision.
  const resolved = await resolvePublishedAirportLayout("SEA");
  assert.equal(resolved.source, "bundled");
  assert.equal(resolved.layout?.layoutVersion, SEA_LAYOUT.layoutVersion);
  assert.notEqual(resolved.layout?.layoutVersion, "0.0.1-stale-seed");
  // A fresh revision was written so subsequent reads are already up to date.
  assert.ok((resolved.package?.revision ?? 0) > staleSaved.revision);

  const stored = await getStoredAirportLayoutPackage("SEA", "published");
  assert.equal(stored?.layout.layoutVersion, SEA_LAYOUT.layoutVersion);
});

// The reseed must NEVER clobber an admin- or OSM-curated publish. Those carry a
// different attribution than the compiled seed, so "database wins" still holds.
test("admin/OSM-curated published package is not overwritten by the bundle", async () => {
  const curated: AirportLayout = {
    ...structuredClone(SEA_LAYOUT),
    layoutVersion: "9.9.9-curated-survey",
  };
  const curatedSource = {
    ownership: "kepi_original" as const,
    attribution: "Map data © OpenStreetMap contributors (curated import)",
    sourceUrls: ["https://www.openstreetmap.org/"],
    licenseNote: "Kepi-owned geometry derived from OSM under ODbL.",
    lastVerifiedAt: "2026-07-14",
  };
  const curatedSaved = await saveAirportLayoutPackage(curated, curatedSource, {
    status: "published",
    previewConfirmation: { by: "admin-human" },
  });

  const resolved = await resolvePublishedAirportLayout("SEA");
  assert.equal(resolved.source, "database");
  assert.equal(resolved.layout?.layoutVersion, "9.9.9-curated-survey");
  assert.equal(resolved.package?.revision, curatedSaved.revision);
});
