import type { AirportLayout, PoiDefinition } from "@/lib/airportNav/types";

export interface SchematicPoint {
  x: number;
  y: number;
}

export interface SchematicPoi {
  definition: PoiDefinition;
  point: SchematicPoint;
}

export interface PlacedSchematicPoi extends SchematicPoi {
  labelPoint: SchematicPoint;
}

export interface AirportSchematicModel {
  zones: Array<{
    id: string;
    name: string;
    airside: boolean;
    points: SchematicPoint[];
    label: SchematicPoint;
  }>;
  walkways: Array<{
    id: string;
    train: boolean;
    from: SchematicPoint;
    to: SchematicPoint;
  }>;
  pois: SchematicPoi[];
  project: (coordinate: [number, number]) => SchematicPoint;
}

const VIEWBOX_PADDING = 6;
const VIEWBOX_SPAN = 100 - VIEWBOX_PADDING * 2;
const LABEL_EDGE_PADDING = 13;
const LABEL_X_GAP = 10;
const LABEL_Y_GAP = 6;

function averagePoint(points: SchematicPoint[]): SchematicPoint {
  if (points.length === 0) return { x: 50, y: 50 };
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

/**
 * Projects a curated airport layout into a network- and WebGL-independent
 * 100×100 coordinate system used by the resilient SVG terminal renderer.
 */
export function buildAirportSchematicModel(layout: AirportLayout): AirportSchematicModel {
  const coordinates = [
    ...layout.zones.flatMap((zone) => zone.ring),
    ...layout.nodes.map((node) => node.pos),
  ];
  const lngs = coordinates.map(([lng]) => lng);
  const lats = coordinates.map(([, lat]) => lat);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const lngSpan = Math.max(maxLng - minLng, 0.000001);
  const latSpan = Math.max(maxLat - minLat, 0.000001);

  const project = ([lng, lat]: [number, number]): SchematicPoint => ({
    x: VIEWBOX_PADDING + ((lng - minLng) / lngSpan) * VIEWBOX_SPAN,
    y: VIEWBOX_PADDING + ((maxLat - lat) / latSpan) * VIEWBOX_SPAN,
  });

  const nodePositions = new Map(layout.nodes.map((node) => [node.id, project(node.pos)]));

  return {
    zones: layout.zones.map((zone) => {
      const points = zone.ring.map(project);
      return {
        id: zone.id,
        name: zone.name,
        airside: zone.airside,
        points,
        label: averagePoint(points.slice(0, -1)),
      };
    }),
    walkways: layout.edges.flatMap((edge) => {
      if (edge.kind === "security_transition") return [];
      const from = nodePositions.get(edge.from);
      const to = nodePositions.get(edge.to);
      if (!from || !to) return [];
      return [{
        id: edge.id,
        train: edge.kind === "train",
        from,
        to,
      }];
    }),
    pois: layout.pois.flatMap((definition) => {
      const point = nodePositions.get(definition.nodeId);
      return point ? [{ definition, point }] : [];
    }),
    project,
  };
}

/**
 * Keeps labels in the same SVG coordinate space as their POIs, offsets them
 * only enough to expose the anchor, and staggers nearby labels to reduce
 * collisions. The maximum displacement stays intentionally short so labels
 * continue to explain where each place actually sits in the terminal.
 */
export function placeAirportSchematicLabels(pois: SchematicPoi[]): PlacedSchematicPoi[] {
  const occupied: SchematicPoint[] = [];

  return pois.map((poi) => {
    const direction = poi.point.x >= 50 ? -1 : 1;
    let x = poi.point.x + direction * LABEL_X_GAP;
    let y = poi.point.y;
    x = Math.min(100 - LABEL_EDGE_PADDING, Math.max(LABEL_EDGE_PADDING, x));
    y = Math.min(94, Math.max(6, y));

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const collision = occupied.find(
        (point) => Math.abs(point.x - x) < 18 && Math.abs(point.y - y) < LABEL_Y_GAP,
      );
      if (!collision) break;
      const shiftedDown = collision.y + LABEL_Y_GAP;
      y = shiftedDown <= 94 ? shiftedDown : Math.max(6, collision.y - LABEL_Y_GAP);
    }
    y = Math.min(poi.point.y + 12, Math.max(poi.point.y - 12, y));
    y = Math.min(94, Math.max(6, y));

    const labelPoint = { x, y };
    occupied.push(labelPoint);
    return { ...poi, labelPoint };
  });
}
