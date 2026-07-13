import assert from "node:assert/strict";
import test from "node:test";
import {
  createAirportLayoutPackage,
  parseAirportLayout,
  validateAirportLayoutGraph,
} from "@/lib/airportNav/airportLayoutPackage";
import { SEA_LAYOUT } from "@/lib/airportNav/layouts/sea";
import {
  getStoredAirportLayoutPackage,
  resolvePublishedAirportLayout,
  saveAirportLayoutPackage,
} from "@/lib/airportNav/airportLayoutStore";

const SOURCE = {
  ownership: "kepi_original" as const,
  attribution: "Kepi original SEA schematic",
  sourceUrls: ["https://www.portseattle.org/sea/maps"],
  licenseNote: "Kepi-owned geometry; official artwork is not redistributed.",
  lastVerifiedAt: "2026-07-13",
};

test("SEA is a valid database-ready airport layout package", () => {
  const packageRecord = createAirportLayoutPackage({
    layout: SEA_LAYOUT,
    source: SOURCE,
    revision: 3,
    status: "published",
    now: new Date("2026-07-13T18:00:00.000Z"),
  });

  assert.equal(packageRecord.schemaVersion, 1);
  assert.equal(packageRecord.iata, "SEA");
  assert.equal(packageRecord.revision, 3);
  assert.equal(packageRecord.status, "published");
  assert.equal(packageRecord.layout.nodes.length, SEA_LAYOUT.nodes.length);
  assert.equal(packageRecord.source.ownership, "kepi_original");
});

test("airport graph validation rejects broken route references", () => {
  const broken = structuredClone(SEA_LAYOUT);
  broken.edges[0].from = "missing-node";
  broken.pois[0].nodeId = "missing-poi-node";

  const issues = validateAirportLayoutGraph(broken);
  assert.ok(issues.some((issue) => issue.includes("unknown from node")));
  assert.ok(issues.some((issue) => issue.includes("unknown node")));
  assert.throws(() => parseAirportLayout(broken), /unknown from node/);
});

test("airport graph validation rejects open terminal polygons", () => {
  const broken = structuredClone(SEA_LAYOUT);
  broken.zones[0].ring[broken.zones[0].ring.length - 1] = [-122.3, 47.4];

  assert.throws(() => parseAirportLayout(broken), /ring must be closed/);
});

test("bundled SEA seeds the shared store and subsequent reads use the database", async () => {
  const first = await resolvePublishedAirportLayout("SEA");
  const second = await resolvePublishedAirportLayout("SEA");

  assert.ok(first.layout);
  assert.ok(first.package);
  assert.equal(first.package?.status, "published");
  assert.equal(second.source, "database");
  assert.equal(second.package?.revision, first.package?.revision);
});

test("draft airport revisions remain hidden until explicitly published", async () => {
  const publishedBefore = await resolvePublishedAirportLayout("SEA");
  const draftLayout = { ...SEA_LAYOUT, layoutVersion: "draft-test-version" };
  const draft = await saveAirportLayoutPackage(draftLayout, SOURCE, {
    status: "draft",
    now: new Date("2026-07-13T19:00:00.000Z"),
  });
  const publicWhileDraft = await resolvePublishedAirportLayout("SEA");

  assert.equal((await getStoredAirportLayoutPackage("SEA", "draft"))?.layout.layoutVersion, "draft-test-version");
  assert.equal(publicWhileDraft.layout?.layoutVersion, publishedBefore.layout?.layoutVersion);

  const published = await saveAirportLayoutPackage(draftLayout, SOURCE, {
    status: "published",
    now: new Date("2026-07-13T19:05:00.000Z"),
  });
  assert.ok(published.revision > draft.revision);
  assert.equal((await resolvePublishedAirportLayout("SEA")).layout?.layoutVersion, "draft-test-version");
});
