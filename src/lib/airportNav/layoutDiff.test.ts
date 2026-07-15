import { test } from "node:test";
import assert from "node:assert/strict";
import { diffAirportLayouts } from "./layoutDiff";
import type { AirportLayout } from "./types";

function miniLayout(pois: Array<{ id: string; name: string; category: "gate" | "checkin" | "amenity"; nodeId: string; iata?: string }>, nodes: Array<{ id: string; lng: number; lat: number }>): AirportLayout {
  return {
    iata: "TST",
    name: "Test",
    layoutVersion: "1",
    updatedAt: "2026-07-15",
    center: [0, 0],
    zones: [{ id: "z", name: "z", ring: [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]], airside: false, heightM: 10 }],
    nodes: nodes.map((n) => ({
      id: n.id,
      pos: [n.lng, n.lat] as [number, number],
      kind: "junction" as const,
      airside: false,
    })),
    edges: [{ id: "e1", from: nodes[0].id, to: nodes[0].id, kind: "walkway", lengthM: 1, traverseSeconds: 1, bidirectional: true }],
    pois: pois.map((p) => ({
      id: p.id,
      nodeId: p.nodeId,
      category: p.category,
      name: p.name,
      airlineIataCode: p.iata,
    })),
    gateNodeResolver: [],
  };
}

test("diffAirportLayouts reports added, removed, and moved POIs", () => {
  const published = miniLayout(
    [
      { id: "p1", name: "Alaska check-in", category: "checkin", nodeId: "n1", iata: "AS" },
      { id: "p2", name: "Gate A1", category: "gate", nodeId: "n2" },
    ],
    [
      { id: "n1", lng: -122.3, lat: 47.44 },
      { id: "n2", lng: -122.31, lat: 47.45 },
    ],
  );
  const draft = miniLayout(
    [
      { id: "p1", name: "Alaska check-in", category: "checkin", nodeId: "n1", iata: "AS" },
      { id: "p3", name: "Icelandair check-in", category: "checkin", nodeId: "n3", iata: "FI" },
    ],
    [
      { id: "n1", lng: -122.301, lat: 47.441 }, // ~140m move
      { id: "n3", lng: -122.302, lat: 47.442 },
    ],
  );
  const diff = diffAirportLayouts(published, draft);
  assert.equal(diff.added.length, 1);
  assert.equal(diff.added[0].key, "airline:FI");
  assert.equal(diff.removed.length, 1);
  assert.match(diff.removed[0].key, /gate:/i);
  assert.equal(diff.moved.length, 1);
  assert.equal(diff.moved[0].key, "airline:AS");
  assert.ok((diff.moved[0].distanceM ?? 0) >= 25);
  assert.match(diff.summary, /added/);
});
