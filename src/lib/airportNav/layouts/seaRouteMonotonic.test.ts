import { test } from "node:test";
import assert from "node:assert/strict";

import { SEA_LAYOUT } from "./sea";
import { computeRoute } from "../pathfinder";
import type { TravelerSecurityCredentials } from "../types";

/**
 * KEPI_DESIGN_LAW M28 — airside routes must not backtrack.
 *
 * The old graph routed north destinations up to a north "hub" and then back down
 * to a concourse neck, drawing an M/W zigzag ("it's walking me back and forth").
 * A correct route to a single destination is geographically monotonic: it may
 * turn once (e.g. walk west along the hall, then north up a pier), but it must
 * never reverse its north/south direction more than once.
 *
 * We measure latitude-direction reversals along the drawn polyline, ignoring
 * sub-~13 m jitter so a tiny curated corridor dip doesn't register as a turn.
 */

const START = "curb-departures"; // planning-mode origin (departures drop-off, Door 14)
const LAT_EPS = 0.00012; // ~13 m — below this a segment is "flat", not a turn

const DESTINATIONS: Array<{ poiId: string; label: string }> = [
  { poiId: "poi-gate-A", label: "A Gates" },
  { poiId: "poi-gate-B", label: "B Gates" },
  { poiId: "poi-gate-C", label: "C Gates" },
  { poiId: "poi-gate-D", label: "D Gates" },
  { poiId: "poi-gate-N", label: "N Gates (train)" },
  { poiId: "poi-gate-S", label: "S Gates (train)" },
  { poiId: "poi-lounge-akc", label: "Alaska Lounge (C)" },
  { poiId: "poi-lounge-centurion", label: "Centurion Lounge" },
  { poiId: "poi-lounge-club-a", label: "The Club at SEA (A)" },
];

const CREDENTIAL_PROFILES: Array<{ label: string; creds: TravelerSecurityCredentials }> = [
  { label: "standard", creds: { tsaPreCheck: false, clear: false, known: true } },
  { label: "PreCheck+CLEAR", creds: { tsaPreCheck: true, clear: true, known: true } },
];

/** Number of times the polyline reverses its north/south direction (ignoring jitter). */
function latitudeReversals(coords: [number, number][]): number {
  let lastDir = 0;
  let reversals = 0;
  for (let i = 0; i < coords.length - 1; i += 1) {
    const dLat = coords[i + 1][1] - coords[i][1];
    if (Math.abs(dLat) < LAT_EPS) continue;
    const dir = dLat > 0 ? 1 : -1;
    if (lastDir !== 0 && dir !== lastDir) reversals += 1;
    lastDir = dir;
  }
  return reversals;
}

for (const { label: profile, creds } of CREDENTIAL_PROFILES) {
  test(`SEA routes never zigzag north↔south (${profile})`, () => {
    const offenders: string[] = [];
    for (const { poiId, label } of DESTINATIONS) {
      const route = computeRoute({ layout: SEA_LAYOUT, fromNodeId: START, toPoiId: poiId, credentials: creds });
      assert.ok(route, `no route to ${label} (${poiId})`);
      const reversals = latitudeReversals(route!.coordinates);
      if (reversals > 1) {
        offenders.push(`${label}: ${reversals} latitude reversals (path=${route!.nodeIds.join(" → ")})`);
      }
    }
    assert.equal(offenders.length, 0, `routes backtrack north↔south:\n  ${offenders.join("\n  ")}`);
  });
}
