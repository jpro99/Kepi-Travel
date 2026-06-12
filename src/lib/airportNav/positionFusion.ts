import type { IndoorPositionFix, WalkwayGraph } from "./types";

export function fuseFix(
  previous: IndoorPositionFix | null,
  incoming: IndoorPositionFix,
  graph: WalkwayGraph | null,
): IndoorPositionFix {
  if (!previous) {
    return decayConfidence(incoming, graph);
  }

  const elapsedMs = Date.parse(incoming.at) - Date.parse(previous.at);
  if (elapsedMs < 0) return incoming;

  if (incoming.source === "user_confirmed") {
    return { ...incoming, confidence: Math.max(incoming.confidence, 0.95) };
  }

  if (incoming.source === "os_indoor") {
    return {
      ...incoming,
      confidence: Math.min(0.92, Math.max(incoming.confidence, 0.78)),
    };
  }

  if (incoming.source === "dead_reckoning") {
    const decaySeconds = elapsedMs / 1000;
    const decay = Math.max(0.25, 1 - decaySeconds / 120);
    return {
      ...incoming,
      confidence: Math.min(previous.confidence * decay, 0.55),
    };
  }

  const blendedConfidence =
    previous.confidence * 0.35 + incoming.confidence * 0.65;
  return {
    ...incoming,
    confidence: Math.min(0.85, Math.max(blendedConfidence, 0.4)),
  };
}

function decayConfidence(
  fix: IndoorPositionFix,
  graph: WalkwayGraph | null,
): IndoorPositionFix {
  if (!graph || graph.nodes.length === 0) return fix;
  if (fix.accuracyM <= 12) {
    return { ...fix, confidence: Math.max(fix.confidence, 0.7) };
  }
  if (fix.accuracyM <= 30) {
    return { ...fix, confidence: Math.max(fix.confidence, 0.55) };
  }
  return { ...fix, confidence: Math.min(fix.confidence, 0.45) };
}

export function fixFromGps(
  lng: number,
  lat: number,
  level: string,
  accuracyM: number,
  heading?: number,
): IndoorPositionFix {
  const confidence =
    accuracyM <= 10 ? 0.75 : accuracyM <= 25 ? 0.62 : accuracyM <= 45 ? 0.48 : 0.35;
  return {
    pos: { lng, lat, level },
    accuracyM,
    confidence,
    source: accuracyM <= 15 ? "os_indoor" : "gps_snap",
    heading,
    at: new Date().toISOString(),
  };
}
