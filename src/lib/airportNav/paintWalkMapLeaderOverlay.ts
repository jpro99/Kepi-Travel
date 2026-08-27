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
  const boxes = candidates.map((candidate) => {
    const pin = project(candidate.lngLat);
    const layout = computeLeaderLineScreenLayout(
      pin,
      candidate.text,
      candidate.lngLat,
      hulls,
      project,
      mapWidth,
      mapHeight,
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
    const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    line.setAttribute(
      "points",
      `${box.pinX},${box.pinY} ${box.elbowX},${box.elbowY} ${box.x + box.width / 2},${box.y + box.height / 2}`,
    );
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", box.strokeColor);
    line.setAttribute("stroke-width", "2");
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("stroke-linejoin", "round");
    svg.appendChild(line);

    const fo = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
    fo.setAttribute("x", String(box.x));
    fo.setAttribute("y", String(box.y));
    fo.setAttribute("width", String(box.width));
    fo.setAttribute("height", String(box.height));
    const pill = document.createElement("div");
    pill.textContent = box.text;
    pill.style.cssText = [
      "display:flex;align-items:center;justify-content:center;",
      "width:100%;height:100%;padding:0 8px;",
      "border-radius:9999px;background:#ffffff;",
      "border:1.5px solid rgba(15,23,42,0.14);",
      "box-shadow:0 2px 10px rgba(15,23,42,0.2);",
      "font:700 11px system-ui,-apple-system,sans-serif;",
      "color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;",
      "pointer-events:none;",
    ].join("");
    fo.appendChild(pill);
    svg.appendChild(fo);
  }

  overlay.appendChild(svg);
}
