You are the lead architect and senior full-stack engineer for Kepi Travel.

You are not here to brainstorm loosely or produce partial snippets.
You are here to design and implement the next safe production layer for Kepi's airport mapping
system — in verified, incremental phases, not one giant delivery.

## PROJECT CONTEXT

Kepi Travel needs a scalable airport-map architecture. We already shipped the first airport-map
foundation to production. SEA exists as the first airport package and works as the compiled
seed/fallback. The platform uses Upstash Redis KV + Vercel Blob, not a relational database.

There is already an admin airport-layout editor at `src/app/admin/airport-layout` — **read it
first.** The core architectural risk this project is trying to fix is airport layouts existing
in competing representations with old upload paths disconnected from production reads. Building
a second, parallel admin UI or a second upload path instead of extending what's there would
recreate that exact problem. Every part of this plan that touches "admin workflow" means: extend
`src/app/admin/airport-layout`, do not create a sibling.

We need the next production-safe layer that lets Kepi scale airport coverage quickly without
breaking rendering, offline caching, or bundle size.

## GOAL

Build the next safe automation layer for airport support:
1. detect unsupported airports,
2. create a shared deduplicated curation request,
3. track demand count and source metadata,
4. allow admin draft creation and upload (via the existing editor, extended),
5. validate packages — both structurally and visually — before publish,
6. publish approved airport packages into shared storage,
7. keep SEA as the seed fallback,
8. preserve existing client behavior as much as possible.

## CORE PRODUCT DECISION

Do NOT build one-off hardcoded airport logic every time.
Do NOT auto-publish invented geometry.
Do build a reusable airport package pipeline: one shared package per airport, versioned,
validated, reusable by all travelers, cacheable offline.

## PRIMARY MODEL

Persist the `AirportLayout` routing graph model first. Do not try to fully unify the legacy 3D
terminal model in this phase unless absolutely required — keep the 3D model seed-only for now if
that is the smallest safe path.

## WHAT TO BUILD

### 1. Shared package storage

Create a production-safe package store module. **Storage shape matters — do not assume Redis can
hold everything:**
- Redis KV (global namespace) holds small, frequently-read data: the current-version pointer,
  the version index/listing, and package *metadata* (iata, version, precisionGrade, attribution,
  source, updatedAt/By).
- The actual `AirportLayout` JSON payload — which can get large for a big international terminal
  (many nodes/edges/POIs) — goes in **Vercel Blob**, with Redis storing the Blob URL/key, not the
  raw layout.
- Support: current package pointer, immutable version history, package index/listing.

### 2. Unsupported airport intake queue

When Kepi encounters an unsupported airport, create or update a shared deduplicated curation
request instead of failing silently. Track: IATA, first seen at, last seen at, demand count,
source of detection, draft status, publish status, notes/verification state.

### 3. Admin workflow — extend the existing editor, do not fork it

Extend `src/app/admin/airport-layout` (read its current implementation first) and its
corresponding admin API routes so an authorized admin can: view queued airports, create a draft
package, upload or paste Kepi-authored layout JSON, validate it, **preview it rendered on the
actual map**, publish it, and see version history.

### 4. Validation — structural AND visual

Validation must reject bad or incomplete packages, prevent broken routing graphs, and require
provenance/attribution metadata. It must not accept raw unstructured third-party GeoJSON as a
valid production package format.

**Structural validation is not enough on its own.** This project has already shipped a bug where
data passed a structural trust check but was physically wrong (hotel pins placed offshore in the
Adriatic — see `KEPI_PROJECT_MEMORY.md`, "Failure logged 2026-06-15", fixed via
`isLikelyOffshorePin`). A schema-valid, fully-attributed airport package can still have a gate
drawn in the wrong corridor or a security checkpoint on the wrong side of a wall. **Publish must
require a rendered visual preview of the draft package that an admin looks at and confirms before
it goes live** — this is a mandatory human sanity-check step, not optional polish.

### 5. Read-through retrieval

Existing airport layout fetch path should prefer: Blob-backed DB package → seed package (SEA) →
404. Keep current app behavior stable. Preserve existing cache headers where applicable.

### 6. Offline compatibility

Do not rewrite offline architecture unless needed. Use the existing airport-layout cache flow
(`syncItineraryOfflineAssets` / the offline cache path already wired into `AirportNavigatorMap`)
if possible. Published packages should continue to refresh trip caches through the existing or
minimally changed flow.

### 7. Design law + test — non-negotiable for this codebase

Every new safety guarantee this system introduces gets a one-line law in `KEPI_DESIGN_LAW.md`
(DATA/API section) plus a test, following this repo's existing convention (see D1–D13 for the
pattern). At minimum, add laws for: "SEA must keep working even with empty Redis or missing env,"
"a package must pass visual preview confirmation before publish," and "curation requests dedupe
by IATA." This is what keeps these guarantees enforced on every future build, not just today.

## CONSTRAINTS

- Production-safe first. Smallest-safe slice first.
- No relational DB migration.
- No breaking client rendering.
- No giant speculative rewrite.
- No fake data. No copied copyrighted map assets. No false precision.
- Keep SEA working even with empty Redis or missing env.
- Prefer append-only/additive changes where possible.
- **Extend the existing admin editor at `src/app/admin/airport-layout` — do not create a second
  admin UI or a second upload path.**

## REQUIRED TYPES / CONCEPTS

```
AirportPackage = {
  iata: string;
  version: number;
  layoutVersion: string;
  precisionGrade: "schematic" | "surveyed";
  attribution: string;
  source: "seed" | "db";
  layoutBlobUrl: string;      // Vercel Blob pointer — the layout JSON itself lives here
  updatedAt: string;
  updatedBy: string;
  previewConfirmedAt?: string;
  previewConfirmedBy?: string;
}

AirportCurationRequest = {
  iata: string;
  demandCount: number;
  status: "queued" | "draft" | "validated" | "published" | "rejected";
  firstSeenAt: string;
  lastSeenAt: string;
  detectedBy: string[];
  notes?: string;
  linkedPackageVersion?: number;
}
```

## STORAGE SHAPE

Redis KV, global namespace:
- `airport:pkg:{IATA}` — current package metadata (includes `layoutBlobUrl`, not the raw layout)
- `airport:pkg:{IATA}:v{n}` — versioned metadata history
- `airport:pkg:index` — listing
- `airport:curation:{IATA}` — curation request
- `airport:curation:index` — listing

Vercel Blob:
- the actual `AirportLayout` JSON payload per version, referenced by `layoutBlobUrl`

## AUTH

Use the real admin auth helper already present in the app (`resolveAuthenticatedUserId` /
`adminAccess` — confirm exact helper by reading current admin routes first). Do not use fake
dev-only auth. Admin routes must be properly protected.

## EXECUTION PLAN — phase-gated, verify before proceeding

**Do not deliver all phases in one response.** Each phase ends with running the relevant checks;
do not start the next phase until the previous one's checks pass. This is the one hard rule this
plan cannot skip.

**Phase 1 — Inspect, don't write yet.**
Read and trace end-to-end: `AirportLayout` types, the current layout loader/fetch route, the
existing admin uploader at `src/app/admin/airport-layout`, the offline sync flow, and the real
admin auth helper. Summarize the exact current architecture in plain English. List the exact
files this plan will touch. Stop here and report before writing any code.

**Phase 2 — Storage + curation queue.**
Implement the package store module (Redis metadata + Blob payload) and the curation request
store. Add tests for both. Run `npm run test:laws` (or the relevant test script) and confirm
passing before moving on.

**Phase 3 — Read-through + admin workflow.**
Update the read-through layout API (DB → seed → 404). Extend the existing admin editor/routes
for queue view, draft creation, upload, structural validation, visual preview, and publish. Run
`npm run lint && npx tsc --noEmit` on changed files and `npm run build` before moving on.

**Phase 4 — Design laws + full test pass.**
Add the required `KEPI_DESIGN_LAW.md` entries and test-index rows. Run
`npm run test:laws && npm run build` (full Rule Zero check) and confirm passing.

**Phase 5 — Validation checklist.**
Provide the final checklist and exact commands used to verify each phase, plus brief risk notes.

## OUTPUT RULES

- Full complete files only within a phase, never diffs or placeholders — but only for the
  phase currently being delivered, not all phases at once.
- Put the exact file path at the top of every file.
- Preserve all existing unrelated logic; avoid removing things unless necessary.
- If a file should not change, say so and do not rewrite it.
- Explain assumptions briefly.
- If blocked by missing context, ask the smallest number of precise questions possible —
  otherwise, proceed phase by phase as above.
- Follow this repo's standing rules: read `CLAUDE.md` / `AGENTS.md` / `KEPI_DESIGN_LAW.md` first;
  commit and push directly to `main` per owner preference, only after lint + build pass for that
  phase's changes.
