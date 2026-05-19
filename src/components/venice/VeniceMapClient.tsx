"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import maplibregl from "maplibre-gl";
import "@/lib/maplibreCspWorker";
import type { Feature, Polygon, Position } from "geojson";
import * as turf from "@turf/turf";
import {
  TerraDraw,
  TerraDrawRectangleMode,
  TerraDrawSelectMode,
} from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import {
  CitySearchCombobox,
  type CityListEntry,
} from "@/components/CitySearchCombobox";
import { Logo } from "@/components/ui/Logo";
import type { CityCatalog } from "@/data/cities/types";
import type { Chain, HotelSearchHit } from "@/lib/search/types";
import {
  loadSearchSession,
  saveSearchSession,
  type StoredSearchSessionV1,
} from "@/lib/session/searchSession";
import {
  decodeSearchAreaParam,
  encodeSearchAreaParam,
  MAX_AREA_PARAM_CHARS,
} from "@/lib/session/serializeArea";
import "maplibre-gl/dist/maplibre-gl.css";

/** Inlined at build; bump `NEXT_PUBLIC_KEPI_BUILD` on Vercel to bust stale cached map chunks. */
const KEPI_CLIENT_BUILD = process.env.NEXT_PUBLIC_KEPI_BUILD ?? "";
/** Hardcoded stamp so the map client chunk hash changes whenever MapLibre / map wiring is updated (avoids stale `11koiq0k4…` bundles). */
const KEPI_MAP_CLIENT_STAMP = "direct-maptiler-style-no-bootstrap-20260421";

type SortMode =
  | "coreWalk"
  | "transitWalk"
  | "lineCore"
  | "coreScore"
  | "name";

const CHAINS: Chain[] = ["marriott", "hilton", "hyatt"];

function compareHits(a: HotelSearchHit, b: HotelSearchHit, sort: SortMode) {
  switch (sort) {
    case "coreWalk": {
      const da = a.walkingToCore?.durationSec ?? Number.POSITIVE_INFINITY;
      const db = b.walkingToCore?.durationSec ?? Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
      return a.metersToPrimaryTouristCore - b.metersToPrimaryTouristCore;
    }
    case "transitWalk": {
      const da = a.walkingToTransit?.durationSec ?? Number.POSITIVE_INFINITY;
      const db = b.walkingToTransit?.durationSec ?? Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
      return a.metersToNearestTransit - b.metersToNearestTransit;
    }
    case "lineCore":
      return a.metersToPrimaryTouristCore - b.metersToPrimaryTouristCore;
    case "coreScore":
      return b.coreProximityScore - a.coreProximityScore;
    case "name":
      return a.name.localeCompare(b.name, "en");
    default:
      return 0;
  }
}

const RESULT_SOURCE_ID = "kepi-search-results";
const RESULT_LAYER_ID = "kepi-search-results-circles";
const SORT_RESULTS_ID = "kepi-sort-results";

/** Prefix for TerraDraw MapLibre layers (`terra-draw-maplibre-gl-adapter`). */
const TERRA_DRAW_MAP_PREFIX = "kepi-td";

/**
 * Non-empty ids that should be a 1x1 transparent pixel (MapTiler / tiles sometimes reference blank icons).
 * Do not use "" — MapLibre `hasImage("")` / `addImage("")` throw or duplicate against the style.
 */
const BLANK_SPRITE_IDS = [
  " ",
  "\u00a0",
  "\u200b", // ZWSP
  "\u200c",
  "\u200d",
  "\u2009", // thin space
  "\u202f", // narrow no-break space
  "\u3000", // ideographic space
  "\ufeff",
] as const;

/** True for non-empty ids that are only whitespace / format chars (bogus icon-image from tile data). */
function isBlankishSpriteId(id: string): boolean {
  if (id.length === 0) return false;
  return !/[^\s\u00a0\u200b-\u200f\u2028\u2029\u202f\u205f\u3000\ufeff]/.test(id);
}

/** Tiny transparent RGBA image for bogus sprite ids from MapTiler POIs or tooling. */
function registerBlankSpriteIds(map: maplibregl.Map) {
  const blank = { width: 1, height: 1, data: new Uint8Array(4) };
  for (const id of BLANK_SPRITE_IDS) {
    if (!id) continue;
    try {
      if (map.hasImage(id)) map.removeImage(id);
    } catch {
      /* ignore */
    }
    try {
      map.addImage(id, blank);
    } catch {
      /* ignore */
    }
  }
}

function tightenTerraDrawPointMarkerFilter(map: maplibregl.Map) {
  const layerId = `${TERRA_DRAW_MAP_PREFIX}-point-marker`;
  if (!map.getLayer(layerId)) return;
  const matchExpr = [
    "match",
    ["get", "markerId"],
    ...BLANK_SPRITE_IDS.flatMap((id) => [id, false]),
    true,
  ] as unknown as maplibregl.ExpressionSpecification;
  map.setFilter(layerId, [
    "all",
    ["has", "markerId"],
    ["!=", ["get", "markerId"], ""],
    matchExpr,
  ]);
}

const CHAIN_COLOR: Record<HotelSearchHit["chain"], string> = {
  marriott: "#c41230",
  hilton: "#0f4d92",
  hyatt: "#6c2eb9",
};

function metaPayloadToCatalog(payload: {
  id: string;
  label: string;
  map: CityCatalog["map"];
}): CityCatalog {
  const { lat, lng } = payload.map.center;
  return {
    id: payload.id,
    label: payload.label,
    map: payload.map,
    hotels: [],
    transit: [],
    touristAnchors: [
      { id: `${payload.id}-core`, label: payload.label, lat, lng },
    ],
  };
}

function closeRing(ring: Position[]): Position[] {
  if (ring.length < 4) return ring;
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, first];
}

function ringsEqual(a: Position[], b: Position[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function pickSearchPolygon(
  snapshot: GeoJSON.Feature[],
): Feature<Polygon> | null {
  const polys = snapshot.filter(
    (f): f is Feature<Polygon> =>
      f.geometry?.type === "Polygon" && !!f.geometry.coordinates,
  );
  if (polys.length === 0) return null;
  if (polys.length === 1) return polys[0]!;
  return polys.reduce((a, b) =>
    turf.area(a) >= turf.area(b) ? a : b,
  ) as Feature<Polygon>;
}

function MapLoading() {
  return (
    <div className="flex h-[100dvh] items-center justify-center bg-slate-950 text-cyan-300">
      <p className="text-sm font-medium">Loading map...</p>
    </div>
  );
}

function UrlCityBridge({ maptilerKey }: { maptilerKey: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawCity = searchParams.get("city");
  const [list, setList] = useState<{
    cities: CityListEntry[];
    defaultCityId: string;
  } | null>(null);
  const [citiesFetchError, setCitiesFetchError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/cities")
      .then((r) => {
        if (!r.ok) {
          throw new Error(`Could not load cities (${r.status})`);
        }
        return r.json();
      })
      .then((d: { cities: CityListEntry[]; defaultCityId?: string }) => {
        if (cancelled) return;
        setCitiesFetchError(null);
        setList({
          cities: d.cities ?? [],
          defaultCityId: d.defaultCityId ?? "venice",
        });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setCitiesFetchError(
          e instanceof Error ? e.message : "Could not load cities",
        );
        setList({ cities: [], defaultCityId: "venice" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const cityId = useMemo(() => {
    if (!list) return null;
    const allowed = new Set(list.cities.map((c) => c.id));
    if (rawCity && allowed.has(rawCity)) return rawCity;
    return list.defaultCityId;
  }, [list, rawCity]);

  useEffect(() => {
    if (!list || !cityId) return;
    if (rawCity === cityId) return;
    const p = new URLSearchParams(searchParams.toString());
    p.set("city", cityId);
    router.replace(`/?${p.toString()}`, { scroll: false });
  }, [list, rawCity, cityId, router, searchParams]);

  if (!list || !cityId) return <MapLoading />;

  if (citiesFetchError && list.cities.length === 0) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-3 bg-slate-950 p-6 text-center text-slate-100">
        <p className="max-w-md text-sm text-amber-300">{citiesFetchError}</p>
        <p className="max-w-lg text-xs text-slate-400">
          Check the Network tab for <code className="text-cyan-200">/api/cities</code>.
          If you use a non-root path or reverse proxy, the app must be served from the
          same origin as the API.
        </p>
      </div>
    );
  }

  return (
    <VeniceMapShell
      key={cityId}
      cityId={cityId}
      allCities={list.cities}
      defaultCityId={list.defaultCityId}
      shareAreaParam={searchParams.get("area")}
      maptilerKey={maptilerKey}
    />
  );
}

function VeniceMapShell({
  cityId,
  allCities,
  defaultCityId,
  shareAreaParam,
  maptilerKey,
}: {
  cityId: string;
  allCities: CityListEntry[];
  defaultCityId: string;
  shareAreaParam: string | null;
  maptilerKey: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const drawRef = useRef<TerraDraw | null>(null);
  const [catalog, setCatalog] = useState<CityCatalog | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [hotels, setHotels] = useState<HotelSearchHit[]>([]);
  const [chainOn, setChainOn] = useState<Record<Chain, boolean>>({
    marriott: true,
    hilton: true,
    hyatt: true,
  });
  const [sortBy, setSortBy] = useState<SortMode>("coreWalk");
  const [meta, setMeta] = useState<{
    cityId?: string;
    cityLabel?: string;
    anchorLabel: string;
    hotelCountScanned: number;
    routing?: { mode: string; engine: string; note: string };
  } | null>(null);
  const [status, setStatus] = useState<
    "idle" | "loading" | "error" | "ok"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [shareHint, setShareHint] = useState<string | null>(null);
  /** Shown on the map when MapLibre errors, WebGL is lost, or the map never reaches `load`. */
  const [mapBootIssue, setMapBootIssue] = useState<string | null>(null);
  /** False until TerraDraw has started on the loaded map (Search must not run before this). */
  const [drawReady, setDrawReady] = useState(false);

  const runSearchRef = useRef<(() => Promise<void>) | null>(null);

  const displayHotels = useMemo(() => {
    const filtered = hotels.filter((h) => chainOn[h.chain]);
    return [...filtered].sort((a, b) => compareHits(a, b, sortBy));
  }, [hotels, chainOn, sortBy]);

  const displayHotelsRef = useRef<HotelSearchHit[]>([]);
  useEffect(() => {
    displayHotelsRef.current = displayHotels;
  }, [displayHotels]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/cities/${encodeURIComponent(cityId)}/meta`)
      .then((r) => {
        if (!r.ok) throw new Error(`Map data not found (${r.status})`);
        return r.json();
      })
      .then((payload) => {
        if (cancelled) return;
        setCatalog(metaPayloadToCatalog(payload));
      })
      .catch((e) => {
        if (cancelled) return;
        setMetaError(e instanceof Error ? e.message : "Failed to load city");
      });
    return () => {
      cancelled = true;
    };
  }, [cityId]);

  const upsertResultLayer = useCallback((hits: HotelSearchHit[]) => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: hits.map((h) => ({
        type: "Feature",
        properties: { chain: h.chain, id: h.id },
        geometry: { type: "Point", coordinates: [h.lng, h.lat] },
      })),
    };

    const existing = map.getSource(RESULT_SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (existing) {
      existing.setData(fc);
    } else {
      map.addSource(RESULT_SOURCE_ID, { type: "geojson", data: fc });
      map.addLayer({
        id: RESULT_LAYER_ID,
        type: "circle",
        source: RESULT_SOURCE_ID,
        paint: {
          "circle-radius": 10,
          "circle-color": [
            "match",
            ["get", "chain"],
            "marriott",
            CHAIN_COLOR.marriott,
            "hilton",
            CHAIN_COLOR.hilton,
            "hyatt",
            CHAIN_COLOR.hyatt,
            "#333333",
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
    }
  }, []);

  const runSearch = useCallback(async () => {
    if (!catalog) {
      setErrorMessage("City data is not ready yet.");
      setStatus("error");
      return;
    }
    const draw = drawRef.current;
    if (!draw) {
      setErrorMessage(
        "The map is still finishing setup. Wait a moment after the map appears, draw a rectangle on it, then tap Search again.",
      );
      setStatus("error");
      return;
    }
    const poly = pickSearchPolygon(draw.getSnapshot() as GeoJSON.Feature[]);
    if (!poly) {
      setErrorMessage("Draw a rectangle on the map first (drag to size it).");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setErrorMessage(null);
    setHotels([]);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cityId: catalog.id,
          area: { type: "Feature", geometry: poly.geometry },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          typeof err.error === "string"
            ? err.error
            : `Search failed (${res.status})`,
        );
      }
      const data = (await res.json()) as {
        hotels: HotelSearchHit[];
        meta: {
          cityId: string;
          cityLabel: string;
          anchorLabel: string;
          hotelCountScanned: number;
          routing?: { mode: string; engine: string; note: string };
        };
      };
      setHotels(data.hotels);
      setMeta(data.meta);
      setStatus("ok");

      const ring = poly.geometry.coordinates[0] as [number, number][];
      const session: StoredSearchSessionV1 = {
        version: 1,
        cityId: catalog.id,
        ring,
        hotels: data.hotels,
        meta: data.meta,
        chainOn,
        sortBy,
        savedAt: new Date().toISOString(),
      };
      saveSearchSession(session);

      const params = new URLSearchParams(searchParams.toString());
      params.set("city", catalog.id);
      const enc = encodeSearchAreaParam(ring);
      if (enc.length <= MAX_AREA_PARAM_CHARS) {
        params.set("area", enc);
      } else {
        params.delete("area");
      }
      router.replace(`/?${params.toString()}`, { scroll: false });
    } catch (e) {
      setStatus("error");
      setErrorMessage(e instanceof Error ? e.message : "Search failed");
    }
  }, [catalog, chainOn, sortBy, searchParams, router]);

  useEffect(() => {
    runSearchRef.current = runSearch;
  }, [runSearch]);

  const copyShareLink = useCallback(async () => {
    const draw = drawRef.current;
    if (!catalog || !draw) {
      setShareHint("Map not ready");
      window.setTimeout(() => setShareHint(null), 2500);
      return;
    }
    const poly = pickSearchPolygon(draw.getSnapshot() as GeoJSON.Feature[]);
    if (!poly) {
      setShareHint("Draw a rectangle first");
      window.setTimeout(() => setShareHint(null), 2500);
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("city", catalog.id);
    const enc = encodeSearchAreaParam(
      poly.geometry.coordinates[0] as [number, number][],
    );
    let hint = "Link copied to clipboard";
    if (enc.length <= MAX_AREA_PARAM_CHARS) {
      params.set("area", enc);
    } else {
      params.delete("area");
      hint = "Copied without area (polygon too large for URL)";
    }
    const url = `${window.location.origin}/?${params.toString()}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareHint(hint);
    } catch {
      setShareHint("Clipboard unavailable — copy from the address bar after search");
    }
    window.setTimeout(() => setShareHint(null), 4000);
  }, [catalog, searchParams]);

  useEffect(() => {
    if (!catalog || !mapEl.current || !maptilerKey) return;
    void KEPI_CLIENT_BUILD;
    void KEPI_MAP_CLIENT_STAMP;
    setMapBootIssue(null);
    setDrawReady(false);
    let cancelled = false;
    let detach: (() => void) | null = null;
    let stallTimer: number | undefined;

    const { center, zoom, maxBounds } = catalog.map;
    const maptilerStyle = `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(maptilerKey)}`;

    void (async () => {
      try {
        const styleRes = await fetch(maptilerStyle, {
          method: "GET",
          mode: "cors",
          cache: "no-store",
        });
        if (cancelled) return;
        if (!styleRes.ok) {
          setMapBootIssue(
            `MapTiler rejected style.json (HTTP ${styleRes.status}). In Vercel: Project -> Settings -> Environment Variables -> set NEXT_PUBLIC_MAPTILER_KEY for Production, save, then Redeploy. Wrong or missing keys usually return 401 or 403.`,
          );
          return;
        }
        if (!mapEl.current || cancelled) return;

        let mapErrorReported = false;
        /** Empty bootstrap style has `sources: {}`; MapTiler streets-v2 has many sources. */
        let sawMaptilerStyle = false;
        let postLoadTileCheck: number | undefined;

        const map = new maplibregl.Map({
          container: mapEl.current,
          // Load MapTiler once. The previous empty-style -> setStyle(MapTiler) two-step
          // could leave the renderer in a bad state on some GPUs even when tiles (200) loaded.
          style: maptilerStyle,
          center: [center.lng, center.lat],
          zoom,
          pitch: 0,
          maxBounds,
          fadeDuration: 0,
          renderWorldCopies: true,
        });

    const canvas = map.getCanvas();
    const onWebGlContextLost = (ev: Event) => {
      ev.preventDefault();
      mapErrorReported = true;
      setMapBootIssue(
        "WebGL paused or lost (browser or GPU). Try reloading the page or closing other heavy tabs.",
      );
    };
    const onWebGlContextRestored = () => {
      map.resize();
    };
    canvas.addEventListener("webglcontextlost", onWebGlContextLost);
    canvas.addEventListener("webglcontextrestored", onWebGlContextRestored);

    // Register as early as possible (MapTiler tiles can request sprites before `style.load`).
    registerBlankSpriteIds(map);

    map.on("styleimagemissing", (e) => {
      const id = e.id;
      if (typeof id !== "string" || !id.length) return;
      const blank = { width: 1, height: 1, data: new Uint8Array(4) };
      // If a blank id collided with a broken sprite entry, replace it so getImages succeeds.
      if (isBlankishSpriteId(id)) {
        try {
          if (map.hasImage(id)) map.removeImage(id);
        } catch {
          /* ignore */
        }
      } else if (map.hasImage(id)) {
        return;
      }
      try {
        map.addImage(id, blank);
      } catch {
        /* duplicate or invalid id */
      }
    });

    map.on("style.load", () => {
      registerBlankSpriteIds(map);
      tightenTerraDrawPointMarkerFilter(map);
      try {
        const n = Object.keys(map.getStyle()?.sources ?? {}).length;
        if (n > 0) sawMaptilerStyle = true;
      } catch {
        /* ignore */
      }
      requestAnimationFrame(() => {
        try {
          map.resize();
          map.triggerRepaint();
        } catch {
          /* ignore */
        }
      });
    });

    requestAnimationFrame(() => registerBlankSpriteIds(map));

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRef.current = map;

    const resizeHost = mapEl.current;
    const resizeObserver =
      resizeHost &&
      new ResizeObserver(() => {
        try {
          map.resize();
        } catch {
          /* map torn down */
        }
      });
    if (resizeHost && resizeObserver) resizeObserver.observe(resizeHost);
    requestAnimationFrame(() => {
      try {
        map.resize();
      } catch {
        /* ignore */
      }
    });

    const onMapError = (e: { error?: Error }) => {
      console.error("[kepi map]", e.error ?? e);
      mapErrorReported = true;
      const err = e.error;
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : "Unknown map error";
      setMapBootIssue(`Map / tiles: ${msg}`);
    };
    map.on("error", onMapError);

    const stallMs = 12_000;
    stallTimer = window.setTimeout(() => {
      if (mapRef.current !== map || mapErrorReported) return;
      try {
        if (!sawMaptilerStyle) {
          setMapBootIssue(
            "Basemap style never reported sources after load. Open DevTools -> Network, reload, and inspect api.maptiler.com/style.json. Set NEXT_PUBLIC_MAPTILER_KEY for Production on Vercel and redeploy. Try Ctrl+Shift+R.",
          );
          return;
        }
        if (!map.loaded()) {
          setMapBootIssue(
            "The map never finished loading after the basemap style arrived. Check api.maptiler.com tile requests in Network, confirm your MapTiler key, and try a hard refresh.",
          );
        }
      } catch {
        /* map may be mid-teardown */
      }
    }, stallMs);

    const rectangleMode = new TerraDrawRectangleMode({
      styles: {
        fillColor: "#33ccff",
        fillOpacity: 0.2,
        outlineColor: "#0090c5",
        outlineWidth: 2,
        outlineOpacity: 1,
      },
    });

    const selectMode = new TerraDrawSelectMode({
      flags: {
        [rectangleMode.mode]: {
          feature: {
            draggable: true,
            coordinates: {
              resizable: "opposite",
              midpoints: false,
              draggable: true,
            },
          },
        },
      },
    });

    map.on("load", () => {
      window.clearTimeout(stallTimer);
      setMapBootIssue(null);
      try {
        map.resize();
        map.triggerRepaint();
      } catch {
        /* ignore */
      }
      const adapter = new TerraDrawMapLibreGLAdapter({
        map,
        prefixId: TERRA_DRAW_MAP_PREFIX,
      });
      const draw = new TerraDraw({
        adapter,
        modes: [selectMode, rectangleMode],
      });
      draw.start();
      queueMicrotask(() => tightenTerraDrawPointMarkerFilter(map));
      map.once("idle", () => tightenTerraDrawPointMarkerFilter(map));
      draw.setMode(rectangleMode.mode);

      draw.on("finish", (id) => {
        const snap = draw.getSnapshot() as GeoJSON.Feature[];
        const polys = snap.filter((f) => f.geometry?.type === "Polygon");
        const extras = polys
          .map((f) => f.id)
          .filter((fid) => fid !== undefined && fid !== id) as (
          | string
          | number
        )[];
        if (extras.length) draw.removeFeatures(extras);
        try {
          draw.selectFeature(id);
        } catch {
          draw.setMode(selectMode.mode);
        }
      });

      drawRef.current = draw;
      setDrawReady(true);

      const session = loadSearchSession();
      let ring: Position[] | null = null;
      let restoredFromSession = false;

      const areaFromUrl = decodeSearchAreaParam(shareAreaParam);
      if (areaFromUrl && areaFromUrl.length >= 4) {
        ring = areaFromUrl;
        if (
          session &&
          session.cityId === cityId &&
          ringsEqual(session.ring, ring) &&
          session.hotels.length > 0
        ) {
          setHotels(session.hotels);
          setMeta(session.meta);
          setChainOn(session.chainOn);
          setSortBy(session.sortBy as SortMode);
          setStatus("ok");
          restoredFromSession = true;
        }
      } else if (
        session &&
        session.cityId === cityId &&
        session.ring.length >= 4
      ) {
        ring = session.ring;
        setHotels(session.hotels);
        setMeta(session.meta);
        setChainOn(session.chainOn);
        setSortBy(session.sortBy as SortMode);
        setStatus("ok");
        restoredFromSession = true;
      }

      if (!ring || ring.length < 4) {
        upsertResultLayer(displayHotelsRef.current);
        return;
      }

      const closed = closeRing(ring);
      const fid = draw.getFeatureId();
      const feat = {
        type: "Feature" as const,
        id: fid,
        properties: { mode: "rectangle" as const },
        geometry: { type: "Polygon" as const, coordinates: [closed] },
      };
      const vals = draw.addFeatures([feat]);
      const ok =
        vals.length > 0 &&
        vals.every((r) => (r as { valid?: boolean }).valid !== false);
      if (!ok) {
        upsertResultLayer(displayHotelsRef.current);
        return;
      }
      draw.setMode(selectMode.mode);
      try {
        draw.selectFeature(fid);
      } catch {
        draw.setMode(selectMode.mode);
      }
      upsertResultLayer(displayHotelsRef.current);

      if (!restoredFromSession && areaFromUrl) {
        queueMicrotask(() => {
          void runSearchRef.current?.();
        });
      }

      postLoadTileCheck = window.setTimeout(() => {
        if (mapRef.current !== map || mapErrorReported) return;
        try {
          if (!map.areTilesLoaded()) {
            setMapBootIssue(
              (prev) =>
                prev ??
                "Basemap tiles are still missing after load. In DevTools -> Network, filter maptiler and look for failed tile or font requests (403, blocked). Confirm NEXT_PUBLIC_MAPTILER_KEY in Vercel and try disabling strict blockers.",
            );
          }
        } catch {
          /* ignore */
        }
      }, 6000);
    });

    const onResize = () => map.resize();
    window.addEventListener("resize", onResize);

        detach = () => {
          setDrawReady(false);
          if (stallTimer !== undefined) window.clearTimeout(stallTimer);
          if (postLoadTileCheck !== undefined) {
            window.clearTimeout(postLoadTileCheck);
          }
          map.off("error", onMapError);
          if (resizeObserver) resizeObserver.disconnect();
          window.removeEventListener("resize", onResize);
          canvas.removeEventListener("webglcontextlost", onWebGlContextLost);
          canvas.removeEventListener(
            "webglcontextrestored",
            onWebGlContextRestored,
          );
          const draw = drawRef.current;
          drawRef.current = null;
          if (draw) draw.stop();
          try {
            map.remove();
          } catch {
            /* already removed */
          }
          mapRef.current = null;
        };
      } catch (e: unknown) {
        if (!cancelled) {
          console.error("[kepi map] mount", e);
          setMapBootIssue(
            e instanceof Error
              ? `Map could not start: ${e.message}`
              : "Map could not start (unexpected error). Inspect the console and Network.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      detach?.();
      detach = null;
      mapRef.current = null;
    };
  }, [maptilerKey, catalog, upsertResultLayer, shareAreaParam, cityId]);

  useEffect(() => {
    upsertResultLayer(displayHotels);
  }, [displayHotels, upsertResultLayer]);

  if (!maptilerKey) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 bg-slate-900 p-6 text-center text-slate-100">
        <p className="max-w-md text-lg font-semibold">MapTiler key missing</p>
        <p className="max-w-lg text-sm text-slate-300">
          Put{" "}
          <code className="rounded bg-slate-800 px-1.5 py-0.5">
            NEXT_PUBLIC_MAPTILER_KEY=…
          </code>{" "}
          in{" "}
          <code className="rounded bg-slate-800 px-1.5 py-0.5">.env.local</code>{" "}
          next to this app&apos;s{" "}
          <code className="rounded bg-slate-800 px-1.5 py-0.5">package.json</code>
          , then stop and restart{" "}
          <code className="rounded bg-slate-800 px-1.5 py-0.5">next dev</code>{" "}
          (Next only reads env when the dev server starts). For production, set
          the same variable in the host dashboard and rebuild. Free tier at
          maptiler.com is enough for personal use.
        </p>
      </div>
    );
  }

  if (metaError) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-3 bg-slate-950 p-6 text-center text-slate-100">
        <p className="text-sm text-amber-300">{metaError}</p>
        <button
          type="button"
          onClick={() => {
            const p = new URLSearchParams(searchParams.toString());
            p.set("city", defaultCityId);
            p.delete("area");
            router.replace(`/?${p.toString()}`, { scroll: false });
          }}
          className="rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950"
        >
          Go to default city
        </button>
      </div>
    );
  }

  if (!catalog) {
    return <MapLoading />;
  }

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col bg-slate-950 text-slate-50">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-cyan-900/50 bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950 px-3 py-2 shadow-lg">
        <div className="min-w-0 flex-1">
          <Logo size="sm" className="[&>span:last-child]:text-cyan-300" />
          <p className="truncate text-[11px] text-slate-400 sm:text-xs">
            {catalog.label} | Hyatt | Marriott | Hilton - draw area, then search
          </p>
        </div>
        <CitySearchCombobox
          cities={allCities}
          valueId={cityId}
          onSelect={(id) => {
            const p = new URLSearchParams(searchParams.toString());
            p.set("city", id);
            p.delete("area");
            router.replace(`/?${p.toString()}`, { scroll: false });
          }}
        />
        <button
          type="button"
          onClick={() => void copyShareLink()}
          className="shrink-0 rounded-lg border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-200 hover:bg-slate-700 sm:text-xs"
        >
          Copy link
        </button>
        <button
          type="button"
          onClick={() => void runSearch()}
          disabled={status === "loading" || !drawReady}
          title={
            !drawReady
              ? "Wait for the map to finish loading, then draw a rectangle"
              : undefined
          }
          className="shrink-0 rounded-full bg-cyan-400 px-4 py-2 text-sm font-bold text-slate-950 shadow-md transition hover:bg-cyan-300 disabled:opacity-60"
        >
          {status === "loading"
            ? "Searching..."
            : !drawReady
              ? "Loading draw…"
              : "Search this area"}
        </button>
      </header>

      {mapBootIssue && (
        <div className="flex shrink-0 items-start gap-2 border-b border-amber-500/50 bg-amber-950/50 px-3 py-2 text-amber-50">
          <p className="min-w-0 flex-1 text-left text-[11px] leading-snug sm:text-xs">
            {mapBootIssue}
          </p>
          <button
            type="button"
            onClick={() => setMapBootIssue(null)}
            className="shrink-0 rounded border border-amber-400/60 bg-amber-900/80 px-2 py-1 text-[10px] font-semibold text-amber-100 hover:bg-amber-800/80"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="relative min-h-0 flex-1 bg-slate-900">
        <div
          ref={mapEl}
          className="absolute inset-0 h-full w-full min-h-[1px] min-w-[1px]"
        />
        <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex flex-col items-center gap-2 sm:pointer-events-auto sm:items-start">
          {shareHint && (
            <p className="pointer-events-none max-w-md rounded-lg bg-slate-900/95 px-3 py-1.5 text-[11px] text-cyan-200 shadow-lg ring-1 ring-cyan-500/40 sm:text-xs">
              {shareHint}
            </p>
          )}
          <p className="pointer-events-none max-w-md rounded-lg bg-slate-900/85 px-3 py-2 text-[11px] text-slate-300 shadow-lg ring-1 ring-cyan-500/30 sm:text-xs">
            Drag a rectangle, then resize from corners. Tap{" "}
            <span className="font-semibold text-cyan-300">Search this area</span>
            . Last search restores after refresh (same browser).{" "}
            <span className="font-semibold text-cyan-300">Copy link</span> shares
            city + area in the URL.
          </p>
        </div>
      </div>

      {(errorMessage || status === "ok" || status === "loading") && (
        <aside className="max-h-[40vh] shrink-0 overflow-y-auto border-t border-slate-800 bg-slate-900/95 p-3 sm:max-h-[32vh]">
          {status === "loading" && (
            <p className="mb-2 text-sm text-cyan-200">
              Searching hotels and walking estimates… This can take ~15–30
              seconds the first time (routing requests per hotel).
            </p>
          )}
          {errorMessage && (
            <p className="mb-2 text-sm text-amber-300">{errorMessage}</p>
          )}
          {status === "ok" && meta && (
            <div className="mb-2 space-y-1 text-xs text-slate-400">
              <p>
                {meta.cityLabel ?? catalog.label} | Core: {meta.anchorLabel} |
                Catalog: {meta.hotelCountScanned} hotels | Matches:{" "}
                {hotels.length}
                {displayHotels.length !== hotels.length &&
                  hotels.length > 0 && (
                    <span className="text-slate-500">
                      {" "}
                      ({displayHotels.length} shown)
                    </span>
                  )}
              </p>
              {meta.routing && (
                <p className="text-[11px] leading-snug text-slate-500">
                  Routing: {meta.routing.engine} ({meta.routing.mode}) -{" "}
                  {meta.routing.note}
                </p>
              )}
            </div>
          )}
          {status === "ok" && hotels.length > 0 && (
            <div className="mb-3 flex flex-wrap items-end gap-3 border-b border-slate-800 pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                  Chains
                </span>
                {CHAINS.map((c) => {
                  const chainInputId = `kepi-chain-${c}`;
                  return (
                    <label
                      key={c}
                      htmlFor={chainInputId}
                      className="flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-600 bg-slate-800/80 px-2 py-1 text-[11px] text-slate-200"
                    >
                      <input
                        id={chainInputId}
                        name={`chain_${c}`}
                        type="checkbox"
                        className="accent-cyan-400"
                        checked={chainOn[c]}
                        onChange={() =>
                          setChainOn((prev) => ({ ...prev, [c]: !prev[c] }))
                        }
                      />
                      <span className="capitalize">{c}</span>
                    </label>
                  );
                })}
              </div>
              <label
                htmlFor={SORT_RESULTS_ID}
                className="flex min-w-[10rem] flex-1 flex-col gap-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 sm:ml-auto sm:max-w-[14rem]"
              >
                Sort results
                <select
                  id={SORT_RESULTS_ID}
                  name="sortBy"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortMode)}
                  className="rounded-lg border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs font-normal normal-case text-slate-100 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                >
                  <option value="coreWalk">Walk time to tourist core</option>
                  <option value="transitWalk">Walk time to nearest transit</option>
                  <option value="lineCore">Straight-line distance to core</option>
                  <option value="coreScore">Core proximity score</option>
                  <option value="name">Hotel name (A–Z)</option>
                </select>
              </label>
            </div>
          )}
          {!chainOn.marriott && !chainOn.hilton && !chainOn.hyatt ? (
            <p className="mb-2 text-sm text-amber-200/90">
              Select at least one chain to see matches on the map and in the list.
            </p>
          ) : null}
          <ul className="space-y-2">
            {displayHotels.map((h) => (
              <li
                key={h.id}
                className="rounded-xl border border-slate-700/80 bg-slate-800/60 p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-400/90">
                      {h.chain}
                    </p>
                    <p className="font-semibold text-slate-100">{h.name}</p>
                  </div>
                  <a
                    href={h.bookUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded-full bg-slate-700 px-3 py-1 text-xs font-semibold text-cyan-200 ring-1 ring-cyan-500/40 hover:bg-slate-600"
                  >
                    Book
                  </a>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-slate-400 sm:text-xs">
                  <dt className="text-slate-500">Nearest transit</dt>
                  <dd className="text-right text-slate-300">
                    {h.nearestTransitName}
                    {h.walkingToTransit ? (
                      <>
                        <br />
                        <span className="text-cyan-200/90">
                          Walk ~{Math.round(h.walkingToTransit.durationSec / 60)}{" "}
                          min ({Math.round(h.walkingToTransit.distanceM)} m)
                        </span>
                      </>
                    ) : (
                      <>
                        <br />
                        <span className="text-slate-500">
                          Line ~{(h.metersToNearestTransit / 1000).toFixed(2)} km
                        </span>
                      </>
                    )}
                  </dd>
                  <dt className="text-slate-500">To tourist core</dt>
                  <dd className="text-right text-slate-300">
                    {h.walkingToCore ? (
                      <>
                        <span className="text-cyan-200/90">
                          Walk ~{Math.round(h.walkingToCore.durationSec / 60)} min (
                          {Math.round(h.walkingToCore.distanceM)} m)
                        </span>
                        <br />
                        <span className="text-slate-500">
                          score {h.coreProximityScore}
                        </span>
                      </>
                    ) : (
                      <>
                        Line {(h.metersToPrimaryTouristCore / 1000).toFixed(2)} km |
                        score {h.coreProximityScore}
                      </>
                    )}
                  </dd>
                </dl>
              </li>
            ))}
          </ul>
          {status === "ok" &&
            hotels.length > 0 &&
            displayHotels.length === 0 &&
            !errorMessage && (
              <p className="text-sm text-slate-400">
                No hotels match the current chain filters. Turn a chain back on to
                see properties.
              </p>
            )}
          {status === "ok" && hotels.length === 0 && !errorMessage && (
            <p className="text-sm text-slate-400">
              No catalog hotels in that area. For seeded cities, the few sample
              hotels sit near the city center—draw a rectangle that includes the
              center, or zoom there first. You can also draw a larger area.
            </p>
          )}
        </aside>
      )}
    </div>
  );
}

export default function VeniceMapClient({
  maptilerKey,
}: {
  maptilerKey: string;
}) {
  return <UrlCityBridge maptilerKey={maptilerKey} />;
}
