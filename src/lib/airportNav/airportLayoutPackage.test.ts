import assert from "node:assert/strict";
import test from "node:test";
import {
  createAirportLayoutPackage,
  createNextAirportLayoutPackage,
  parseAirportLayout,
  parseAirportLayoutPackage,
  validateAirportLayoutGraph,
} from "@/lib/airportNav/airportLayoutPackage";
import { SEA_LAYOUT } from "@/lib/airportNav/layouts/sea";

const SOURCE = {
  ownership: "kepi_original" as const,
  attribution: "Kepi original SEA schematic",
  sourceUrls: ["https://www.portseattle.org/sea/maps"],
  licenseNote: "Kepi-owned geometry; official artwork is not redistributed.",
  lastVerifiedAt: "2026-07-13",
};

const PREVIEW = { by: "admin-test-user" };

test("SEA is a valid database-ready airport layout package", () => {
  const packageRecord = createAirportLayoutPackage({
    layout: SEA_LAYOUT,
    source: SOURCE,
    revision: 3,
    status: "published",
    now: new Date("2026-07-13T18:00:00.000Z"),
    previewConfirmation: PREVIEW,
  });

  assert.equal(packageRecord.schemaVersion, 1);
  assert.equal(packageRecord.iata, "SEA");
  assert.equal(packageRecord.revision, 3);
  assert.equal(packageRecord.status, "published");
  assert.equal(packageRecord.layout.nodes.length, SEA_LAYOUT.nodes.length);
  assert.equal(packageRecord.source.ownership, "kepi_original");
  assert.equal(packageRecord.precisionGrade, "schematic");
  assert.equal(packageRecord.previewConfirmedBy, "admin-test-user");
  assert.equal(packageRecord.previewConfirmedAt, "2026-07-13T18:00:00.000Z");
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

test("publishing without a confirmed visual preview is rejected", () => {
  assert.throws(
    () => createAirportLayoutPackage({
      layout: SEA_LAYOUT,
      source: SOURCE,
      status: "published",
    }),
    /visual preview confirmation/,
  );
  // Drafts do not require preview confirmation.
  const draft = createAirportLayoutPackage({
    layout: SEA_LAYOUT,
    source: SOURCE,
    status: "draft",
  });
  assert.equal(draft.status, "draft");
  assert.equal(draft.previewConfirmedBy, undefined);
});

test("precision grade defaults to schematic and accepts surveyed", () => {
  const surveyed = createAirportLayoutPackage({
    layout: SEA_LAYOUT,
    source: SOURCE,
    status: "draft",
    precisionGrade: "surveyed",
  });
  assert.equal(surveyed.precisionGrade, "surveyed");

  const promoted = createNextAirportLayoutPackage({
    layout: SEA_LAYOUT,
    source: SOURCE,
    status: "draft",
    existingDraft: surveyed,
  });
  assert.equal(promoted.precisionGrade, "surveyed");
});

test("legacy stored packages without new fields still parse", () => {
  const legacy = {
    schemaVersion: 1,
    iata: "SEA",
    revision: 1,
    status: "published",
    layout: SEA_LAYOUT,
    source: SOURCE,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    publishedAt: "2026-07-01T00:00:00.000Z",
  };
  const parsed = parseAirportLayoutPackage(legacy);
  assert.equal(parsed.precisionGrade, "schematic");
  assert.equal(parsed.previewConfirmedBy, undefined);
});

test("draft and published package revisions advance without touching shared storage", () => {
  const published = createAirportLayoutPackage({
    layout: SEA_LAYOUT,
    source: SOURCE,
    revision: 2,
    status: "published",
    now: new Date("2026-07-13T18:00:00.000Z"),
    previewConfirmation: PREVIEW,
  });
  const draft = createNextAirportLayoutPackage({
    layout: { ...SEA_LAYOUT, layoutVersion: "draft-test-version" },
    source: SOURCE,
    status: "draft",
    existingPublished: published,
    now: new Date("2026-07-13T19:00:00.000Z"),
  });
  const promoted = createNextAirportLayoutPackage({
    layout: draft.layout,
    source: SOURCE,
    status: "published",
    existingPublished: published,
    existingDraft: draft,
    now: new Date("2026-07-13T19:05:00.000Z"),
    previewConfirmation: PREVIEW,
  });

  assert.equal(draft.revision, 3);
  assert.equal(draft.status, "draft");
  assert.equal(published.layout.layoutVersion, SEA_LAYOUT.layoutVersion);
  assert.equal(promoted.revision, 4);
  assert.equal(promoted.status, "published");
  assert.equal(promoted.layout.layoutVersion, "draft-test-version");
});
