/**
 * Paints walk-map leader-line callouts in screen space (outside hull, collision-safe).
 */

import {
  computeLeaderLineScreenLayout,
  layoutToLabelBox,
  resolveLeaderLabelCollisions,
  type LeaderLabelBox,
} from "./poiMapLeaderLine";
import type { TerminalZonePolygon } from "./types";
import { booleanPointInPolygon, point, polygon } from "@turf/turf";

export interface WalkMapLeaderCandidate {
  id: string;
  text: string;
  lngLat: [number, number];
  priority: number;
  strokeColor: string;
}

export function buildResolvedLeaderBoxes(
  candidates: WalkMapLeaderCandidate[],
  hulls: TerminalZonePolygon[],
  mapWidth: number,
  mapHeight: number,
  project: (lngLat: [number, number]) => { x: number; y: number },
): Array<LeaderLabelBox & { text: string; strokeColor: string }> {
  const hullSpread = new Map<string, number>();
  const boxes = candidates.map((candidate) => {
    const pin = project(candidate.lngLat);
    let spreadIndex = 0;
    for (const zone of hulls) {
      if (zone.ring.length < 4) continue;
      try {
        if (booleanPointInPolygon(point(candidate.lngLat), polygon([zone.ring]))) {
          const key = zone.id;
          spreadIndex = hullSpread.get(key) ?? 0;
          hullSpread.set(key, spreadIndex + 1);
          break;
        }
      } catch {
        /* invalid ring */
      }
    }
    const layout = computeLeaderLineScreenLayout(
      pin,
      candidate.text,
      candidate.lngLat,
      hulls,
      project,
      mapWidth,
      mapHeight,
      spreadIndex,
    );
    const box = layoutToLabelBox(candidate.id, candidate.priority, layout);
    return { ...box, text: candidate.text, strokeColor: candidate.strokeColor };
  });
  return resolveLeaderLabelCollisions(boxes, mapWidth, mapHeight) as Array<
    LeaderLabelBox & { text: string; strokeColor: string }
  >;
}

export function paintWalkMapLeaderOverlay(
  overlay: HTMLElement,
  boxes: Array<LeaderLabelBox & { text: string; strokeColor: string }>,
  mapWidth: number,
  mapHeight: number,
): void {
  overlay.replaceChildren();
  if (boxes.length === 0) return;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", String(mapWidth));
  svg.setAttribute("height", String(mapHeight));
  svg.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:visible;";

  for (const box of boxes) {
    const pinDot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    pinDot.setAttribute("cx", String(box.pinX));
    pinDot.setAttribute("cy", String(box.pinY));
    pinDot.setAttribute("r", "3.5");
    pinDot.setAttribute("fill", "#0f172a");
    pinDot.setAttribute("stroke", "#ffffff");
    pinDot.setAttribute("stroke-width", "1.25");
    svg.appendChild(pinDot);

    const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    line.setAttribute(
      "points",
      `${box.pinX},${box.pinY} ${box.elbowX},${box.elbowY} ${box.x + box.width / 2},${box.y + box.height / 2}`,
    );
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", "#475569");
    line.setAttribute("stroke-width", "1.25");
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("stroke-linejoin", "round");
    svg.appendChild(line);

    const fo = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
    fo.setAttribute("x", String(box.x));
    fo.setAttribute("y", String(box.y));
    fo.setAttribute("width", String(box.width));
    fo.setAttribute("height", String(box.height));
    const label = document.createElement("div");
    label.textContent = box.text;
    label.style.cssText = [
      "display:flex;align-items:center;justify-content:center;",
      "width:100%;min-height:100%;padding:4px 10px;",
      "border-radius:4px;background:#f5f0e6;",
      "border:1px solid rgba(71,85,105,0.35);",
      "box-shadow:0 1px 4px rgba(15,23,42,0.12);",
      "font:600 11px/1.25 system-ui,-apple-system,sans-serif;",
      "color:#0f172a;white-space:normal;text-align:center;",
      "overflow:visible;word-break:normal;",
      "pointer-events:none;",
    ].join("");
    fo.appendChild(label);
    svg.appendChild(fo);
  }

  overlay.appendChild(svg);
}
