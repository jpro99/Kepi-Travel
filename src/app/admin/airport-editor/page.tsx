"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AirportLayout, PoiCategory, TravelerSecurityCredentials } from '@/lib/airportNav/types';
import {
    buildAirportSchematicModel,
    placeAirportSchematicLabels,
} from '@/lib/airportNav/schematic';
import { applyClickToPlace } from '@/lib/airportNav/clickToPlace';
import { AirportNavigatorMap } from '@/components/travelAssistant/AirportNavigatorMap';
import { ReferenceImageGeorefPanel } from '@/components/admin/ReferenceImageGeorefPanel';
import type { AirportLayoutDiff } from '@/lib/airportNav/layoutDiff';

/** Admin verification runs as a fully-credentialed traveler so the security
 *  question never interrupts the preview. */
const PREVIEW_CREDENTIALS: TravelerSecurityCredentials = { tsaPreCheck: false, clear: false, known: true };

interface AirportCurationRequest {
    iata: string;
    airportName: string;
    status: 'requested' | 'draft' | 'published' | 'dismissed';
    demandCount: number;
    firstRequestedAt: string;
    lastRequestedAt: string;
    officialMapUrl: string | null;
    officialMapProvider: string | null;
    officialMapVerified: boolean;
    detectedBy?: string[];
    notes?: string;
    linkedPackageRevision?: number;
    lastVerifiedAt?: string | null;
    staleness?: 'fresh' | 'aging' | 'stale' | 'unknown';
    needsReverification?: boolean;
    stalenessLabel?: string;
}

interface PackageHistoryEntry {
    revision: number;
    status: 'draft' | 'published';
    precisionGrade?: 'schematic' | 'surveyed';
    updatedAt: string;
    publishedAt: string | null;
    previewConfirmedBy?: string;
    layoutBlobUrl?: string;
}

interface PackageInfoResponse {
    iata: string;
    published: { revision: number; updatedAt: string } | null;
    draft: { revision: number; updatedAt: string } | null;
    history: PackageHistoryEntry[];
}

interface BundledAirportSummary {
    iata: string;
    name: string;
    layoutVersion: string;
    updatedAt: string;
    counts: { zones: number; nodes: number; edges: number; pois: number; gates: number; lounges: number };
    errors: number;
    warnings: number;
}

/** Non-WebGL rendered preview of the draft layout (same projection as the resilient schematic renderer). */
function LayoutPreview({ layout }: { layout: AirportLayout }) {
    const model = useMemo(() => buildAirportSchematicModel(layout), [layout]);
    const labeledPois = useMemo(
        () => placeAirportSchematicLabels(model.pois),
        [model],
    );
    return (
        <svg
            viewBox="0 0 100 100"
            role="img"
            aria-label={`Rendered preview of the ${layout.iata} draft layout`}
            className="h-auto w-full rounded-xl border border-gray-200 bg-[#f7f5f0]"
        >
            {model.zones.map((zone) => (
                <polygon
                    key={zone.id}
                    points={zone.points.map((point) => `${point.x},${point.y}`).join(' ')}
                    fill={zone.airside ? '#dbe7f5' : '#e8e3d8'}
                    stroke="#8a94a6"
                    strokeWidth={0.4}
                />
            ))}
            {model.walkways.map((walkway) => (
                <line
                    key={walkway.id}
                    x1={walkway.from.x}
                    y1={walkway.from.y}
                    x2={walkway.to.x}
                    y2={walkway.to.y}
                    stroke={walkway.train ? '#7c3aed' : '#0b1f3a'}
                    strokeWidth={walkway.train ? 0.9 : 0.6}
                    strokeDasharray={walkway.train ? '2 1.2' : undefined}
                    strokeLinecap="round"
                    opacity={0.75}
                />
            ))}
            {labeledPois.map(({ definition, point, labelPoint }) => (
                <g key={definition.id}>
                    <circle cx={point.x} cy={point.y} r={1.1} fill="#b91c1c" />
                    <text
                        x={labelPoint.x}
                        y={labelPoint.y}
                        fontSize={2.4}
                        fill="#1f2937"
                        textAnchor="middle"
                    >
                        {definition.name}
                    </text>
                </g>
            ))}
        </svg>
    );
}

export default function AirportEditorPage() {
    const [iataCode, setIataCode] = useState('');
    const [layoutText, setLayoutText] = useState('');
    const [attribution, setAttribution] = useState('');
    const [sourceUrl, setSourceUrl] = useState('');
    const [status, setStatus] = useState<'draft' | 'published'>('draft');
    const [precisionGrade, setPrecisionGrade] = useState<'schematic' | 'surveyed'>('schematic');
    const [message, setMessage] = useState('');
    const [isWorking, setIsWorking] = useState(false);
    const [queue, setQueue] = useState<AirportCurationRequest[]>([]);
    const [queueLoading, setQueueLoading] = useState(true);
    const [importing, setImporting] = useState(false);
    const [importWarnings, setImportWarnings] = useState<string[]>([]);
    const [importStats, setImportStats] = useState<Record<string, number> | null>(null);
    const [importDiff, setImportDiff] = useState<AirportLayoutDiff | null>(null);
    const [previewLayout, setPreviewLayout] = useState<AirportLayout | null>(null);
    const [previewConfirmed, setPreviewConfirmed] = useState(false);
    const [packageInfo, setPackageInfo] = useState<PackageInfoResponse | null>(null);
    const [bundled, setBundled] = useState<BundledAirportSummary[]>([]);
    const [bundledLoading, setBundledLoading] = useState(true);
    const [activeBundledIata, setActiveBundledIata] = useState<string | null>(null);
    const [bundledLayout, setBundledLayout] = useState<AirportLayout | null>(null);
    const [bundledAudit, setBundledAudit] = useState<{ errors: string[]; warnings: string[] } | null>(null);
    const [bundledBusy, setBundledBusy] = useState(false);
    const [maptilerKey, setMaptilerKey] = useState('');
    const [previewGate, setPreviewGate] = useState('');
    const [previewLive, setPreviewLive] = useState(true);
    const [placeMode, setPlaceMode] = useState(false);
    const [placeCategory, setPlaceCategory] = useState<PoiCategory>('checkin');
    const [placeName, setPlaceName] = useState('');
    const [placeAirline, setPlaceAirline] = useState('');
    const [placeAirlineIata, setPlaceAirlineIata] = useState('');
    const [placeDoor, setPlaceDoor] = useState('');
    const [lastPlace, setLastPlace] = useState<{ lng: number; lat: number } | null>(null);

    const loadQueue = useCallback(async () => {
        setQueueLoading(true);
        try {
            const response = await fetch('/api/admin/airport-layout/queue');
            const body = await response.json() as { requests?: AirportCurationRequest[] };
            if (response.ok) setQueue(body.requests ?? []);
        } finally {
            setQueueLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadQueue();
    }, [loadQueue]);

    const loadBundled = useCallback(async () => {
        setBundledLoading(true);
        try {
            const response = await fetch('/api/admin/airport-layout/bundled');
            const body = await response.json() as { airports?: BundledAirportSummary[] };
            if (response.ok) setBundled(body.airports ?? []);
        } finally {
            setBundledLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadBundled();
    }, [loadBundled]);

    useEffect(() => {
        void fetch('/api/config', { cache: 'no-store' })
            .then((r) => r.json())
            .then((d: { maptilerKey?: string }) => { if (d.maptilerKey) setMaptilerKey(d.maptilerKey); })
            .catch(() => null);
    }, []);

    const openBundled = useCallback(async (iata: string) => {
        setBundledBusy(true);
        setActiveBundledIata(iata);
        setBundledLayout(null);
        setBundledAudit(null);
        try {
            const response = await fetch(`/api/admin/airport-layout/bundled?iata=${encodeURIComponent(iata)}`);
            const body = await response.json() as { layout?: AirportLayout; audit?: { errors: string[]; warnings: string[] } };
            if (response.ok && body.layout) {
                setBundledLayout(body.layout);
                setBundledAudit(body.audit ?? { errors: [], warnings: [] });
                setPreviewGate(body.layout.gateNodeResolver?.[0]?.prefix ?? '');
                setPreviewLive(true);
            }
        } finally {
            setBundledBusy(false);
        }
    }, []);

    const loadPackageInfo = useCallback(async (iata: string) => {
        if (!/^[A-Z]{3}$/.test(iata)) {
            setPackageInfo(null);
            return;
        }
        const response = await fetch(`/api/admin/airport-layout?iata=${encodeURIComponent(iata)}`);
        if (response.ok) {
            setPackageInfo(await response.json() as PackageInfoResponse);
        } else {
            setPackageInfo(null);
        }
    }, []);

    const loadBundledIntoEditor = useCallback((layout: AirportLayout) => {
        setIataCode(layout.iata);
        setLayoutText(JSON.stringify(layout, null, 2));
        setPreviewLayout(layout);
        setPreviewConfirmed(false);
        setStatus('published');
        setPrecisionGrade('surveyed');
        setMessage(`Loaded bundled ${layout.iata} into the editor. Edit + re-validate before saving.`);
        void loadPackageInfo(layout.iata);
        if (typeof window !== 'undefined') window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }, [loadPackageInfo]);

    const handlePlaceCapture = useCallback((lngLat: { lng: number; lat: number }) => {
        if (!bundledLayout) return;
        setLastPlace(lngLat);
        const name = placeName.trim() || `${placeCategory} (placed)`;
        try {
            const next = applyClickToPlace(bundledLayout, {
                lng: lngLat.lng,
                lat: lngLat.lat,
                category: placeCategory,
                name,
                airline: placeAirline.trim() || undefined,
                airlineIataCode: placeAirlineIata.trim() || undefined,
                doorLabel: placeDoor.trim() || undefined,
            });
            setBundledLayout(next);
            setLayoutText(JSON.stringify(next, null, 2));
            setPreviewLayout(next);
            setPreviewConfirmed(false);
            setStatus('draft');
            setPrecisionGrade('schematic');
            setMessage(
                `Placed "${name}" at ${lngLat.lng.toFixed(6)}, ${lngLat.lat.toFixed(6)}. ` +
                `Saved into the draft editor — confirm preview before publish.` +
                (placeCategory === 'security' ? ' Security stays approximate (never surveyed).' : ''),
            );
            setPlaceName('');
        } catch (error) {
            setMessage(`Place failed: ${error instanceof Error ? error.message : 'unknown error'}`);
        }
    }, [bundledLayout, placeCategory, placeName, placeAirline, placeAirlineIata, placeDoor]);

    /** Any edit to the layout invalidates the previous visual confirmation. */
    const updateLayoutText = (nextText: string) => {
        setLayoutText(nextText);
        setPreviewLayout(null);
        setPreviewConfirmed(false);
    };

    const handleImportFromOsm = async () => {
        if (iataCode.length !== 3) {
            setMessage('Enter a 3-letter IATA code before importing from OpenStreetMap.');
            return;
        }
        setImporting(true);
        setMessage('');
        setImportWarnings([]);
        setImportStats(null);
        setImportDiff(null);
        try {
            const response = await fetch('/api/admin/airport-layout/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ iata: iataCode.toUpperCase() }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Import failed.');
            updateLayoutText(JSON.stringify(result.layout, null, 2));
            setImportWarnings(result.warnings ?? []);
            setImportStats(result.stats ?? null);
            setImportDiff(result.vsPublished ?? null);
            if (result.source?.attribution) setAttribution(String(result.source.attribution));
            setSourceUrl('https://www.openstreetmap.org/');
            setStatus('draft');
            setMessage(
                result.message
                || `${iataCode.toUpperCase()} imported from OpenStreetMap. Fix the warnings, add security + real walkways, validate, confirm the preview, then publish.`,
            );
        } catch (error) {
            setMessage(`Error: ${error instanceof Error ? error.message : 'Import failed.'}`);
        } finally {
            setImporting(false);
        }
    };

    const selectRequest = (request: AirportCurationRequest) => {
        setIataCode(request.iata);
        setAttribution(`Kepi original ${request.iata} airport schematic`);
        setSourceUrl(request.officialMapVerified ? request.officialMapUrl ?? '' : '');
        setStatus('draft');
        setMessage(`${request.iata} selected. Build and verify its AirportLayout JSON, then save it as a draft.`);
        void loadPackageInfo(request.iata);
    };

    const dismissRequest = async (request: AirportCurationRequest) => {
        await fetch('/api/admin/airport-layout/queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ iata: request.iata, status: 'dismissed' }),
        });
        await loadQueue();
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.readAsText(file);
        reader.onload = () => updateLayoutText(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => setMessage('Error reading file.');
    };

    const buildSourceBody = () => ({
        ownership: 'kepi_original' as const,
        attribution: attribution.trim() || `Kepi original ${iataCode.toUpperCase()} airport schematic`,
        sourceUrls: sourceUrl.trim() ? [sourceUrl.trim()] : [],
        licenseNote: 'Kepi-owned vector geometry; official map artwork is not redistributed.',
        lastVerifiedAt: new Date().toISOString().slice(0, 10),
    });

    const parseLayoutText = (): unknown | null => {
        try {
            return JSON.parse(layoutText) as unknown;
        } catch {
            setMessage('Error: layout is not valid JSON.');
            return null;
        }
    };

    const handleValidateAndPreview = async () => {
        if (iataCode.length !== 3 || !layoutText.trim()) {
            setMessage('Provide an IATA code and Kepi AirportLayout JSON first.');
            return;
        }
        const layout = parseLayoutText();
        if (layout === null) return;
        setIsWorking(true);
        setMessage('');
        try {
            const response = await fetch('/api/admin/airport-layout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    iata: iataCode.toUpperCase(),
                    layout,
                    status,
                    source: buildSourceBody(),
                    dryRun: true,
                }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Validation failed.');
            setPreviewLayout(layout as AirportLayout);
            setPreviewConfirmed(false);
            setMessage(
                `${iataCode.toUpperCase()} passed structural validation (${result.stats.zones} zones, ${result.stats.nodes} nodes, ${result.stats.edges} edges, ${result.stats.pois} POIs). Now inspect the rendered preview below.`,
            );
        } catch (error) {
            setPreviewLayout(null);
            setPreviewConfirmed(false);
            setMessage(`Error: ${error instanceof Error ? error.message : 'unknown validation error'}`);
        } finally {
            setIsWorking(false);
        }
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (iataCode.length !== 3 || !layoutText.trim()) {
            setMessage('Provide an IATA code and Kepi AirportLayout JSON first.');
            return;
        }
        if (status === 'published' && (!previewLayout || !previewConfirmed)) {
            setMessage('Error: publishing requires validating, rendering, and visually confirming the preview first.');
            return;
        }
        const layout = parseLayoutText();
        if (layout === null) return;

        setIsWorking(true);
        setMessage('');
        try {
            const response = await fetch('/api/admin/airport-layout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    iata: iataCode.toUpperCase(),
                    layout,
                    status,
                    source: buildSourceBody(),
                    precisionGrade,
                    previewConfirmed,
                }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Failed to save package.');
            setMessage(
                `Successfully saved ${result.package.iata} revision ${result.package.revision} as ${result.package.status}.`,
            );
            await Promise.all([loadQueue(), loadPackageInfo(result.package.iata)]);
        } catch (error) {
            setMessage(`Error: ${error instanceof Error ? error.message : 'An unknown error occurred.'}`);
        } finally {
            setIsWorking(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 px-4 py-10">
          <div className="mx-auto w-full max-w-6xl space-y-6">
            <section className="rounded-2xl bg-white p-6 shadow-md">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Bundled airports — open &amp; verify</h2>
                        <p className="mt-1 text-sm text-gray-500">
                            Every airport shipped in code. Click one to render its map and see its routing-audit health at any time.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => void loadBundled()}
                        className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700"
                    >
                        Refresh
                    </button>
                </div>
                {bundledLoading ? (
                    <p className="mt-5 text-sm text-gray-500">Loading airports…</p>
                ) : bundled.length === 0 ? (
                    <p className="mt-5 rounded-xl bg-gray-50 p-4 text-sm text-gray-500">No bundled airports found.</p>
                ) : (
                    <div className="mt-5 flex flex-wrap gap-3">
                        {bundled.map((airport) => {
                            const isActive = activeBundledIata === airport.iata;
                            return (
                                <button
                                    key={airport.iata}
                                    type="button"
                                    onClick={() => void openBundled(airport.iata)}
                                    className={`min-w-[200px] flex-1 rounded-2xl border p-4 text-left transition ${
                                        isActive ? 'border-[#0b1f3a] bg-[#0b1f3a]/5 ring-2 ring-[#0b1f3a]/20' : 'border-gray-200 hover:border-gray-400'
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-lg font-black text-gray-900">{airport.iata}</p>
                                        {airport.errors > 0 ? (
                                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
                                                {airport.errors} err
                                            </span>
                                        ) : (
                                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                                                ✓ clean
                                            </span>
                                        )}
                                    </div>
                                    <p className="mt-0.5 text-sm text-gray-600">{airport.name}</p>
                                    <p className="mt-2 text-xs text-gray-500">
                                        {airport.counts.gates} gates · {airport.counts.lounges} lounges · {airport.counts.pois} POIs
                                    </p>
                                    <p className="mt-1 text-[11px] text-gray-400">
                                        {airport.layoutVersion}
                                        {airport.warnings > 0 ? ` · ${airport.warnings} warn` : ''}
                                    </p>
                                </button>
                            );
                        })}
                    </div>
                )}
                {activeBundledIata ? (
                    <div className="mt-6 rounded-2xl border border-gray-200 p-4">
                        {bundledBusy ? (
                            <p className="text-sm text-gray-500">Rendering {activeBundledIata}…</p>
                        ) : bundledLayout ? (
                            <div className="space-y-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-bold text-gray-900">
                                            {bundledLayout.iata} · {bundledLayout.name}
                                        </p>
                                        <p className="text-xs text-gray-500">
                                            {bundledLayout.zones.length} zones · {bundledLayout.nodes.length} nodes ·{' '}
                                            {bundledLayout.edges.length} edges · {bundledLayout.pois.length} POIs
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => loadBundledIntoEditor(bundledLayout)}
                                        className="rounded-xl bg-[#0b1f3a] px-3 py-2 text-sm font-bold text-white"
                                    >
                                        Load into editor
                                    </button>
                                </div>
                                <div className="flex flex-wrap items-center gap-3 rounded-xl bg-gray-50 p-3">
                                    <div className="flex overflow-hidden rounded-lg border border-gray-300">
                                        <button
                                            type="button"
                                            onClick={() => setPreviewLive(false)}
                                            className={`px-3 py-1.5 text-xs font-bold ${!previewLive ? 'bg-[#0b1f3a] text-white' : 'bg-white text-gray-700'}`}
                                        >
                                            Traveler plan (to security)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setPreviewLive(true)}
                                            className={`px-3 py-1.5 text-xs font-bold ${previewLive ? 'bg-[#0b1f3a] text-white' : 'bg-white text-gray-700'}`}
                                        >
                                            At airport (full route to gate)
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setPlaceMode((on) => !on)}
                                        className={`rounded-lg px-3 py-1.5 text-xs font-bold ${placeMode ? 'bg-amber-500 text-[#0b1f3a]' : 'border border-gray-300 bg-white text-gray-700'}`}
                                    >
                                        {placeMode ? 'Click-to-place ON — tap map' : 'Click-to-place'}
                                    </button>
                                    {previewLive && (bundledLayout.gateNodeResolver?.length ?? 0) > 0 ? (
                                        <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                                            Gate
                                            <select
                                                value={previewGate}
                                                onChange={(event) => setPreviewGate(event.target.value)}
                                                className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs"
                                            >
                                                {bundledLayout.gateNodeResolver.map((entry) => {
                                                    const gatePoi = bundledLayout.pois.find(
                                                        (poi) => poi.category === 'gate' && poi.nodeId === entry.nodeId,
                                                    );
                                                    return (
                                                        <option key={`${entry.prefix}-${entry.nodeId}`} value={entry.prefix}>
                                                            {gatePoi?.name ?? `Gate ${entry.prefix}`}
                                                        </option>
                                                    );
                                                })}
                                            </select>
                                        </label>
                                    ) : null}
                                    {!maptilerKey ? (
                                        <span className="text-xs text-amber-700">Loading basemap key…</span>
                                    ) : null}
                                </div>
                                {placeMode ? (
                                    <div className="grid gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 sm:grid-cols-2 lg:grid-cols-5">
                                        <label className="text-xs font-semibold text-gray-700">
                                            Category
                                            <select
                                                value={placeCategory}
                                                onChange={(e) => setPlaceCategory(e.target.value as PoiCategory)}
                                                className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                                            >
                                                {(['checkin', 'gate', 'security', 'lounge', 'restroom', 'amenity', 'train', 'baggage'] as PoiCategory[]).map((c) => (
                                                    <option key={c} value={c}>{c}</option>
                                                ))}
                                            </select>
                                        </label>
                                        <label className="text-xs font-semibold text-gray-700">
                                            Name
                                            <input
                                                value={placeName}
                                                onChange={(e) => setPlaceName(e.target.value)}
                                                placeholder="United check-in"
                                                className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                                            />
                                        </label>
                                        <label className="text-xs font-semibold text-gray-700">
                                            Airline
                                            <input
                                                value={placeAirline}
                                                onChange={(e) => setPlaceAirline(e.target.value)}
                                                placeholder="United"
                                                className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                                            />
                                        </label>
                                        <label className="text-xs font-semibold text-gray-700">
                                            IATA (logo)
                                            <input
                                                value={placeAirlineIata}
                                                onChange={(e) => setPlaceAirlineIata(e.target.value)}
                                                placeholder="UA"
                                                maxLength={3}
                                                className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm uppercase"
                                            />
                                        </label>
                                        <label className="text-xs font-semibold text-gray-700">
                                            Door label
                                            <input
                                                value={placeDoor}
                                                onChange={(e) => setPlaceDoor(e.target.value)}
                                                placeholder="Door 7"
                                                className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                                            />
                                        </label>
                                        <p className="sm:col-span-2 lg:col-span-5 text-xs text-amber-900">
                                            Tap the map to drop a pin at the real coordinate. Goes into the draft editor
                                            (preview-confirm → publish) — never a second publish path.
                                            {lastPlace ? ` Last: ${lastPlace.lng.toFixed(5)}, ${lastPlace.lat.toFixed(5)}.` : ''}
                                            {placeCategory === 'security' ? ' Security stays approximate forever (M32).' : ''}
                                        </p>
                                    </div>
                                ) : null}
                                <ReferenceImageGeorefPanel
                                    layout={bundledLayout}
                                    onApplyDraft={(next, note) => {
                                        setBundledLayout(next);
                                        loadBundledIntoEditor(next);
                                        setMessage(note);
                                    }}
                                />
                                <div className="relative h-[70vh] min-h-[420px] w-full overflow-hidden rounded-xl border border-gray-200">
                                    <AirportNavigatorMap
                                        key={`${bundledLayout.iata}-${previewLive ? 'live' : 'plan'}-${bundledLayout.pois.length}`}
                                        fill
                                        previewMode={!previewLive}
                                        maptilerKey={maptilerKey}
                                        iata={bundledLayout.iata}
                                        gateCode={previewLive ? previewGate || null : null}
                                        airlineName={null}
                                        proximityStatus="preview"
                                        minutesToDeparture={90}
                                        userLat={null}
                                        userLon={null}
                                        credentials={PREVIEW_CREDENTIALS}
                                        onCredentialsAnswer={() => undefined}
                                        layoutOverride={bundledLayout}
                                        placeMode={placeMode}
                                        onPlaceCapture={handlePlaceCapture}
                                    />
                                </div>
                                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                                    <details className="rounded-xl border border-gray-200 p-3">
                                        <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-gray-500">
                                            Wire diagram (nodes &amp; edges)
                                        </summary>
                                        <div className="mt-3">
                                            <LayoutPreview layout={bundledLayout} />
                                        </div>
                                    </details>
                                    <div className="space-y-3">
                                        {bundledAudit && bundledAudit.errors.length === 0 && bundledAudit.warnings.length === 0 ? (
                                            <p className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
                                                ✓ Passes the M29 routing-quality audit — reachable destinations, no backtracking, coordinates sane.
                                            </p>
                                        ) : null}
                                        {bundledAudit && bundledAudit.errors.length > 0 ? (
                                            <div className="rounded-xl bg-red-50 p-3">
                                                <p className="text-sm font-bold text-red-800">
                                                    {bundledAudit.errors.length} routing error(s)
                                                </p>
                                                <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-red-700">
                                                    {bundledAudit.errors.map((error) => (
                                                        <li key={error}>{error}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ) : null}
                                        {bundledAudit && bundledAudit.warnings.length > 0 ? (
                                            <div className="rounded-xl bg-amber-50 p-3">
                                                <p className="text-sm font-bold text-amber-800">
                                                    {bundledAudit.warnings.length} warning(s)
                                                </p>
                                                <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-amber-700">
                                                    {bundledAudit.warnings.map((warning) => (
                                                        <li key={warning}>{warning}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-red-500">Could not load {activeBundledIata}.</p>
                        )}
                    </div>
                ) : null}
            </section>
            <div className="grid w-full gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
              <section className="rounded-2xl bg-white p-6 shadow-md">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Airport demand queue</h2>
                        <p className="mt-1 text-sm text-gray-500">
                            Missing airports appear automatically. Demand is deduplicated within five minutes.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => void loadQueue()}
                        className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700"
                    >
                        Refresh
                    </button>
                </div>
                <div className="mt-5 space-y-3">
                    {queueLoading ? <p className="text-sm text-gray-500">Loading requests…</p> : null}
                    {!queueLoading && queue.length === 0 ? (
                        <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-500">No airport requests yet.</p>
                    ) : null}
                    {queue.map((request) => (
                        <article key={request.iata} className="rounded-2xl border border-gray-200 p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-lg font-black text-gray-900">
                                        {request.iata} · {request.airportName}
                                    </p>
                                    <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                                        {request.status} · demand {request.demandCount}
                                        {request.linkedPackageRevision
                                            ? ` · rev ${request.linkedPackageRevision}`
                                            : ''}
                                    </p>
                                    {request.needsReverification ? (
                                        <p className="mt-1 text-xs font-bold text-amber-700">
                                            Needs re-verification
                                            {request.lastVerifiedAt ? ` · last verified ${request.lastVerifiedAt}` : ''}
                                        </p>
                                    ) : request.stalenessLabel ? (
                                        <p className="mt-1 text-xs text-gray-400">
                                            {request.stalenessLabel}
                                            {request.lastVerifiedAt ? ` · ${request.lastVerifiedAt}` : ''}
                                        </p>
                                    ) : null}
                                    {request.detectedBy && request.detectedBy.length > 0 ? (
                                        <p className="mt-1 text-xs text-gray-400">
                                            Seen via {request.detectedBy.join(', ')}
                                        </p>
                                    ) : null}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => selectRequest(request)}
                                    disabled={request.status === 'published'}
                                    className="rounded-xl bg-[#0b1f3a] px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
                                >
                                    Prepare
                                </button>
                            </div>
                            {request.officialMapUrl ? (
                                <a
                                    href={request.officialMapUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-3 block text-sm font-semibold text-blue-700 underline"
                                >
                                    Review {request.officialMapVerified ? 'verified official source' : 'map search'}
                                </a>
                            ) : null}
                            {request.status !== 'published' && request.status !== 'dismissed' ? (
                                <button
                                    type="button"
                                    onClick={() => void dismissRequest(request)}
                                    className="mt-3 text-xs font-semibold text-gray-500 underline"
                                >
                                    Dismiss request
                                </button>
                            ) : null}
                        </article>
                    ))}
                </div>
                {packageInfo ? (
                    <div className="mt-6 rounded-2xl border border-gray-200 p-4">
                        <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700">
                            {packageInfo.iata} version history
                        </h3>
                        <p className="mt-1 text-xs text-gray-500">
                            Published rev {packageInfo.published?.revision ?? '—'} · Draft rev {packageInfo.draft?.revision ?? '—'}
                        </p>
                        {packageInfo.history.length === 0 ? (
                            <p className="mt-3 text-xs text-gray-400">No stored revisions yet.</p>
                        ) : (
                            <ul className="mt-3 space-y-1">
                                {packageInfo.history.map((entry) => (
                                    <li key={entry.revision} className="text-xs text-gray-600">
                                        rev {entry.revision} · {entry.status}
                                        {entry.precisionGrade ? ` · ${entry.precisionGrade}` : ''}
                                        {' · '}{new Date(entry.updatedAt).toLocaleString()}
                                        {entry.previewConfirmedBy ? ` · preview ✓ ${entry.previewConfirmedBy}` : ''}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                ) : null}
              </section>
              <section className="w-full rounded-2xl bg-white p-8 shadow-md">
                <h1 className="text-2xl font-bold text-center mb-2">Kepi Airport Package Editor</h1>
                <p className="mb-6 text-center text-sm text-gray-500">
                    Upload or paste original vector geometry, routing nodes, edges, and POIs.
                    Validate, inspect the rendered preview, then save. Publishing requires the visual check.
                </p>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="iata" className="block text-sm font-medium text-gray-700">
                            Airport IATA Code (e.g., JFK, LAX)
                        </label>
                        <input
                            id="iata"
                            type="text"
                            value={iataCode}
                            onChange={(e) => {
                                setIataCode(e.target.value.toUpperCase());
                                setPackageInfo(null);
                            }}
                            onBlur={() => void loadPackageInfo(iataCode)}
                            maxLength={3}
                            className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            placeholder="JFK"
                            required
                        />
                    </div>
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-bold text-emerald-900">Import real shape from OpenStreetMap</p>
                                <p className="mt-0.5 text-xs text-emerald-700">
                                    Free, legal (ODbL, attributed). Produces a draft you must finish curating.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => void handleImportFromOsm()}
                                disabled={importing || iataCode.length !== 3}
                                className="shrink-0 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
                            >
                                {importing ? 'Importing…' : 'Import'}
                            </button>
                        </div>
                        {importStats ? (
                            <p className="mt-3 text-xs font-semibold text-emerald-800">
                                {importStats.zones} zones · {importStats.gates} gates · {importStats.lounges} lounges · {importStats.restrooms} restrooms
                            </p>
                        ) : null}
                        {importWarnings.length > 0 ? (
                            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-800">
                                {importWarnings.map((warning) => (
                                    <li key={warning}>{warning}</li>
                                ))}
                            </ul>
                        ) : null}
                        {importDiff ? (
                            <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-950">
                                <p className="font-bold">{importDiff.summary}</p>
                                {importDiff.added.length > 0 ? (
                                    <p className="mt-1">Added: {importDiff.added.slice(0, 8).map((a) => a.name).join(', ')}{importDiff.added.length > 8 ? '…' : ''}</p>
                                ) : null}
                                {importDiff.removed.length > 0 ? (
                                    <p className="mt-1">Removed: {importDiff.removed.slice(0, 8).map((a) => a.name).join(', ')}{importDiff.removed.length > 8 ? '…' : ''}</p>
                                ) : null}
                                {importDiff.moved.length > 0 ? (
                                    <p className="mt-1">Moved: {importDiff.moved.slice(0, 8).map((a) => `${a.name} (${a.distanceM}m)`).join(', ')}{importDiff.moved.length > 8 ? '…' : ''}</p>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                    <div>
                        <label htmlFor="file-input" className="block text-sm font-medium text-gray-700">
                            Kepi AirportLayout Package (.json)
                        </label>
                        <input
                            id="file-input"
                            type="file"
                            onChange={handleFileChange}
                            accept=".json,application/json"
                            className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100"
                        />
                    </div>
                    <div>
                        <label htmlFor="layout-json" className="block text-sm font-medium text-gray-700">
                            …or paste AirportLayout JSON
                        </label>
                        <textarea
                            id="layout-json"
                            value={layoutText}
                            onChange={(event) => updateLayoutText(event.target.value)}
                            rows={6}
                            spellCheck={false}
                            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-xs shadow-sm"
                            placeholder='{"iata":"JFK","name":"John F. Kennedy International Airport", …}'
                        />
                    </div>
                    <div>
                        <label htmlFor="attribution" className="block text-sm font-medium text-gray-700">
                            Attribution
                        </label>
                        <input
                            id="attribution"
                            type="text"
                            value={attribution}
                            onChange={(event) => setAttribution(event.target.value)}
                            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm"
                            placeholder="Kepi original SEA terminal schematic"
                        />
                    </div>
                    <div>
                        <label htmlFor="source-url" className="block text-sm font-medium text-gray-700">
                            Official reference URL
                        </label>
                        <input
                            id="source-url"
                            type="url"
                            value={sourceUrl}
                            onChange={(event) => setSourceUrl(event.target.value)}
                            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm"
                            placeholder="https://airport.example/maps"
                        />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <label htmlFor="precision" className="block text-sm font-medium text-gray-700">
                                Precision grade
                            </label>
                            <select
                                id="precision"
                                value={precisionGrade}
                                onChange={(event) => setPrecisionGrade(event.target.value as 'schematic' | 'surveyed')}
                                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm"
                            >
                                <option value="schematic">Schematic — approximate geometry</option>
                                <option value="surveyed">Surveyed — verified positions</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="status" className="block text-sm font-medium text-gray-700">
                                Save status
                            </label>
                            <select
                                id="status"
                                value={status}
                                onChange={(event) => setStatus(event.target.value as 'draft' | 'published')}
                                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm"
                            >
                                <option value="draft">Draft — not visible to travelers</option>
                                <option value="published">Published — available immediately</option>
                            </select>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => void handleValidateAndPreview()}
                        disabled={isWorking}
                        className="w-full rounded-md border border-indigo-600 py-2 px-4 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-40"
                    >
                        {isWorking ? 'Working…' : 'Validate & render preview'}
                    </button>
                    {previewLayout ? (
                        <div className="space-y-3 rounded-2xl border border-gray-200 p-4">
                            <p className="text-sm font-semibold text-gray-800">
                                Rendered preview — check gates, corridors, and security placement against the official reference.
                            </p>
                            <LayoutPreview layout={previewLayout} />
                            <label className="flex items-start gap-2 text-sm text-gray-700">
                                <input
                                    type="checkbox"
                                    checked={previewConfirmed}
                                    onChange={(event) => setPreviewConfirmed(event.target.checked)}
                                    className="mt-0.5"
                                />
                                <span>
                                    I inspected the rendered preview and the geometry is physically plausible
                                    (gates in the right concourses, security on the right side, no offshore geometry).
                                </span>
                            </label>
                        </div>
                    ) : null}
                    <button
                        type="submit"
                        disabled={isWorking || (status === 'published' && (!previewLayout || !previewConfirmed))}
                        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-300"
                    >
                        {isWorking ? 'Validating and saving…' : `Save ${status}`}
                    </button>
                </form>
                {message && (
                    <p className={`mt-4 text-sm text-center ${message.startsWith('Error') ? 'text-red-500' : 'text-green-500'}`}>
                        {message}
                    </p>
                )}
              </section>
            </div>
          </div>
        </div>
    );
}
