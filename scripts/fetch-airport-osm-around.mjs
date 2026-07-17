/**
 * Around-based Overpass bootstrap (more reliable than area queries under load).
 * node scripts/fetch-airport-osm-around.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];
const UA = "KepiTravel-airport-bootstrap/1.0 (+https://kepitravel.com; ops@kepitravel.com)";

const AIRPORTS = {
  BRI: [41.138731, 16.760594],
  VCE: [45.505278, 12.351944],
  FCO: [41.800278, 12.238889],
  MUC: [48.353783, 11.786086],
};

function query(lat, lon) {
  return `[out:json][timeout:90];
(
  nwr(around:3000,${lat},${lon})["aeroway"="gate"];
  nwr(around:3000,${lat},${lon})["amenity"="lounge"];
  nwr(around:3000,${lat},${lon})["aeroway"="terminal"];
  way(around:3000,${lat},${lon})["building"="terminal"];
  way(around:3000,${lat},${lon})["building"="airport_terminal"];
);
out center tags;
`;
}

async function fetchOverpass(q) {
  let lastErr;
  for (const url of ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 120_000);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": UA,
          Accept: "application/json",
        },
        body: new URLSearchParams({ data: q }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      console.warn("FAIL", err instanceof Error ? err.message : err);
    }
  }
  throw lastErr;
}

function pos(e) {
  if (typeof e.lat === "number") return [e.lon, e.lat];
  if (e.center) return [e.center.lon, e.center.lat];
  return null;
}

function gateKey(tags) {
  const raw = String(tags.ref || tags.name || "").trim();
  if (!raw) return null;
  const m = raw.match(/^([A-Za-z]+)/);
  if (m) return m[1].toUpperCase();
  const n = parseInt(raw, 10);
  if (Number.isFinite(n)) {
    if (n >= 100) return String(Math.floor(n / 100));
    return "MAIN";
  }
  return "MAIN";
}

const outDir = path.join(process.cwd(), "scripts", ".tmp-airport-osm");
fs.mkdirSync(outDir, { recursive: true });

for (const [iata, [lat, lon]] of Object.entries(AIRPORTS)) {
  console.log(`\n=== ${iata} ===`);
  const data = await fetchOverpass(query(lat, lon));
  fs.writeFileSync(path.join(outDir, `${iata}.around.raw.json`), JSON.stringify(data));

  const gates = data.elements.filter((e) => e.tags?.aeroway === "gate");
  const lounges = data.elements.filter(
    (e) => e.tags?.amenity === "lounge" || /lounge/i.test(e.tags?.name || ""),
  );
  const terminals = data.elements.filter(
    (e) =>
      e.tags?.aeroway === "terminal"
      || e.tags?.building === "terminal"
      || e.tags?.building === "airport_terminal",
  );

  const clusters = new Map();
  for (const g of gates) {
    const p = pos(g);
    if (!p) continue;
    const key = gateKey(g.tags || {}) || "MAIN";
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key).push({ ref: g.tags.ref || g.tags.name || "?", pos: p });
  }

  const gateClusters = [...clusters.entries()]
    .map(([key, items]) => {
      const lng = items.reduce((s, i) => s + i.pos[0], 0) / items.length;
      const lat2 = items.reduce((s, i) => s + i.pos[1], 0) / items.length;
      return {
        key,
        count: items.length,
        centroid: [Number(lng.toFixed(6)), Number(lat2.toFixed(6))],
        sample: items.map((i) => i.ref).slice(0, 8),
      };
    })
    .sort((a, b) => b.count - a.count);

  const loungeList = lounges
    .map((l) => {
      const p = pos(l);
      return p
        ? { name: l.tags?.name || "(lounge)", pos: [Number(p[0].toFixed(6)), Number(p[1].toFixed(6))] }
        : null;
    })
    .filter(Boolean);

  const terminalList = terminals
    .map((t) => {
      const p = pos(t);
      return p
        ? {
            id: `${t.type}/${t.id}`,
            name: t.tags?.name || t.tags?.ref || "(terminal)",
            pos: [Number(p[0].toFixed(6)), Number(p[1].toFixed(6))],
          }
        : null;
    })
    .filter(Boolean);

  const summary = {
    iata,
    fetchedAt: new Date().toISOString(),
    stats: {
      gates: gates.length,
      lounges: loungeList.length,
      terminals: terminalList.length,
      clusters: gateClusters.length,
    },
    gateClusters,
    lounges: loungeList.slice(0, 25),
    terminals: terminalList.slice(0, 25),
  };
  fs.writeFileSync(path.join(outDir, `${iata}.around.summary.json`), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary.stats));
  console.log(gateClusters.map((c) => `${c.key}:${c.count}@${c.centroid}`).join(" | "));
  console.log("lounges:", loungeList.slice(0, 10).map((l) => l.name).join(" | "));
  await new Promise((r) => setTimeout(r, 10_000));
}

console.log("\nDone.");
