/**
 * Booked-gate map highlight — door-ref via gateNodeResolver (longest prefix),
 * airline section fallback when gate string does not join.
 */

import type { AirportLayout, PoiDefinition } from "../types";
import { resolveGateNode } from "../pathfinder";

export interface BookedGateHighlight {
  nodeId: string;
  poi: PoiDefinition | null;
  /** true when gate code resolved to an individual door-ref node (not cluster hub). */
  exactDoor: boolean;
}

function findPoiForNode(layout: AirportLayout, nodeId: string): PoiDefinition | null {
  return (
    layout.pois.find((p) => p.nodeId === nodeId && p.category === "gate") ??
    layout.pois.find((p) => p.nodeId === nodeId && Boolean(p.doorLabel)) ??
    layout.pois.find((p) => p.nodeId === nodeId) ??
    null
  );
}

function isExactDoorResolution(
  layout: AirportLayout,
  nodeId: string,
  gateCode: string,
): boolean {
  const node = layout.nodes.find((n) => n.id === nodeId);
  if (!node || node.kind !== "gate") return false;
  if (nodeId.includes(":node:gate:")) return true;
  const code = gateCode.trim().toUpperCase();
  const poi = layout.pois.find((p) => p.nodeId === nodeId);
  if (poi?.doorLabel?.toUpperCase() === code) return true;
  return code.length >= 2 && !["gate-t2", "gate-t4", "gate-A", "gate-B", "gate-C", "gate-D", "gate-N", "gate-S"].includes(nodeId);
}

function resolveAirlineSectionNode(
  layout: AirportLayout,
  airlineName?: string | null,
): string | null {
  const airline = airlineName?.trim().toLowerCase() ?? "";
  if (!airline) return null;

  if (layout.iata === "ONT" && airline.includes("alaska")) {
    return "gate-t2";
  }

  if (layout.iata === "SEA" && airline.includes("alaska")) {
    return "gate-C";
  }

  const checkin = layout.pois.find(
    (p) => p.category === "checkin" && p.airline && airline.includes(p.airline.toLowerCase()),
  );
  if (checkin) {
    const paired = checkin.nodeId.replace(/^checkin-/, "gate-");
    if (layout.nodes.some((n) => n.id === paired)) return paired;
    return checkin.nodeId;
  }

  return null;
}

/**
 * Resolve which map pin to flash for a booked gate assignment.
 * Never invents a gate — returns null when nothing joins.
 */
export function resolveBookedGateHighlight(
  layout: AirportLayout | null | undefined,
  gateCode: string | null | undefined,
  airlineName?: string | null,
): BookedGateHighlight | null {
  if (!layout) return null;

  const trimmed = gateCode?.trim();
  if (trimmed) {
    const nodeId = resolveGateNode(layout, trimmed);
    if (nodeId) {
      return {
        nodeId,
        poi: findPoiForNode(layout, nodeId),
        exactDoor: isExactDoorResolution(layout, nodeId, trimmed),
      };
    }
  }

  const sectionNodeId = resolveAirlineSectionNode(layout, airlineName);
  if (!sectionNodeId) return null;

  return {
    nodeId: sectionNodeId,
    poi: findPoiForNode(layout, sectionNodeId),
    exactDoor: false,
  };
}
