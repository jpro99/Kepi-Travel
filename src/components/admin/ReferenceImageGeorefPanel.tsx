"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { AirportLayout, PoiCategory, PoiDefinition } from "@/lib/airportNav/types";
import type { PixelWorldPair } from "@/lib/airportNav/controlPointTransform";
import {
  applyReferenceImageDraft,
  buildAffineFromControlPairs,
} from "@/lib/airportNav/referenceImageDraft";

type ControlPairRow = PixelWorldPair & { poiId: string; label: string };

interface Props {
  layout: AirportLayout;
  onApplyDraft: (next: AirportLayout, note: string) => void;
}

const CATEGORIES: PoiCategory[] = [
  "checkin", "gate", "lounge", "amenity", "restroom", "security", "baggage", "train",
];

/**
 * Admin §6 — upload a public wayfinding image, match ≥3 surveyed anchors to
 * pixels, then click labeled features to draft schematic POIs. Never copies
 * competitor coordinates; only Kepi anchors + pixel correspondence.
 */
export function ReferenceImageGeorefPanel({ layout, onApplyDraft }: Props) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [pairs, setPairs] = useState<ControlPairRow[]>([]);
  const [selectedPoiId, setSelectedPoiId] = useState("");
  const [mode, setMode] = useState<"control" | "feature">("control");
  const [featureName, setFeatureName] = useState("");
  const [featureCategory, setFeatureCategory] = useState<PoiCategory>("checkin");
  const [featureAirline, setFeatureAirline] = useState("");
  const [featureIata, setFeatureIata] = useState("");
  const [featureDoor, setFeatureDoor] = useState("");
  const [pendingFeatures, setPendingFeatures] = useState<
    Array<{ pixel: [number, number]; name: string; category: PoiCategory; airline?: string; airlineIataCode?: string; doorLabel?: string }>
  >([]);
  const [message, setMessage] = useState("");

  const poiChoices = useMemo(() => {
    const surveyed = layout.pois.filter((p) => p.precision === "surveyed");
    if (surveyed.length >= 3) return surveyed;
    return layout.pois.filter(
      (p) => p.category === "gate" || p.category === "checkin" || p.category === "lounge" || p.category === "amenity",
    );
  }, [layout]);

  const onFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(URL.createObjectURL(file));
    setPairs([]);
    setPendingFeatures([]);
    setMessage("Image loaded. Select a surveyed POI, then click its location on the image (≥3 control pairs).");
  };

  const pixelFromClick = useCallback((event: React.MouseEvent<HTMLImageElement>): [number, number] | null => {
    const img = imgRef.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    const scaleX = img.naturalWidth / rect.width;
    const scaleY = img.naturalHeight / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    return [x, y];
  }, []);

  const handleImageClick = (event: React.MouseEvent<HTMLImageElement>) => {
    const pixel = pixelFromClick(event);
    if (!pixel) return;

    if (mode === "control") {
      const poi = poiChoices.find((p) => p.id === selectedPoiId);
      if (!poi) {
        setMessage("Pick a surveyed POI from the list before clicking the image for a control point.");
        return;
      }
      const node = layout.nodes.find((n) => n.id === poi.nodeId);
      if (!node) return;
      setPairs((prev) => {
        const without = prev.filter((p) => p.poiId !== poi.id);
        return [...without, { poiId: poi.id, label: poi.name, pixel, world: node.pos }];
      });
      setMessage(`Control point set for ${poi.name}. Need ≥3 pairs.`);
      return;
    }

    if (!featureName.trim()) {
      setMessage("Enter a feature name before clicking to project it.");
      return;
    }
    setPendingFeatures((prev) => [
      ...prev,
      {
        pixel,
        name: featureName.trim(),
        category: featureCategory,
        airline: featureAirline.trim() || undefined,
        airlineIataCode: featureIata.trim() || undefined,
        doorLabel: featureDoor.trim() || undefined,
      },
    ]);
    setMessage(`Queued “${featureName.trim()}” at pixel ${pixel[0].toFixed(0)},${pixel[1].toFixed(0)}. Add more or Apply draft.`);
    setFeatureName("");
  };

  const handleApply = () => {
    const transform = buildAffineFromControlPairs(pairs);
    if (!transform) {
      setMessage("Need ≥3 non-collinear control pairs to estimate the affine transform.");
      return;
    }
    if (pendingFeatures.length === 0) {
      setMessage("Queue at least one labeled feature (Feature mode) before applying.");
      return;
    }
    const worldAnchors = pairs.map((p) => p.world);
    const next = applyReferenceImageDraft(layout, transform, worldAnchors, pendingFeatures);
    onApplyDraft(
      next,
      `Reference-image draft: ${pendingFeatures.length} feature(s) as schematic/extrapolated — confirm via click-to-place before treating as surveyed.`,
    );
    setPendingFeatures([]);
    setMessage("Draft POIs applied. Confirm each with click-to-place before publish.");
  };

  return (
    <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
      <h3 className="text-sm font-bold text-[#0b1f3a]">Reference image → draft (§6)</h3>
      <p className="mt-1 text-xs text-gray-600">
        Match ≥3 surveyed Kepi anchors to pixels on a public wayfinding image, then click other
        labels to draft schematic coordinates. Never copies competitor lat/lng.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input type="file" accept="image/*" onChange={onFile} className="text-xs" />
        <button
          type="button"
          className={`rounded-lg px-3 py-1.5 text-xs font-bold ${mode === "control" ? "bg-indigo-600 text-white" : "border border-gray-300 bg-white"}`}
          onClick={() => setMode("control")}
        >
          Control points
        </button>
        <button
          type="button"
          className={`rounded-lg px-3 py-1.5 text-xs font-bold ${mode === "feature" ? "bg-indigo-600 text-white" : "border border-gray-300 bg-white"}`}
          onClick={() => setMode("feature")}
        >
          Feature labels
        </button>
        <button
          type="button"
          className="rounded-lg bg-[#0b1f3a] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
          disabled={pairs.length < 3 || pendingFeatures.length === 0}
          onClick={handleApply}
        >
          Apply draft ({pendingFeatures.length})
        </button>
      </div>

      {mode === "control" ? (
        <label className="mt-3 block text-xs text-gray-700">
          Surveyed POI for next click
          <select
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm"
            value={selectedPoiId}
            onChange={(e) => setSelectedPoiId(e.target.value)}
          >
            <option value="">Select…</option>
            {poiChoices.map((poi: PoiDefinition) => (
              <option key={poi.id} value={poi.id}>
                {poi.name}{poi.doorLabel ? ` · ${poi.doorLabel}` : ""} ({poi.precision ?? "—"})
              </option>
            ))}
          </select>
        </label>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            placeholder="Feature name"
            value={featureName}
            onChange={(e) => setFeatureName(e.target.value)}
          />
          <select
            className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm"
            value={featureCategory}
            onChange={(e) => setFeatureCategory(e.target.value as PoiCategory)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <input
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            placeholder="Airline name"
            value={featureAirline}
            onChange={(e) => setFeatureAirline(e.target.value)}
          />
          <input
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            placeholder="IATA"
            value={featureIata}
            onChange={(e) => setFeatureIata(e.target.value)}
          />
          <input
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm sm:col-span-2"
            placeholder="Door label"
            value={featureDoor}
            onChange={(e) => setFeatureDoor(e.target.value)}
          />
        </div>
      )}

      {pairs.length > 0 ? (
        <ul className="mt-2 text-xs text-gray-700">
          {pairs.map((p) => (
            <li key={p.poiId}>
              ✓ {p.label} → pixel {p.pixel[0].toFixed(0)},{p.pixel[1].toFixed(0)}
            </li>
          ))}
        </ul>
      ) : null}

      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- admin blob preview
        <img
          ref={imgRef}
          src={imageUrl}
          alt="Reference wayfinding map"
          className="mt-3 max-h-[420px] w-full cursor-crosshair rounded-lg border border-gray-300 object-contain bg-white"
          onClick={handleImageClick}
        />
      ) : null}

      {message ? <p className="mt-2 text-xs font-medium text-indigo-900">{message}</p> : null}
    </div>
  );
}
