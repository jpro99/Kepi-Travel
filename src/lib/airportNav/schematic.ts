import type { AirportLayout, PoiDefinition } from "@/lib/airportNav/types";

export interface SchematicPoint {
  x: number;
  y: number;
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
  pois: Array<{
    definition: PoiDefinition;
    point: SchematicPoint;
  }>;
  project: (coordinate: [number, number]) => SchematicPoint;
}

const VIEWBOX_PADDING = 6;
const VIEWBOX_SPAN = 100 - VIEWBOX_PADDING * 2;

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
