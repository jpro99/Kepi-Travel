"use client";

import { useMemo } from "react";
import {
  buildTripTransportRoute,
  segmentKindEmoji,
  segmentStrokeColor,
  type TripTransportSegment,
  type TransportRouteReservation,
} from "@/lib/travelAssistant/tripTransportRoute";
import type { PlannedFlightLeg } from "@/lib/travelAssistant/tripPlanBooking";

interface TripTransportRouteMapProps {
  reservations: TransportRouteReservation[];
  plannedFlightLegs?: PlannedFlightLeg[];
  onSegmentTap?: (reservationId: string) => void;
}

interface MapPoint {
  code: string;
  label: string;
  lat: number;
  lon: number;
}

function collectGeoPoints(segments: TripTransportSegment[]): MapPoint[] {
  const points: MapPoint[] = [];
  const seen = new Set<string>();

  for (const segment of segments) {
    if (segment.lat != null && segment.lon != null && !seen.has(segment.fromCode)) {
      seen.add(segment.fromCode);
      points.push({ code: segment.fromCode, label: segment.fromLabel, lat: segment.lat, lon: segment.lon });
    }
    if (segment.toLat != null && segment.toLon != null && !seen.has(segment.toCode)) {
      seen.add(segment.toCode);
      points.push({ code: segment.toCode, label: segment.toLabel, lat: segment.toLat, lon: segment.toLon });
    }
  }
  return points;
}

function projectPoint(
  lat: number,
  lon: number,
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number },
  width: number,
  height: number,
  pad: number,
): { x: number; y: number } {
  const lonSpan = Math.max(bounds.maxLon - bounds.minLon, 8);
  const latSpan = Math.max(bounds.maxLat - bounds.minLat, 6);
  const x = pad + ((lon - bounds.minLon) / lonSpan) * (width - pad * 2);
  const y = pad + ((bounds.maxLat - lat) / latSpan) * (height - pad * 2);
  return { x, y };
}

function arcPath(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = -dy / dist;
  const ny = dx / dist;
  const bulge = Math.min(dist * 0.22, 72);
  return `M ${x1} ${y1} Q ${mx + nx * bulge} ${my + ny * bulge} ${x2} ${y2}`;
}

function SegmentCard({
  segment,
  index,
  onTap,
}: {
  segment: TripTransportSegment;
  index: number;
  onTap?: (id: string) => void;
}) {
  const color = segmentStrokeColor(segment);
  const clickable = Boolean(segment.reservationId && onTap);

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={() => segment.reservationId && onTap?.(segment.reservationId)}
      className={`min-w-[11rem] shrink-0 rounded-2xl border p-3 text-left transition ${
        segment.status === "conflict"
          ? "border-red-400/60 bg-red-500/10"
          : segment.booked
            ? "border-white/10 bg-white/5 hover:bg-white/10"
            : "border-white/10 bg-white/[0.03] opacity-80"
      } ${clickable ? "cursor-pointer" : "cursor-default"}`}
    >
      <div className="flex items-center gap-2">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full text-xs"
          style={{ backgroundColor: `${color}22`, color }}
        >
          {segmentKindEmoji(segment.kind)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-black text-white">{segment.headline}</p>
          <p className="truncate text-[10px] text-sky-100/60">
            {segment.fromCode} → {segment.toCode}
          </p>
        </div>
        <span className="text-[10px] font-bold text-sky-200/50">#{index + 1}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-semibold">
        {segment.dateDisplay ? (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-sky-100/80">{segment.dateDisplay}</span>
        ) : null}
        {segment.departDisplay !== "TBD" ? (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-sky-100/80">Dep {segment.departDisplay}</span>
        ) : null}
        {segment.arriveDisplay ? (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-sky-100/80">Arr {segment.arriveDisplay}</span>
        ) : null}
      </div>
      <p className="mt-2 text-[10px] leading-snug text-sky-100/55">{segment.connectionIssue ?? segment.subline}</p>
    </button>
  );
}

export function TripTransportRouteMap({
  reservations,
  plannedFlightLegs = [],
  onSegmentTap,
}: TripTransportRouteMapProps) {
  const route = useMemo(
    () => buildTripTransportRoute(reservations, plannedFlightLegs),
    [plannedFlightLegs, reservations],
  );

  if (route.segments.length === 0) return null;

  const geoPoints = collectGeoPoints(route.segments);
  const hasGeo = geoPoints.length >= 2;

  const svgWidth = 760;
  const svgHeight = 280;
  const pad = 36;

  const bounds = hasGeo
    ? {
        minLat: Math.min(...geoPoints.map((p) => p.lat)) - 4,
        maxLat: Math.max(...geoPoints.map((p) => p.lat)) + 4,
        minLon: Math.min(...geoPoints.map((p) => p.lon)) - 6,
        maxLon: Math.max(...geoPoints.map((p) => p.lon)) + 6,
      }
    : { minLat: 0, maxLat: 1, minLon: 0, maxLon: 1 };

  const pointByCode = new Map(
    geoPoints.map((p) => [
      p.code,
      projectPoint(p.lat, p.lon, bounds, svgWidth, svgHeight, pad),
    ]),
  );

  return (
    <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#0c2447] via-[#0f172a] to-[#020617] shadow-xl ring-1 ring-white/10">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-sky-300/80">Trip route map</p>
          <h3 className="mt-1 text-lg font-black text-white">Your whole journey at a glance</h3>
          <p className="mt-1 text-xs text-sky-100/60">
            Green flights are booked · gray still needs booking · red means a connection problem
          </p>
        </div>
        <div
          className={`rounded-full px-3 py-1.5 text-xs font-bold ${
            route.summary.allSet
              ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40"
              : route.summary.conflicts > 0
                ? "bg-red-500/20 text-red-200 ring-1 ring-red-400/40"
                : "bg-amber-500/15 text-amber-100 ring-1 ring-amber-400/30"
          }`}
        >
          {route.summary.allSet
            ? "All transportation set ✓"
            : route.summary.conflicts > 0
              ? `${route.summary.conflicts} connection issue${route.summary.conflicts === 1 ? "" : "s"}`
              : `${route.summary.unbooked} to book`}
        </div>
      </div>

      {hasGeo ? (
        <div className="relative px-2 pt-2">
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="mx-auto block h-auto w-full max-w-3xl"
            role="img"
            aria-label="Trip route map"
          >
            <defs>
              <radialGradient id="routeMapGlow" cx="50%" cy="40%" r="65%">
                <stop offset="0%" stopColor="#1d4ed8" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#020617" stopOpacity="0" />
              </radialGradient>
              <filter id="routeLineGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <rect width={svgWidth} height={svgHeight} fill="url(#routeMapGlow)" rx="16" />

            {Array.from({ length: 7 }).map((_, i) => (
              <line
                key={`lat-${i}`}
                x1={pad}
                x2={svgWidth - pad}
                y1={pad + ((svgHeight - pad * 2) / 6) * i}
                y2={pad + ((svgHeight - pad * 2) / 6) * i}
                stroke="rgba(148,163,184,0.08)"
                strokeWidth="1"
              />
            ))}

            {route.segments.map((segment) => {
              const from = pointByCode.get(segment.fromCode);
              const to = pointByCode.get(segment.toCode);
              if (!from || !to) return null;
              const color = segmentStrokeColor(segment);
              const dashed = !segment.booked || segment.status === "conflict";
              return (
                <path
                  key={`path-${segment.id}`}
                  d={arcPath(from.x, from.y, to.x, to.y)}
                  fill="none"
                  stroke={color}
                  strokeWidth={segment.status === "conflict" ? 3.5 : 2.5}
                  strokeDasharray={dashed ? "7 6" : undefined}
                  opacity={segment.booked ? 0.95 : 0.55}
                  filter="url(#routeLineGlow)"
                />
              );
            })}

            {geoPoints.map((point) => {
              const pos = pointByCode.get(point.code);
              if (!pos) return null;
              return (
                <g key={point.code}>
                  <circle cx={pos.x} cy={pos.y} r="14" fill="rgba(15,23,42,0.85)" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
                  <circle cx={pos.x} cy={pos.y} r="5.5" fill="#38bdf8" />
                  <text
                    x={pos.x}
                    y={pos.y - 18}
                    textAnchor="middle"
                    fill="#e2e8f0"
                    fontSize="11"
                    fontWeight="800"
                  >
                    {point.code}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      ) : (
        <div className="mx-5 mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center">
          <p className="text-sm font-semibold text-sky-100/80">Route timeline</p>
          <p className="mt-1 text-xs text-sky-100/50">Add airport codes to flights for the geographic map</p>
        </div>
      )}

      {/* Timeline ribbon */}
      <div className="px-5 py-4">
        <div className="mb-3 flex flex-wrap gap-3 text-[10px] font-bold uppercase tracking-wider text-sky-100/50">
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-6 rounded-full bg-emerald-500" /> Flight booked</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-6 rounded-full bg-slate-500" /> Not booked</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-6 rounded-full bg-red-500" /> Problem</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-6 rounded-full bg-teal-500" /> Train</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-6 rounded-full bg-amber-500" /> Ride</span>
        </div>

        <div className="relative mb-4 hidden sm:block">
          <div className="absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 bg-white/10" />
          <div className="relative flex items-center justify-between gap-2">
            {route.segments.map((segment, index) => {
              const color = segmentStrokeColor(segment);
              return (
                <div key={`node-${segment.id}`} className="flex min-w-0 flex-1 flex-col items-center">
                  <div
                    className="relative z-10 flex h-9 w-9 items-center justify-center rounded-full text-sm shadow-lg ring-2 ring-[#0f172a]"
                    style={{ backgroundColor: `${color}33`, boxShadow: `0 0 18px ${color}55` }}
                  >
                    {segmentKindEmoji(segment.kind)}
                  </div>
                  <p className="mt-2 truncate text-[10px] font-black text-white">{segment.fromCode}</p>
                  {index === route.segments.length - 1 ? (
                    <p className="mt-1 truncate text-[10px] font-black text-white">{segment.toCode}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {route.segments.map((segment, index) => (
            <SegmentCard key={segment.id} segment={segment} index={index} onTap={onSegmentTap} />
          ))}
        </div>
      </div>
    </section>
  );
}
