/**
 * Bootstrap Overpass pull for new airport layouts (verify-first).
 * Usage: node scripts/fetch-airport-osm-bootstrap.mjs BRI FCO VCE MUC
 * Writes JSON under scripts/.tmp-airport-osm/
 */
import fs from "node:fs";
import path from "node:path";

const IATAS = process.argv.slice(2).map((s) => s.toUpperCase()).filter((s) => /^[A-Z]{3}$/.test(s));
if (IATAS.length === 0) {
  console.error("Usage: node scripts/fetch-airport-osm-bootstrap.mjs BRI FCO VCE MUC");
  process.exit(1);
}

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const UA = "KepiTravel-airport-bootstrap/1.0 (+https://kepitravel.com; ops@kepitravel.com)";

function queryFor(iata) {
  return `[out:json][timeout:120];
area["iata"="${iata}"]["aeroway"="aerodrome"]->.a;
(
  nwr(area.a)["aeroway"="gate"];
  nwr(area.a)["amenity"="lounge"];
  nwr(area.a)["leisure"="lounge"];
  nwr(area.a)["aeroway"="terminal"];
  way(area.a)["building"="terminal"];
  way(area.a)["building:part"="terminal"];
);
out center tags;
`;
}

async function fetchOverpass(query) {
  let lastErr;
  for (const url of ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 130_000);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": UA,
          Accept: "application/json",
        },
        body: new URLSearchParams({ data: query }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      console.warn(`FAIL ${url}:`, err instanceof Error ? err.message : err);
    }
  }
  throw lastErr;
}

function centroidOf(elements) {
  const pts = [];
  for (const el of elements) {
    if (typeof el.lat === "number" && typeof el.lon === "number") pts.push([el.lon, el.lat]);
    else if (el.center && typeof el.center.lat === "number") pts.push([el.center.lon, el.center.lat]);
  }
  if (pts.length === 0) return null;
  const lng = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return [lng, lat];
}

function clusterGates(gates) {
  /** @type {Map<string, Array<{ref:string,pos:[number,number]}>>} */
  const clusters = new Map();
  for (const g of gates) {
    const ref = String(g.tags?.ref ?? "").trim();
    if (!ref) continue;
    let pos = null;
    if (typeof g.lat === "number") pos = [g.lon, g.lat];
    else if (g.center) pos = [g.center.lon, g.center.lat];
    if (!pos) continue;
    // Letter prefix (A12) or numeric hundred-block (201→2, 401→4, 12→1)
    let key = "other";
    const letter = ref.match(/^([A-Z]+)/i);
    if (letter) key = letter[1].toUpperCase();
    else {
      const num = parseInt(ref, 10);
      if (Number.isFinite(num)) {
        if (num >= 100) key = String(Math.floor(num / 100));
        else key = String(Math.floor(num / 10) || "0");
      }
    }
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key).push({ ref, pos });
  }
  const out = [];
  for (const [key, items] of [...clusters.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const lng = items.reduce((s, i) => s + i.pos[0], 0) / items.length;
    const lat = items.reduce((s, i) => s + i.pos[1], 0) / items.length;
    const refs = items.map((i) => i.ref).sort();
    out.push({
      key,
      count: items.length,
      centroid: [Number(lng.toFixed(6)), Number(lat.toFixed(6))],
      refSample: refs.slice(0, 8),
      refMin: refs[0],
      refMax: refs[refs.length - 1],
    });
  }
  return out;
}

function summarize(iata, data) {
  const els = data.elements ?? [];
  const gates = els.filter((e) => e.tags?.aeroway === "gate");
  const lounges = els.filter(
    (e) => e.tags?.amenity === "lounge" || e.tags?.leisure === "lounge" || /lounge/i.test(e.tags?.name ?? ""),
  );
  const terminals = els.filter(
    (e) => e.tags?.aeroway === "terminal" || e.tags?.building === "terminal" || e.tags?.["building:part"] === "terminal",
  );
  const gateClusters = clusterGates(gates);
  const loungeList = lounges
    .map((l) => {
      const pos =
        typeof l.lat === "number"
          ? [l.lon, l.lat]
          : l.center
            ? [l.center.lon, l.center.lat]
            : null;
      if (!pos) return null;
      return {
        id: `${l.type}/${l.id}`,
        name: l.tags?.name ?? "(unnamed lounge)",
        pos: [Number(pos[0].toFixed(6)), Number(pos[1].toFixed(6))],
      };
    })
    .filter(Boolean);

  const terminalAnchors = terminals
    .map((t) => {
      const pos =
        typeof t.lat === "number"
          ? [t.lon, t.lat]
          : t.center
            ? [t.center.lon, t.center.lat]
            : null;
      if (!pos) return null;
      return {
        id: `${t.type}/${t.id}`,
        name: t.tags?.name ?? t.tags?.ref ?? "(terminal)",
        pos: [Number(pos[0].toFixed(6)), Number(pos[1].toFixed(6))],
      };
    })
    .filter(Boolean);

  const center = centroidOf([...gates, ...terminals]) ?? centroidOf(els);
  return {
    iata,
    fetchedAt: new Date().toISOString(),
    stats: {
      elements: els.length,
      gates: gates.length,
      gatesWithRef: gates.filter((g) => g.tags?.ref).length,
      lounges: loungeList.length,
      terminals: terminalAnchors.length,
      clusters: gateClusters.length,
    },
    center: center ? [Number(center[0].toFixed(6)), Number(center[1].toFixed(6))] : null,
    gateClusters,
    lounges: loungeList,
    terminals: terminalAnchors,
  };
}

const outDir = path.join(process.cwd(), "scripts", ".tmp-airport-osm");
fs.mkdirSync(outDir, { recursive: true });

for (const iata of IATAS) {
  console.log(`\n=== ${iata} ===`);
  const data = await fetchOverpass(queryFor(iata));
  const summary = summarize(iata, data);
  const rawPath = path.join(outDir, `${iata}.raw.json`);
  const sumPath = path.join(outDir, `${iata}.summary.json`);
  fs.writeFileSync(rawPath, JSON.stringify(data));
  fs.writeFileSync(sumPath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary.stats, null, 2));
  console.log("center", summary.center);
  console.log("clusters", summary.gateClusters.map((c) => `${c.key}:${c.count}@${c.centroid}`).join(" | "));
  console.log("lounges", summary.lounges.slice(0, 12).map((l) => l.name).join(" | "));
  console.log("wrote", sumPath);
}

console.log("\nDone.");
