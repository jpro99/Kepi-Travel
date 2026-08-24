/**
 * Build fixtures/kac/ont.json + sea.json from cached Overpass gate extracts.
 * Lounge coords locked to Cartographer kac-1.0.2 (2026-08-24).
 * Run: node scripts/build-kac-fixtures.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const LOUNGES = {
  ONT: [
    {
      id: "ONT:lounge:aspire-t2",
      name: "Aspire Lounge T2 (between gates 209–210)",
      pos: [-117.59651370303231, 34.060182788605545],
    },
    {
      id: "ONT:lounge:aspire-t4",
      name: "Aspire Lounge T4 (between gates 410–411)",
      pos: [-117.58629674491232, 34.060179575902026],
    },
  ],
  SEA: [
    {
      id: "SEA:lounge:alaska-c",
      name: "Alaska Lounge C — C-16 mezzanine",
      pos: [-122.30418036666667, 47.44617026666666],
      notes: "Schematic AREA pin — follow signs; no indoor route.",
    },
    {
      id: "SEA:lounge:alaska-d",
      name: "Alaska Lounge D — just beyond CP4",
      pos: [-122.30075778534199, 47.4446159],
      notes: "Schematic AREA pin near D concourse / Checkpoint 4 — follow signs.",
    },
    {
      id: "SEA:lounge:alaska-n",
      name: "Alaska Lounge N — above N13–18 satellite",
      pos: [-122.3035765, 47.44920381666666],
      notes: "Schematic AREA pin — TRAIN-ONLY to N satellite; no walk from main.",
    },
  ],
};

const ONT_CHECKIN_AS_T2 = {
  id: "ONT:node:checkin:as-t2",
  name: "Alaska check-in — Terminal 2",
  pos: [-117.5965330978535, 34.06046910909091],
};

function loadGates(path) {
  const json = JSON.parse(readFileSync(path, "utf8"));
  return json.elements
    .filter((e) => e.tags?.aeroway === "gate" && e.tags?.ref?.trim())
    .map((e) => ({
      ref: e.tags.ref.trim(),
      pos: [e.lon ?? e.center?.lon, e.lat ?? e.center?.lat],
    }))
    .filter((g) => g.pos[0] != null && g.pos[1] != null);
}

function centroid(ring) {
  let sx = 0;
  let sy = 0;
  for (const [lng, lat] of ring) {
    sx += lng;
    sy += lat;
  }
  return [sx / ring.length, sy / ring.length];
}

const ONT_CENTER = [-117.59235, 34.0602];
const SEA_CENTER = [-122.30209, 47.44328];

function buildOntZones() {
  return [
    {
      id: "ONT:zone:t2-landside",
      name: "Terminal 2 landside",
      ring: [
        [-117.5999, 34.0607],
        [-117.5945, 34.0607],
        [-117.5945, 34.06],
        [-117.5999, 34.06],
        [-117.5999, 34.0607],
      ],
      airside: false,
      heightM: 12,
    },
    {
      id: "ONT:zone:t2-airside",
      name: "Terminal 2 airside",
      ring: [
        [-117.5999, 34.06015],
        [-117.5945, 34.06015],
        [-117.5945, 34.05995],
        [-117.5999, 34.05995],
        [-117.5999, 34.06015],
      ],
      airside: true,
      heightM: 10,
    },
    {
      id: "ONT:zone:t4-landside",
      name: "Terminal 4 landside",
      ring: [
        [-117.5905, 34.06065],
        [-117.585, 34.06065],
        [-117.585, 34.06005],
        [-117.5905, 34.06005],
        [-117.5905, 34.06065],
      ],
      airside: false,
      heightM: 12,
    },
    {
      id: "ONT:zone:t4-airside",
      name: "Terminal 4 airside",
      ring: [
        [-117.5905, 34.06028],
        [-117.585, 34.06028],
        [-117.585, 34.06005],
        [-117.5905, 34.06005],
        [-117.5905, 34.06028],
      ],
      airside: true,
      heightM: 10,
    },
    {
      id: "ONT:zone:intl-arrivals",
      name: "International Arrivals",
      ring: [
        [-117.60464, 34.061056],
        [-117.603416, 34.061056],
        [-117.603088, 34.060786],
        [-117.603709, 34.060268],
        [-117.60464, 34.059744],
        [-117.60464, 34.061056],
      ],
      airside: false,
      heightM: 12,
    },
    {
      id: "ONT:zone:frontage",
      name: "Terminal frontage (landside connector)",
      ring: [
        [-117.5999, 34.06075],
        [-117.585, 34.06075],
        [-117.585, 34.06055],
        [-117.5999, 34.06055],
        [-117.5999, 34.06075],
      ],
      airside: false,
      heightM: 8,
    },
  ];
}

function buildSeaZones() {
  return [
    { id: "SEA:zone:main-landside", name: "Main terminal landside", ring: [[-122.318, 47.435], [-122.295, 47.435], [-122.295, 47.47], [-122.318, 47.47], [-122.318, 47.435]], airside: false, heightM: 14 },
    { id: "SEA:zone:main-airside", name: "Main terminal airside", ring: [[-122.318, 47.435], [-122.295, 47.435], [-122.295, 47.47], [-122.318, 47.47], [-122.318, 47.435]], airside: true, heightM: 12 },
    { id: "SEA:zone:sat-n", name: "North Satellite", ring: [[-122.306, 47.4475], [-122.299, 47.4475], [-122.299, 47.451], [-122.306, 47.451], [-122.306, 47.4475]], airside: true, heightM: 11 },
    { id: "SEA:zone:sat-s", name: "South Satellite", ring: [[-122.306, 47.437], [-122.299, 47.437], [-122.299, 47.441], [-122.306, 47.441], [-122.306, 47.437]], airside: true, heightM: 11 },
    { id: "SEA:zone:concourse-a", name: "Concourse A", ring: [[-122.318, 47.435], [-122.295, 47.435], [-122.295, 47.47], [-122.318, 47.47], [-122.318, 47.435]], airside: true, heightM: 10 },
    { id: "SEA:zone:concourse-b", name: "Concourse B", ring: [[-122.318, 47.435], [-122.295, 47.435], [-122.295, 47.47], [-122.318, 47.47], [-122.318, 47.435]], airside: true, heightM: 10 },
    { id: "SEA:zone:concourse-c", name: "Concourse C", ring: [[-122.318, 47.435], [-122.295, 47.435], [-122.295, 47.47], [-122.318, 47.47], [-122.318, 47.435]], airside: true, heightM: 10 },
    { id: "SEA:zone:concourse-d", name: "Concourse D", ring: [[-122.318, 47.435], [-122.295, 47.435], [-122.295, 47.47], [-122.318, 47.47], [-122.318, 47.435]], airside: true, heightM: 10 },
    { id: "SEA:zone:train-apm", name: "APM train corridor", ring: [[-122.318, 47.435], [-122.295, 47.435], [-122.295, 47.47], [-122.318, 47.47], [-122.318, 47.435]], airside: true, heightM: 8 },
    { id: "SEA:zone:iaf", name: "International arrivals", ring: [[-122.318, 47.435], [-122.295, 47.435], [-122.295, 47.47], [-122.318, 47.47], [-122.318, 47.435]], airside: false, heightM: 10 },
  ];
}

function buildPackage(iata, name, layoutVersion, gates, center) {
  const officialGates =
    iata === "ONT" ? gates.filter((g) => g.ref !== "213") : gates;

  const nodes = officialGates.map((g) => ({
    id: `${iata}:node:gate:${g.ref}`,
    name: `Gate ${g.ref}`,
    kind: "gate",
    pos: g.pos,
    airside: true,
    precision: "schematic",
    doorLabel: g.ref,
  }));

  if (iata === "ONT") {
    nodes.push({
      id: ONT_CHECKIN_AS_T2.id,
      name: ONT_CHECKIN_AS_T2.name,
      kind: "checkin",
      pos: ONT_CHECKIN_AS_T2.pos,
      airside: false,
      precision: "schematic",
    });
    nodes.push({
      id: "ONT:node:gt:stub-dangling",
      name: "Stub ground transport (overlay drop test)",
      kind: "ground_transport",
      pos: [-117.59, 34.06],
      airside: false,
      precision: "schematic",
    });
  }

  for (const lounge of LOUNGES[iata]) {
    nodes.push({
      id: lounge.id,
      name: lounge.name,
      kind: "lounge",
      pos: lounge.pos,
      airside: true,
      precision: "schematic",
      ...(lounge.notes ? { notes: lounge.notes } : {}),
    });
  }

  const edges = [];

  if (iata === "ONT") {
    const t2 = officialGates.filter((g) => g.ref.startsWith("2")).sort((a, b) => a.ref.localeCompare(b.ref));
    const t4 = officialGates.filter((g) => g.ref.startsWith("4")).sort((a, b) => a.ref.localeCompare(b.ref));
    for (let i = 0; i < t2.length - 1; i++) {
      edges.push({
        id: `ONT:edge:t2-${t2[i].ref}-${t2[i + 1].ref}`,
        from: `ONT:node:gate:${t2[i].ref}`,
        to: `ONT:node:gate:${t2[i + 1].ref}`,
        kind: "walkway",
      });
    }
    for (let i = 0; i < t4.length - 1; i++) {
      edges.push({
        id: `ONT:edge:t4-${t4[i].ref}-${t4[i + 1].ref}`,
        from: `ONT:node:gate:${t4[i].ref}`,
        to: `ONT:node:gate:${t4[i + 1].ref}`,
        kind: "walkway",
      });
    }
    edges.push({
      id: "ONT:edge:stub-dangling",
      from: "ONT:node:gate:205",
      to: "ONT:node:gt:stub-dangling",
      kind: "walkway",
    });
  }

  if (iata === "SEA") {
    const trains = [
      { id: "SEA:node:train:a", pos: [-122.3021047, 47.4425616], name: "APM A" },
      { id: "SEA:node:train:b", pos: [-122.3030223, 47.4427865], name: "APM B" },
      { id: "SEA:node:train:s", pos: [-122.30205, 47.4395], name: "APM S satellite" },
      { id: "SEA:node:train:d", pos: [-122.301974, 47.4446959], name: "APM D" },
      { id: "SEA:node:train:c", pos: [-122.3033009, 47.4444182], name: "APM C" },
      { id: "SEA:node:train:n", pos: [-122.30268, 47.4482], name: "APM N satellite" },
    ];
    for (const t of trains) {
      nodes.push({ id: t.id, name: t.name, kind: "train_platform", pos: t.pos, airside: true, precision: "schematic" });
    }
    edges.push(
      { id: "SEA:edge:apm-a-b", from: "SEA:node:train:a", to: "SEA:node:train:b", kind: "train" },
      { id: "SEA:edge:apm-b-s", from: "SEA:node:train:b", to: "SEA:node:train:s", kind: "train" },
      { id: "SEA:edge:apm-d-c", from: "SEA:node:train:d", to: "SEA:node:train:c", kind: "train" },
      { id: "SEA:edge:apm-c-n", from: "SEA:node:train:c", to: "SEA:node:train:n", kind: "train" },
      { id: "SEA:edge:apm-a-d", from: "SEA:node:train:a", to: "SEA:node:train:d", kind: "train" },
    );
    const byLetter = new Map();
    for (const g of officialGates) {
      const letter = g.ref.charAt(0).toUpperCase();
      if (!byLetter.has(letter)) byLetter.set(letter, []);
      byLetter.get(letter).push(g);
    }
    for (const [letter, list] of byLetter) {
      const sorted = [...list].sort((a, b) => a.ref.localeCompare(b.ref));
      for (let i = 0; i < sorted.length - 1; i++) {
        edges.push({
          id: `SEA:edge:gate-${letter}-${sorted[i].ref}-${sorted[i + 1].ref}`,
          from: `SEA:node:gate:${sorted[i].ref}`,
          to: `SEA:node:gate:${sorted[i + 1].ref}`,
          kind: "walkway",
        });
      }
    }
  }

  const gateNodeResolver = officialGates
    .map((g) => ({ prefix: g.ref, nodeId: `${iata}:node:gate:${g.ref}` }))
    .sort((a, b) => b.prefix.length - a.prefix.length);

  const zones = iata === "ONT" ? buildOntZones() : buildSeaZones();

  return {
    schemaVersion: 1,
    iata,
    revision: 1,
    status: "draft",
    layout: {
      iata,
      name,
      layoutVersion,
      updatedAt: "2026-08-24T01:50:00Z",
      center,
      routeGrade: "schematic",
      zones,
      nodes,
      edges,
      gateNodeResolver,
      cookbookClass: "kac-compiler",
      compilerStage: "draft-overlay",
    },
    precisionGrade: "schematic",
    source: {
      ownership: "kepi_original",
      attribution: "KAC compiler draft — OpenStreetMap contributors (ODbL)",
      sourceUrls: ["https://www.openstreetmap.org"],
      licenseNote:
        "Schematic draft only — pins are approximate. Follow airport signage; no indoor turn-by-turn.",
      lastVerifiedAt: "2026-08-24",
    },
    createdAt: "2026-08-24T01:50:00Z",
    updatedAt: "2026-08-24T01:50:00Z",
    publishedAt: null,
  };
}

const ontGates = loadGates("/tmp/ont_gates.json");
const seaGates = loadGates("/tmp/sea_gates.json");

const outDir = join(root, "fixtures/kac");
writeFileSync(
  join(outDir, "ont.json"),
  JSON.stringify(buildPackage("ONT", "Ontario International", "kac-1.0.2-ont", ontGates, ONT_CENTER), null, 2) + "\n",
);
writeFileSync(
  join(outDir, "sea.json"),
  JSON.stringify(buildPackage("SEA", "Seattle–Tacoma International", "kac-1.0.2-sea", seaGates, SEA_CENTER), null, 2) + "\n",
);

console.log("ONT gates", ontGates.filter((g) => g.ref !== "213").length, "nodes", buildPackage("ONT", "x", "kac-1.0.2-ont", ontGates, ONT_CENTER).layout.nodes.length);
console.log("SEA gates", seaGates.length);
