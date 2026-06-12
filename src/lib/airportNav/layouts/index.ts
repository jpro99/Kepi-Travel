import type { AirportTerminal3DModel } from "../types";

/** Curated SEA main terminal graph — Phase 0 MVP (hand-tuned, not survey-grade). */
export const SEA_TERMINAL_MODEL: AirportTerminal3DModel = {
  iata: "SEA",
  updatedAt: "2026-06-11T00:00:00.000Z",
  attribution: "Kepi curated layout (approximate SEA main terminal geometry)",
  center: { lng: -122.3088, lat: 47.4492 },
  levels: [
    {
      id: "L0",
      name: "Ticketing & Security (landside)",
      ordinal: 0,
      airside: "landside",
      extrusionHeight: 8,
      footprint: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { class: "terminal", name: "Main Terminal Landside" },
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [-122.3105, 47.4488],
                  [-122.3072, 47.4488],
                  [-122.3072, 47.4498],
                  [-122.3105, 47.4498],
                  [-122.3105, 47.4488],
                ],
              ],
            },
          },
        ],
      },
    },
    {
      id: "L1",
      name: "Concourse B/C Gate Level",
      ordinal: 1,
      airside: "airside",
      extrusionHeight: 6,
      footprint: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { class: "concourse", name: "Concourse B/C" },
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [-122.3102, 47.449],
                  [-122.3068, 47.449],
                  [-122.3068, 47.4502],
                  [-122.3102, 47.4502],
                  [-122.3102, 47.449],
                ],
              ],
            },
          },
        ],
      },
    },
  ],
  graph: {
    nodes: [
      {
        id: "landside-curb",
        pos: { lng: -122.3098, lat: 47.4486, level: "L0" },
        kind: "landmark",
        landmark: "Departures curb",
        region: "landside",
      },
      {
        id: "checkin-united",
        pos: { lng: -122.3092, lat: 47.4489, level: "L0" },
        kind: "checkin",
        landmark: "United check-in counters",
        region: "landside",
      },
      {
        id: "checkin-main",
        pos: { lng: -122.3085, lat: 47.4489, level: "L0" },
        kind: "checkin",
        landmark: "Main check-in hall",
        region: "landside",
      },
      {
        id: "sec-standard-entry",
        pos: { lng: -122.308, lat: 47.4491, level: "L0" },
        kind: "security_entry",
        landmark: "Standard security — center checkpoint",
        region: "security_queue",
      },
      {
        id: "sec-standard-exit",
        pos: { lng: -122.3078, lat: 47.4493, level: "L1" },
        kind: "security_exit",
        landmark: "Post-security — main concourse",
        region: "airside",
      },
      {
        id: "sec-precheck-entry",
        pos: { lng: -122.3083, lat: 47.44905, level: "L0" },
        kind: "security_entry",
        landmark: "TSA PreCheck entrance",
        region: "security_queue",
      },
      {
        id: "sec-precheck-exit",
        pos: { lng: -122.3079, lat: 47.44935, level: "L1" },
        kind: "security_exit",
        landmark: "PreCheck exit to concourse",
        region: "airside",
      },
      {
        id: "sec-clear-entry",
        pos: { lng: -122.3086, lat: 47.44905, level: "L0" },
        kind: "security_entry",
        landmark: "CLEAR pods — left corridor",
        region: "security_queue",
      },
      {
        id: "sec-clear-exit",
        pos: { lng: -122.3081, lat: 47.4494, level: "L1" },
        kind: "security_exit",
        landmark: "CLEAR exit to concourse",
        region: "airside",
      },
      {
        id: "sec-clear-precheck-entry",
        pos: { lng: -122.3084, lat: 47.44908, level: "L0" },
        kind: "security_entry",
        landmark: "CLEAR + PreCheck combined lane",
        region: "security_queue",
      },
      {
        id: "sec-clear-precheck-exit",
        pos: { lng: -122.308, lat: 47.44938, level: "L1" },
        kind: "security_exit",
        landmark: "Combined lane exit",
        region: "airside",
      },
      {
        id: "airside-hub",
        pos: { lng: -122.3076, lat: 47.4495, level: "L1" },
        kind: "junction",
        landmark: "Central concourse hub",
        region: "airside",
      },
      {
        id: "lounge-centurion",
        pos: { lng: -122.3074, lat: 47.44965, level: "L1" },
        kind: "lounge",
        landmark: "Centurion Lounge mezzanine",
        region: "airside",
      },
      {
        id: "lounge-admirals",
        pos: { lng: -122.3072, lat: 47.44955, level: "L1" },
        kind: "lounge",
        landmark: "Admirals Club",
        region: "airside",
      },
      {
        id: "lounge-united",
        pos: { lng: -122.3088, lat: 47.4497, level: "L1" },
        kind: "lounge",
        landmark: "United Club near B gates",
        region: "airside",
      },
      {
        id: "lounge-delta",
        pos: { lng: -122.3069, lat: 47.44975, level: "L1" },
        kind: "lounge",
        landmark: "Delta Sky Club",
        region: "airside",
      },
      {
        id: "gate-b32",
        pos: { lng: -122.3095, lat: 47.44985, level: "L1" },
        kind: "gate",
        landmark: "Gate B32",
        region: "airside",
      },
      {
        id: "gate-b28",
        pos: { lng: -122.309, lat: 47.4498, level: "L1" },
        kind: "gate",
        landmark: "Gate B28",
        region: "airside",
      },
      {
        id: "gate-c10",
        pos: { lng: -122.307, lat: 47.4499, level: "L1" },
        kind: "gate",
        landmark: "Gate C10",
        region: "airside",
      },
    ],
    edges: [
      { id: "e-curb-united", from: "landside-curb", to: "checkin-united", kind: "walkway", lengthM: 80, traverseSeconds: 90, bidirectional: true, accessible: true },
      { id: "e-united-main", from: "checkin-united", to: "checkin-main", kind: "walkway", lengthM: 45, traverseSeconds: 50, bidirectional: true, accessible: true },
      { id: "e-main-sec-std", from: "checkin-main", to: "sec-standard-entry", kind: "walkway", lengthM: 35, traverseSeconds: 40, bidirectional: true, accessible: true },
      { id: "e-main-sec-pre", from: "checkin-main", to: "sec-precheck-entry", kind: "walkway", lengthM: 30, traverseSeconds: 35, bidirectional: true, accessible: true },
      { id: "e-main-sec-clear", from: "checkin-main", to: "sec-clear-entry", kind: "walkway", lengthM: 40, traverseSeconds: 45, bidirectional: true, accessible: true },
      { id: "e-main-sec-both", from: "checkin-main", to: "sec-clear-precheck-entry", kind: "walkway", lengthM: 38, traverseSeconds: 42, bidirectional: true, accessible: true },
      {
        id: "e-sec-std", from: "sec-standard-entry", to: "sec-standard-exit", kind: "security_transition",
        lengthM: 60, traverseSeconds: 1200, bidirectional: false, accessible: true, laneType: "standard",
      },
      {
        id: "e-sec-pre", from: "sec-precheck-entry", to: "sec-precheck-exit", kind: "security_transition",
        lengthM: 55, traverseSeconds: 480, bidirectional: false, accessible: true, laneType: "precheck",
      },
      {
        id: "e-sec-clear", from: "sec-clear-entry", to: "sec-clear-exit", kind: "security_transition",
        lengthM: 50, traverseSeconds: 360, bidirectional: false, accessible: true, laneType: "clear",
      },
      {
        id: "e-sec-both", from: "sec-clear-precheck-entry", to: "sec-clear-precheck-exit", kind: "security_transition",
        lengthM: 52, traverseSeconds: 420, bidirectional: false, accessible: true, laneType: "clear_precheck",
      },
      { id: "e-std-hub", from: "sec-standard-exit", to: "airside-hub", kind: "walkway", lengthM: 25, traverseSeconds: 30, bidirectional: true, accessible: true },
      { id: "e-pre-hub", from: "sec-precheck-exit", to: "airside-hub", kind: "walkway", lengthM: 20, traverseSeconds: 25, bidirectional: true, accessible: true },
      { id: "e-clear-hub", from: "sec-clear-exit", to: "airside-hub", kind: "walkway", lengthM: 22, traverseSeconds: 28, bidirectional: true, accessible: true },
      { id: "e-both-hub", from: "sec-clear-precheck-exit", to: "airside-hub", kind: "walkway", lengthM: 18, traverseSeconds: 22, bidirectional: true, accessible: true },
      { id: "e-hub-centurion", from: "airside-hub", to: "lounge-centurion", kind: "escalator", lengthM: 40, traverseSeconds: 90, bidirectional: true, accessible: false },
      { id: "e-hub-admirals", from: "airside-hub", to: "lounge-admirals", kind: "walkway", lengthM: 35, traverseSeconds: 45, bidirectional: true, accessible: true },
      { id: "e-hub-united", from: "airside-hub", to: "lounge-united", kind: "walkway", lengthM: 90, traverseSeconds: 110, bidirectional: true, accessible: true },
      { id: "e-hub-delta", from: "airside-hub", to: "lounge-delta", kind: "walkway", lengthM: 70, traverseSeconds: 85, bidirectional: true, accessible: true },
      { id: "e-hub-b32", from: "airside-hub", to: "gate-b32", kind: "walkway", lengthM: 120, traverseSeconds: 140, bidirectional: true, accessible: true },
      { id: "e-hub-b28", from: "airside-hub", to: "gate-b28", kind: "walkway", lengthM: 95, traverseSeconds: 110, bidirectional: true, accessible: true },
      { id: "e-hub-c10", from: "airside-hub", to: "gate-c10", kind: "walkway", lengthM: 60, traverseSeconds: 75, bidirectional: true, accessible: true },
    ],
  },
  securityLanes: [
    {
      id: "sea-standard",
      laneType: "standard",
      entryNodeId: "sec-standard-entry",
      exitNodeId: "sec-standard-exit",
      estimatedWaitMin: { low: 15, high: 30, source: "static", asOf: "2026-06-11" },
    },
    {
      id: "sea-precheck",
      laneType: "precheck",
      entryNodeId: "sec-precheck-entry",
      exitNodeId: "sec-precheck-exit",
      estimatedWaitMin: { low: 5, high: 12, source: "static", asOf: "2026-06-11" },
      notes: "TSA PreCheck dedicated lane",
    },
    {
      id: "sea-clear",
      laneType: "clear",
      entryNodeId: "sec-clear-entry",
      exitNodeId: "sec-clear-exit",
      estimatedWaitMin: { low: 3, high: 8, source: "static", asOf: "2026-06-11" },
      notes: "CLEAR pods are LEFT of PreCheck at SEA Checkpoint 3",
    },
    {
      id: "sea-clear-precheck",
      laneType: "clear_precheck",
      entryNodeId: "sec-clear-precheck-entry",
      exitNodeId: "sec-clear-precheck-exit",
      estimatedWaitMin: { low: 4, high: 10, source: "static", asOf: "2026-06-11" },
    },
  ],
  pois: [
    { id: "poi-checkin-united", nodeId: "checkin-united", category: "checkin", name: "United Check-in", airline: "United" },
    { id: "poi-checkin-main", nodeId: "checkin-main", category: "checkin", name: "Main Check-in" },
    { id: "poi-security", nodeId: "sec-standard-entry", category: "security", name: "Security" },
    { id: "poi-security-standard", nodeId: "sec-standard-entry", category: "security", name: "Standard Security" },
    { id: "poi-security-precheck", nodeId: "sec-precheck-entry", category: "security", name: "TSA PreCheck" },
    { id: "poi-security-clear", nodeId: "sec-clear-entry", category: "security", name: "CLEAR" },
    { id: "poi-security-both", nodeId: "sec-clear-precheck-entry", category: "security", name: "CLEAR + PreCheck" },
    { id: "poi-lounge-centurion", nodeId: "lounge-centurion", category: "lounge", name: "Centurion Lounge", loungeId: "sea-centurion" },
    { id: "poi-lounge-admirals", nodeId: "lounge-admirals", category: "lounge", name: "Admirals Club", loungeId: "sea-admirals", airline: "American" },
    { id: "poi-lounge-united", nodeId: "lounge-united", category: "lounge", name: "United Club", loungeId: "sea-united-club", airline: "United" },
    { id: "poi-lounge-delta", nodeId: "lounge-delta", category: "lounge", name: "Delta Sky Club", loungeId: "sea-delta-sky", airline: "Delta" },
    { id: "poi-gate-b32", nodeId: "gate-b32", category: "gate", name: "Gate B32", airline: "United", gateCode: "B32" },
    { id: "poi-gate-b28", nodeId: "gate-b28", category: "gate", name: "Gate B28", gateCode: "B28" },
    { id: "poi-gate-c10", nodeId: "gate-c10", category: "gate", name: "Gate C10", gateCode: "C10" },
  ],
};

const LAYOUT_REGISTRY: Record<string, AirportTerminal3DModel> = {
  SEA: SEA_TERMINAL_MODEL,
};

/** Normalize messy airport strings ("Terminal 4, JFK", " sea ") to a 3-letter IATA code. */
export function normalizeAirportIata(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/\b([A-Z]{3})\b/);
  return match?.[1] ?? trimmed.slice(0, 3).padEnd(3, "X");
}

export function getAirportLayout(iata: string): AirportTerminal3DModel | null {
  const normalized = normalizeAirportIata(iata);
  return LAYOUT_REGISTRY[normalized] ?? null;
}

export function listSupportedAirports(): string[] {
  return Object.keys(LAYOUT_REGISTRY);
}
