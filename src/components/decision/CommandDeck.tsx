"use client";

/**
 * Kepi Command Deck — the decision engine surface, rebuilt in Kepi's design
 * language (ported logic from the original Cursor build; frontend rewritten:
 * no shadcn/lucide deps, dark concierge palette matching the Airport
 * Navigator, gold = the winning play).
 *
 * What it does: one sentence of intent → ranked travel strategies with TVS
 * (True Value Score), live Duffel cash fares woven into the math, one-tap
 * questions that re-rank, voice counterfactuals ("what if I leave a week
 * earlier?"), and Activate → a real Kepi trip.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import type {
  CounterfactualMutation,
  DecisionBrief,
  DecisionQuestion,
  PaymentMode,
  PlanMode,
  SelectedStayActivation,
  StrategyFlexOptionsResult,
  TravelStrategy,
} from "@/lib/decision/types";
import { filterStrategiesByPaymentMode, paymentModeDescription } from "@/lib/decision/paymentMode";
import { toggleLegEnabled } from "@/lib/decision/flightLegPlanner";
import type { ExpertDeckOptions } from "@/lib/decision/expertDeck";
import { expertPlaceholder } from "@/lib/decision/expertDeck";
import type { RankedStay } from "@/lib/decision/stayRanking";
import { StrategyFlexModal } from "@/components/decision/StrategyFlexModal";
import { RecordTripModal } from "@/components/decision/RecordTripModal";
import { TripItinerarySummary } from "@/components/decision/TripItinerarySummary";
import { ExpertDeckPanel } from "@/components/decision/ExpertDeckPanel";
import { TripAlignmentBoard } from "@/components/decision/TripAlignmentBoard";
import { TopologyWaveHero } from "@/components/decision/TopologyWaveHero";
import { FusedFlightHero } from "@/components/decision/FusedFlightHero";
import { AnalyzeProgressPanel } from "@/components/decision/AnalyzeProgressPanel";
import { BookingWalkthroughModal } from "@/components/decision/BookingWalkthroughModal";
import { buildAlignmentBoard } from "@/lib/decision/tripAlignment";
import type { AlignmentLeg } from "@/lib/decision/tripAlignment";

import { RECORD_TRIP_EXAMPLE } from "@/lib/decision/intentParser";

interface StaysResponse {
  configured: boolean;
  source?: "duffel" | "estimated";
  notice?: string;
  error?: string;
  intent: {
    destination: string;
    nights: number;
    startDate: string;
    endDate: string;
    isMultiCity?: boolean;
  };
  stays: RankedStay[];
  stopLegs?: Array<{
    stopName: string;
    iata: string;
    checkInDate: string;
    checkOutDate: string;
    nights: number;
    source?: "duffel" | "estimated";
    stays: RankedStay[];
  }>;
}

const INPUT_PLACEHOLDER_FLIGHTS =
  "Where do you plan to travel? e.g. West Coast to Bari, Venice, Dolomites, Germany — fly home from Munich. Alaska Gold.";
const STRATEGY_TIMEOUT_MS = 20_000; // cold start 5s + server 9s = 14s max; 20s is safe
const STAYS_TIMEOUT_MS = 24_000;
const FLEX_TIMEOUT_MS = 32_000;
const ANALYZE_FAST_RETRY_MAX = 1;

const SEGMENT_ICON: Record<string, string> = {
  flight: "✈️",
  hotel: "🏨",
  drive: "🚗",
  train: "🚆",
};

class RequestTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestTimeoutError";
  }
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new RequestTimeoutError(timeoutMessage);
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

function parseVoiceMutation(text: string): CounterfactualMutation | null {
  const lower = text.toLowerCase();
  if (lower.includes("week earlier") || lower.includes("leave earlier")) return { dateShiftDays: -7 };
  if (lower.includes("week later") || lower.includes("leave later")) return { dateShiftDays: 7 };
  if (lower.includes("more comfort") || lower.includes("prioritize comfort")) return { priorityComfort: 0.85 };
  if (lower.includes("save money") || lower.includes("prioritize value")) return { priorityComfort: 0.25 };
  if (lower.includes("willing to reposition") || lower.includes("yes reposition")) return { willingToReposition: true };
  if (lower.includes("no reposition") || lower.includes("direct only")) return { willingToReposition: false };
  return null;
}

/* ── TVS dial: a small SVG arc gauge — the score you feel, not just read ── */
function TvsDial({ value, gold }: { value: number; gold: boolean }) {
  const clamped = Math.max(0, Math.min(100, value));
  const sweep = (clamped / 100) * 240; // 240° arc
  const radius = 22;
  const center = 28;
  const toXY = (angleDeg: number) => {
    const rad = ((angleDeg - 210) * Math.PI) / 180; // start at 7 o'clock
    return [center + radius * Math.cos(rad), center + radius * Math.sin(rad)];
  };
  const [sx, sy] = toXY(0);
  const [ex, ey] = toXY(sweep);
  const large = sweep > 180 ? 1 : 0;
  const stroke = gold ? "#f4c95d" : "#7dd3fc";
  return (
    <div className="relative h-14 w-14 shrink-0">
      <svg viewBox="0 0 56 56" className="h-14 w-14">
        <path
          d={`M ${toXY(0)[0]} ${toXY(0)[1]} A ${radius} ${radius} 0 1 1 ${toXY(240)[0]} ${toXY(240)[1]}`}
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="4"
          strokeLinecap="round"
        />
        {sweep > 2 && (
          <path
            d={`M ${sx} ${sy} A ${radius} ${radius} 0 ${large} 1 ${ex} ${ey}`}
            fill="none"
            stroke={stroke}
            strokeWidth="4"
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 4px ${stroke}66)` }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-black tabular-nums text-white">{Math.round(clamped)}</span>
        <span className="text-[7px] font-bold uppercase tracking-widest text-slate-400">TVS</span>
      </div>
    </div>
  );
}

function strategyPricingLabel(strategy: TravelStrategy, liveConfigured: boolean): string {
  if (strategy.kind === "direct_cash" && liveConfigured) return "Live Duffel cash";
  if (strategy.kind === "reposition_award") return "Playbook · award est.";
  return "Modeled playbook";
}

/* ── Strategy card ──────────────────────────────────────────────────────── */
function StrategyCard({
  strategy,
  rank,
  index,
  expanded,
  activating,
  compareLoading,
  bestLiveFare,
  liveConfigured,
  expertMode,
  onToggle,
  onActivate,
  onCompareDates,
  hideCompareDates,
}: {
  strategy: TravelStrategy;
  rank: number;
  index: number;
  expanded: boolean;
  activating: boolean;
  compareLoading: boolean;
  bestLiveFare: number | null;
  liveConfigured: boolean;
  expertMode?: boolean;
  onToggle: () => void;
  onActivate: () => void;
  onCompareDates: () => void;
  hideCompareDates?: boolean;
}) {
  const gold = strategy.recommended;
  const statusPick = strategy.statusRecommended && !gold;
  const displayRank = strategy.valueRank ?? rank;
  const savesVsWalkUp =
    bestLiveFare !== null && bestLiveFare > strategy.scores.trueOutOfPocket
      ? Math.round(bestLiveFare - strategy.scores.trueOutOfPocket)
      : null;

  return (
    <article
      className={`overflow-hidden rounded-3xl border transition-all duration-300 ${
        gold
          ? "border-amber-400/80 bg-gradient-to-br from-[#2a4568] via-[#1e3555] to-[#152238] shadow-lg shadow-amber-950/30"
          : statusPick
            ? "border-sky-400/70 bg-gradient-to-br from-[#1a3555] to-[#152238]"
            : "border-slate-600 bg-[#152238] hover:border-slate-500 hover:bg-[#1a2d4a]"
      }`}
      style={{ animation: `deckRise 0.45s ease-out both`, animationDelay: `${index * 90}ms` }}
    >
      <button type="button" className="w-full px-5 py-4 text-left" onClick={onToggle}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              {gold && (
                <span className="rounded-full bg-[#f4c95d] px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#0b1f3a]">
                  ★ Best value
                </span>
              )}
              {statusPick && (
                <span className="rounded-full bg-sky-500/25 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-sky-100">
                  ★ Status pick
                </span>
              )}
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                #{displayRank} · {strategy.kind.replace(/_/g, " ")}
              </span>
              <span className="rounded-md bg-slate-700 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-300">
                {strategyPricingLabel(strategy, liveConfigured)}
              </span>
            </div>
            <h3 className="text-lg font-bold tracking-tight text-white">{strategy.title}</h3>
            <p className="mt-0.5 text-sm font-medium text-sky-100">{strategy.headline}</p>
          </div>
          <TvsDial value={strategy.scores.tvs} gold={Boolean(gold || statusPick)} />
        </div>

        <p className="mt-3 text-sm leading-relaxed text-slate-300">{strategy.reasoning}</p>

        {expertMode && strategy.rankExplanation ? (
          <p className="mt-2 rounded-xl border border-sky-500/30 bg-sky-950/40 px-3 py-2 text-xs leading-relaxed text-sky-100">
            {strategy.rankExplanation}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="rounded-lg bg-slate-700 px-2 py-1 text-[11px] font-bold text-white">
            ${strategy.scores.trueOutOfPocket.toLocaleString()} cash out
          </span>
          {strategy.scores.totalTripValue !== undefined && (
            <span className="rounded-lg bg-slate-700 px-2 py-1 text-[11px] font-semibold text-slate-200">
              ${strategy.scores.totalTripValue.toLocaleString()} trip value
            </span>
          )}
          {(strategy.scores.bestCpp ?? 0) > 0 && (
            <span className="rounded-lg bg-slate-700 px-2 py-1 text-[11px] font-semibold text-slate-200">
              {strategy.scores.bestCpp}¢/mi best redemption
            </span>
          )}
          <span className="rounded-lg bg-slate-700 px-2 py-1 text-[11px] font-semibold text-slate-200">
            {strategy.scores.frictionMinutes}m friction
          </span>
          {savesVsWalkUp !== null && savesVsWalkUp > 0 && (
            <span className="rounded-lg bg-emerald-900/70 px-2 py-1 text-[11px] font-bold text-emerald-100">
              saves ${savesVsWalkUp.toLocaleString()} vs live fare
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-600 px-5 pb-5 pt-4">
          {strategy.statusRecommendReason && (
            <p className="mb-4 rounded-xl border border-sky-500/40 bg-sky-950/60 px-3 py-2.5 text-xs leading-relaxed text-sky-100">
              {strategy.statusRecommendReason}
            </p>
          )}
          {/* Segment timeline */}
          <ol className="space-y-0">
            {strategy.segments.map((seg, segIdx) => (
              <li key={`${seg.label}-${segIdx}`} className="relative flex gap-3 pb-4 last:pb-0">
                {segIdx < strategy.segments.length - 1 && (
                  <span className="absolute left-[13px] top-7 h-full w-px bg-gradient-to-b from-[#f4c95d]/50 to-transparent" />
                )}
                <span className="z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-700 text-sm">
                  {SEGMENT_ICON[seg.mode] ?? "•"}
                </span>
                <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">{seg.label}</p>
                    <p className="text-xs text-slate-400">{seg.detail}</p>
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-slate-200">
                    {seg.milesUsed ? `${(seg.milesUsed / 1000).toFixed(0)}k pts` : `$${seg.costUsd}`}
                  </span>
                </div>
              </li>
            ))}
          </ol>

          {/* Instrument plays */}
          {strategy.instrumentsUsed.length > 0 && (
            <ul className="mt-4 space-y-1.5">
              {strategy.instrumentsUsed.map((inst) => (
                <li key={inst.instrumentId} className="flex items-start gap-2 text-xs text-slate-200">
                  <span className={inst.optimal ? "text-emerald-400" : "text-slate-500"}>
                    {inst.optimal ? "✓" : "○"}
                  </span>
                  <span>
                    {inst.label}
                    <span className="text-slate-400"> · ${inst.valueUsd} value</span>
                    {inst.warning && <span className="text-amber-200"> — {inst.warning}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* Pre-crime warnings — Kepi tells you what goes wrong BEFORE it does */}
          {strategy.preCrimeWarnings.map((warning) => (
            <p
              key={warning}
              className="mt-3 flex items-start gap-2 rounded-xl border border-amber-600/40 bg-amber-950/50 px-3 py-2 text-xs leading-relaxed text-amber-100"
            >
              <span className="mt-px shrink-0">⚠</span>
              {warning}
            </p>
          ))}

          {!hideCompareDates ? (
          <button
            type="button"
            onClick={onCompareDates}
            disabled={compareLoading}
            className="mt-4 w-full rounded-2xl border border-sky-500/40 bg-sky-950/50 py-3 text-sm font-bold text-sky-100 transition-all hover:bg-sky-900/60 disabled:opacity-60"
          >
            {compareLoading ? "Checking nearby dates…" : "Compare dates — top 3 options →"}
          </button>
          ) : null}

          <button
            type="button"
            onClick={onActivate}
            disabled={activating}
            className={`mt-4 w-full rounded-2xl py-3 text-sm font-black tracking-wide transition-all ${
              gold
                ? "bg-[#f4c95d] text-[#0b1f3a] hover:bg-[#ffe29a] disabled:opacity-60"
                : "border border-slate-500 bg-slate-700 text-white hover:bg-slate-600 disabled:opacity-60"
            }`}
          >
            {activating ? "Saving your plan…" : "Save plan & book →"}
          </button>
        </div>
      )}
    </article>
  );
}

const PENDING_ACTIVATE_KEY = "kepi:pendingActivate";

type PendingActivate = {
  prompt: string;
  strategyId: string;
  stays?: SelectedStayActivation[];
};

function stayLegKey(input: { stopName: string; checkInDate: string }): string {
  return `${input.stopName}-${input.checkInDate}`;
}

function stayPayloadFromSelection(
  stay: RankedStay,
  dates: { checkInDate: string; checkOutDate: string },
): SelectedStayActivation {
  return {
    quoteId: stay.quote.id,
    name: stay.quote.name,
    chainName: stay.quote.chainName,
    photoUrl: stay.quote.photoUrl,
    area: stay.quote.area,
    totalAmountUsd: stay.quote.totalAmountUsd,
    nightlyUsd: stay.quote.nightlyUsd,
    currency: stay.quote.currency,
    checkInDate: dates.checkInDate,
    checkOutDate: dates.checkOutDate,
  };
}

function collectSelectedStayPayloads(
  staysData: StaysResponse | null,
  selectedStayByLeg: Record<string, string>,
): SelectedStayActivation[] {
  if (!staysData) return [];

  if (staysData.stopLegs && staysData.stopLegs.length > 0) {
    return staysData.stopLegs.flatMap((leg) => {
      const key = stayLegKey(leg);
      const selectedId = selectedStayByLeg[key];
      const ranked =
        (selectedId ? leg.stays.find((stay) => stay.quote.id === selectedId) : undefined) ??
        leg.stays.find((stay) => stay.kepiPick) ??
        leg.stays[0];
      if (!ranked) return [];
      return [
        stayPayloadFromSelection(ranked, {
          checkInDate: leg.checkInDate,
          checkOutDate: leg.checkOutDate,
        }),
      ];
    });
  }

  const selectedId = selectedStayByLeg.default;
  const ranked =
    (selectedId ? staysData.stays.find((stay) => stay.quote.id === selectedId) : undefined) ??
    staysData.stays.find((stay) => stay.kepiPick) ??
    staysData.stays[0];
  if (!ranked) return [];
  return [
    stayPayloadFromSelection(ranked, {
      checkInDate: staysData.intent.startDate,
      checkOutDate: staysData.intent.endDate,
    }),
  ];
}

/* ── Command Deck ───────────────────────────────────────────────────────── */
export function CommandDeck({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isSignedIn } = useAuth();
  const [prompt, setPrompt] = useState("");
  const [inputPrompt, setInputPrompt] = useState("");
  const [brief, setBrief] = useState<DecisionBrief | null>(null);
  const [comfortWeight, setComfortWeight] = useState(0.55);
  const [loading, setLoading] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [clarification, setClarification] = useState<{
    type: string;
    message: string;
    hint: string;
    parsed: Record<string, unknown>;
  } | null>(null);
  const [refineOpen, setRefineOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [counterfactualNote, setCounterfactualNote] = useState<string | null>(null);
  const [flexOpen, setFlexOpen] = useState(false);
  const [flexLoading, setFlexLoading] = useState(false);
  const [flexError, setFlexError] = useState<string | null>(null);
  const [flexData, setFlexData] = useState<StrategyFlexOptionsResult | null>(null);
  const [flexStrategyId, setFlexStrategyId] = useState<string | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash");
  const [planMode, setPlanMode] = useState<PlanMode>("flights");
  const [expertOptions, setExpertOptions] = useState<ExpertDeckOptions>({ enabled: false, dateFlexDays: 3 });
  const [enabledLegIds, setEnabledLegIds] = useState<string[]>([]);
  const [legToggleBusy, setLegToggleBusy] = useState(false);
  const [walkthroughOpen, setWalkthroughOpen] = useState(false);
  const [analyzeStep, setAnalyzeStep] = useState(0);
  const [walkthroughData, setWalkthroughData] = useState<{
    tripName: string;
    strategyTitle: string;
    legs: AlignmentLeg[];
    verifiedLegCount: number;
    totalBookableLegs: number;
    redirectPath: string;
  } | null>(null);
  const [forwardAddress, setForwardAddress] = useState<string | null>(null);
  const analyzeFastRetryRef = useRef(0);

  useEffect(() => {
    const modeParam = searchParams.get("mode");
    if (modeParam === "flights" || modeParam === "hotels" || modeParam === "full") {
      setPlanMode(modeParam);
    }
  }, [searchParams]);

  // Stays — load unasked, the moment strategies exist (godlike mode)
  const [staysData, setStaysData] = useState<StaysResponse | null>(null);
  const [staysLoading, setStaysLoading] = useState(false);
  const [selectedStayByLeg, setSelectedStayByLeg] = useState<Record<string, string>>({});

  // Voice counterfactual bar
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const analysisRunRef = useRef(0);

  useEffect(() => {
    if (!walkthroughOpen) return;
    void fetch("/api/email-handle/mine", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { forwardAddress?: string } | null) => {
        if (data?.forwardAddress) {
          setForwardAddress(data.forwardAddress);
        }
      })
      .catch(() => null);
  }, [walkthroughOpen]);

  useEffect(() => {
    if (!loading) {
      setAnalyzeStep(0);
      return;
    }
    setAnalyzeStep(0);
    const steps = planMode === "hotels" ? 2 : 4;
    const timer = window.setInterval(() => {
      setAnalyzeStep((current) => Math.min(current + 1, steps - 1));
    }, 6000); // slow steps down — API responds in ~5s, so results show mid-step-1
    return () => window.clearInterval(timer);
  }, [loading, planMode]);

  const fetchStrategies = useCallback(
    async (
      nextPrompt: string,
      weight: number,
      mutation?: CounterfactualMutation,
      legIdsOverride?: string[],
      planModeOverride?: PlanMode,
      fetchOptions?: { fastPath?: boolean; isFastRetry?: boolean },
    ) => {
      const trimmed = nextPrompt.trim();
      if (!trimmed) return;
      const runId = (analysisRunRef.current += 1);

      const isLegToggle = Boolean(legIdsOverride);
      if (isLegToggle) {
        setLegToggleBusy(true);
      } else {
        setLoading(true);
        setError(null);
        setBrief(null);
        setClarification(null);
        setStaysData(null);
        setSelectedStayId(null);
        setExpandedId(null);
        setCounterfactualNote(null);
        setEnabledLegIds([]);
        if (!mutation) {
          setHasAnalyzed(true);
          if (!fetchOptions?.isFastRetry) {
            analyzeFastRetryRef.current = 0;
          }
        }
      }

      try {
        const endpoint = mutation ? "/api/decision/counterfactual" : "/api/decision/strategies";
        const analyzeFetchStartedAt = Date.now();
        const useFastPath = fetchOptions?.fastPath === true;
        console.log("[analyze] fetch:start", {
          endpoint,
          planMode: planModeOverride ?? planMode,
          isLegToggle,
          fastPath: useFastPath,
          timeoutMs: STRATEGY_TIMEOUT_MS,
        });
        const legIds = legIdsOverride ?? enabledLegIds;
        const activePlanMode = planModeOverride ?? planMode;
        const body = mutation
          ? { prompt: nextPrompt, mutation: { ...mutation, priorityComfort: mutation.priorityComfort ?? weight } }
          : {
              prompt: nextPrompt,
              comfortWeight: weight,
              planMode: activePlanMode,
              paymentMode,
              enabledLegIds: legIds.length > 0 ? legIds : undefined,
              expert: expertOptions.enabled ? { ...expertOptions, enabled: true } : undefined,
              ...(useFastPath ? { fastPath: true } : {}),
            };
        const res = await fetchWithTimeout(
          endpoint,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            cache: "no-store",
            credentials: "same-origin",
          },
          STRATEGY_TIMEOUT_MS,
          "Taking longer than expected — tap Try Again for a faster result.",
        );
        const elapsedMs = Date.now() - analyzeFetchStartedAt;
        console.log("[analyze] fetch:response", {
          ms: elapsedMs,
          ok: res.ok,
          status: res.status,
          fastPath: useFastPath,
        });
        if (!res.ok) {
          const canFastRetry =
            !mutation &&
            !isLegToggle &&
            !useFastPath &&
            analyzeFastRetryRef.current < ANALYZE_FAST_RETRY_MAX &&
            (res.status === 504 || res.status === 408);
          if (canFastRetry) {
            analyzeFastRetryRef.current += 1;
            console.log("[analyze] fast-path retry", {
              attempt: analyzeFastRetryRef.current,
              max: ANALYZE_FAST_RETRY_MAX,
              reason: `HTTP ${res.status}`,
            });
            await fetchStrategies(nextPrompt, weight, mutation, legIdsOverride, planModeOverride, {
              fastPath: true,
              isFastRetry: true,
            });
            return;
          }
          throw new Error(
            res.status === 401 || res.status === 404
              ? "Sign in to use the Command Deck."
              : useFastPath
                ? "Analyze stopped before it could finish — fast strategy path failed. Try again in a moment."
                : "Couldn't load strategies — check your internet and try again.",
          );
        }
        const data = await res.json();
        // Don't bail on runId mismatch — brief from the latest fetch is always valid
        // and setLoading(false) in finally always runs regardless
        analyzeFastRetryRef.current = 0;
        console.log("[analyze] complete", {
          ms: elapsedMs,
          fastPath: useFastPath,
          strategyCount: data.brief?.strategies?.length ?? 0,
          hasTopology: Boolean(data.brief?.topologySearch),
        });
        if (data.clarification) {
          setClarification(data.clarification);
          setLoading(false);
          return;
        }
        setBrief(data.brief);
        if (data.brief?.paymentMode) {
          setPaymentMode(data.brief.paymentMode);
        }
        if (data.brief?.planMode) {
          setPlanMode(data.brief.planMode);
        }
        if (data.brief?.flightLegs) {
          setEnabledLegIds(data.brief.flightLegs.filter((leg) => leg.enabled).map((leg) => leg.id));
        }
        if (mutation && data.counterfactual?.rankingChanged) {
          setCounterfactualNote("Ranking changed from your refinement ↑");
        } else if (mutation) {
          setCounterfactualNote("Scores updated — top pick holds.");
        }
        const top = data.brief?.strategies?.[0];
        if (top && !isLegToggle) setExpandedId(top.id);
      } catch (e) {
        const isTimeout = e instanceof RequestTimeoutError;
        const canFastRetry =
          !mutation &&
          !isLegToggle &&
          !fetchOptions?.fastPath &&
          analyzeFastRetryRef.current < ANALYZE_FAST_RETRY_MAX &&
          isTimeout;
        if (canFastRetry) {
          analyzeFastRetryRef.current += 1;
          console.log("[analyze] fast-path retry", {
            attempt: analyzeFastRetryRef.current,
            max: ANALYZE_FAST_RETRY_MAX,
            reason: "client abort timeout",
          });
          await fetchStrategies(nextPrompt, weight, mutation, legIdsOverride, planModeOverride, {
            fastPath: true,
            isFastRetry: true,
          });
          return;
        }
        console.log("[analyze] fetch:failed", {
          message: e instanceof Error ? e.message : "unknown",
          name: e instanceof Error ? e.name : "unknown",
          fastPath: fetchOptions?.fastPath ?? false,
          retriesUsed: analyzeFastRetryRef.current,
        });
        setError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        // Always clear loading — even if a second analysis started,
        // leaving the spinner forever is worse than a brief flash
        if (isLegToggle) {
          setLegToggleBusy(false);
        } else {
          setLoading(false);
        }
      }
    },
    [paymentMode, enabledLegIds, planMode, expertOptions],
  );

  // Nuclear fallback: if loading hasn't cleared in 15s something is stuck — force it off
  useEffect(() => {
    if (!loading) return;
    const timer = window.setTimeout(() => {
      setLoading(false);
      if (!brief) setError("Search timed out — tap Analyze to try again.");
    }, 25_000);
    return () => window.clearTimeout(timer);
  }, [loading, brief]);

  const handleLegToggle = (legId: string): void => {
    if (!brief?.flightLegs || !prompt.trim()) return;
    const toggled = toggleLegEnabled(brief.flightLegs, legId);
    const nextIds = toggled.filter((leg) => leg.enabled).map((leg) => leg.id);
    setEnabledLegIds(nextIds);
    void fetchStrategies(prompt, comfortWeight, undefined, nextIds);
  };

  const handleReset = (): void => {
    setBrief(null);
    setStaysData(null);
    setError(null);
    setHasAnalyzed(false);
    setInputPrompt("");
    setExpandedId(null);
    setCounterfactualNote(null);
    setEnabledLegIds([]);
    setPaymentMode("cash");
    setPlanMode("flights");
  };

  const handlePlanModeChange = (mode: PlanMode): void => {
    setPlanMode(mode);
    if (prompt.trim()) void fetchStrategies(prompt, comfortWeight, undefined, undefined, mode);
  };

  const handleExpertApply = (): void => {
    if (prompt.trim()) void fetchStrategies(prompt, comfortWeight);
  };

  const candidateOrigins =
    brief?.intent.originAirports?.map((code) => code.toUpperCase()) ??
    brief?.searchAirports ??
    [];
  const pointsPrograms = [
    ...(brief?.intent.loyaltyPrograms ?? []),
    "Alaska Mileage Plan",
    "Amex Membership Rewards",
    "Chase Ultimate Rewards",
  ].filter((value, index, array) => array.indexOf(value) === index);

  const visibleStrategies = brief
    ? brief.planMode === "flights"
      ? filterStrategiesByPaymentMode(brief.strategyCatalog ?? brief.strategies, paymentMode)
      : brief.strategies
    : [];

  const inputPlaceholder =
    planMode === "flights" ? INPUT_PLACEHOLDER_FLIGHTS : expertPlaceholder(planMode);

  const handlePaymentModeChange = (mode: PaymentMode): void => {
    setPaymentMode(mode);
    if (!brief) return;
    const next = filterStrategiesByPaymentMode(brief.strategyCatalog ?? brief.strategies, mode);
    if (next[0]) setExpandedId(next[0].id);
  };

  // Stays — hotels and full modes (flights-only skips hotel search)
  useEffect(() => {
    if (!brief || brief.planMode === "flights") return;
    let cancelled = false;
    setStaysLoading(true);
    setStaysData(null);
    setSelectedStayId(null);
    void fetchWithTimeout(
      "/api/decision/stays",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: brief.intent.rawPrompt }),
      },
      STAYS_TIMEOUT_MS,
      "Hotel estimates took too long.",
    )
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: StaysResponse) => {
        if (cancelled) return;
        setStaysData(data);
        const pick = data.stays.find((stay) => stay.kepiPick);
        if (pick) setSelectedStayId(pick.quote.id);
      })
      .catch(() => {
        if (!cancelled && brief) {
          setStaysData({
            configured: false,
            stays: [],
            error: "Couldn't load hotels fast enough — strategies are ready, and you can refresh hotels later.",
            intent: {
              destination: brief.intent.destination,
              nights: brief.intent.nights,
              startDate: brief.intent.startDate,
              endDate: brief.intent.endDate,
            },
          });
        }
      })
      .finally(() => {
        if (!cancelled) setStaysLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only when a new analysis lands
  }, [brief?.intent.rawPrompt, brief?.intent.startDate]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!inputPrompt.trim()) {
      setRecordOpen(true);
      return;
    }
    if (!isSignedIn) {
      setError("Sign in to analyze your trip — your recording is saved in the box below.");
      return;
    }
    setPrompt(inputPrompt);
    setCounterfactualNote(null);
    void fetchStrategies(inputPrompt, comfortWeight);
  };

  const openWalkthroughFromResponse = useCallback(
    (data: {
      activation: {
        tripName: string;
        redirectPath: string;
        verifiedLegCount: number;
        totalBookableLegs: number;
        alignmentLegs: AlignmentLeg[];
      };
      alignment?: { legs: AlignmentLeg[] };
      strategyTitle?: string;
    }) => {
      setWalkthroughData({
        tripName: data.activation.tripName,
        strategyTitle: data.strategyTitle ?? "Your play",
        legs: data.alignment?.legs ?? data.activation.alignmentLegs ?? [],
        verifiedLegCount: data.activation.verifiedLegCount,
        totalBookableLegs: data.activation.totalBookableLegs,
        redirectPath: data.activation.redirectPath,
      });
      setWalkthroughOpen(true);
    },
    [],
  );

  const activateTripDirect = useCallback(
    async (payload: PendingActivate) => {
      setActivatingId(payload.strategyId);
      setError(null);
      try {
        const res = await fetch("/api/decision/activate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: payload.prompt,
            strategyId: payload.strategyId,
            planMode,
            paymentMode,
            enabledLegIds: enabledLegIds.length > 0 ? enabledLegIds : undefined,
            ...(payload.stays && payload.stays.length > 0 ? { stays: payload.stays } : {}),
          }),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(typeof errBody?.error === "string" ? errBody.error : "Activation failed");
        }
        const data = await res.json();
        openWalkthroughFromResponse(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Activation failed");
      } finally {
        setActivatingId(null);
      }
    },
    [enabledLegIds, openWalkthroughFromResponse, paymentMode, planMode],
  );

  const handleRecordTrip = useCallback(
    (recordedPrompt: string) => {
      setRecordOpen(false);
      setInputPrompt(recordedPrompt);
      setPrompt(recordedPrompt);
      setCounterfactualNote(null);
      if (!isSignedIn) {
        setError("Sign in to build your plan — your trip description is ready to go.");
        return;
      }
      void fetchStrategies(recordedPrompt, comfortWeight);
    },
    [comfortWeight, fetchStrategies, isSignedIn],
  );

  const handleComfortChange = (value: number) => {
    setComfortWeight(value);
    if (brief && prompt.trim()) void fetchStrategies(prompt, value);
  };

  const loadFlexOptions = useCallback(
    async (strategyId: string) => {
      setFlexStrategyId(strategyId);
      setFlexOpen(true);
      setFlexLoading(true);
      setFlexError(null);
      setFlexData(null);
      try {
        const res = await fetchWithTimeout(
          "/api/decision/flex-options",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt,
              strategyId,
              comfortWeight,
              dateFlexDays: expertOptions.enabled ? expertOptions.dateFlexDays : undefined,
            }),
          },
          FLEX_TIMEOUT_MS,
          "Date comparison is taking too long. Try fewer date changes or retry.",
        );
        if (!res.ok) {
          throw new Error(res.status === 401 ? "Sign in to compare dates." : "Couldn't load date options.");
        }
        const data = (await res.json()) as { flex: StrategyFlexOptionsResult };
        setFlexData(data.flex);
      } catch (e) {
        setFlexError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        setFlexLoading(false);
      }
    },
    [prompt, comfortWeight, expertOptions.dateFlexDays, expertOptions.enabled],
  );

  const handleVoiceMutation = useCallback(
    (mutation: CounterfactualMutation, utterance: string) => {
      setCounterfactualNote(`Heard: “${utterance}”`);
      void fetchStrategies(prompt, comfortWeight, mutation);
    },
    [prompt, comfortWeight, fetchStrategies],
  );

  const stopListening = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* already stopped */
    }
    setListening(false);
  }, []);

  const startListening = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any;
    const SpeechRecognitionImpl = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    if (!SpeechRecognitionImpl) {
      setTranscript("Voice isn't supported in this browser.");
      return;
    }
    const recognition = new SpeechRecognitionImpl();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const text = Array.from(event.results as ArrayLike<{ 0?: { transcript?: string } }>)
        .map((result) => result[0]?.transcript ?? "")
        .join("")
        .trim();
      setTranscript(text);
      const last = event.results[event.results.length - 1];
      if (last?.isFinal) {
        const mutation = parseVoiceMutation(text);
        if (mutation) handleVoiceMutation(mutation, text);
        else setTranscript(`“${text}” — try “leave a week earlier” or “prioritize comfort”`);
        stopListening();
      }
    };
    recognition.onerror = () => stopListening();
    recognition.onend = () => setListening(false);
    setListening(true);
    recognition.start();
  }, [handleVoiceMutation, stopListening]);

  const handleQuestionAnswer = async (question: DecisionQuestion, optionId: string) => {
    const option = question.options.find((opt) => opt.id === optionId);
    if (option?.genomeOverride) {
      await fetch("/api/traveler/genome", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "correct",
          correction: { override: option.genomeOverride, context: question.prompt },
        }),
      }).catch(() => null);
    }
    if (question.id.startsWith("q-reposition")) {
      void fetchStrategies(prompt, comfortWeight, { willingToReposition: optionId === "yes" });
    }
  };

  const handleActivate = async (strategyId: string, staysOverride?: SelectedStayActivation[]) => {
    const strategy = brief?.strategies.find((item) => item.id === strategyId);
    const staysPayload =
      staysOverride ??
      (staysData && strategy?.segments.some((segment) => segment.mode === "hotel")
        ? collectSelectedStayPayloads(staysData, selectedStayByLeg)
        : []);

    const pending: PendingActivate = {
      prompt: prompt.trim() || inputPrompt.trim(),
      strategyId,
      ...(staysPayload.length > 0 ? { stays: staysPayload } : {}),
    };

    if (!pending.prompt) {
      setError("Describe your trip before activating.");
      return;
    }

    if (!isSignedIn) {
      sessionStorage.setItem(PENDING_ACTIVATE_KEY, JSON.stringify(pending));
      const returnTo = embedded ? "/?tab=plan" : window.location.pathname;
      router.push(`/sign-up?redirect_url=${encodeURIComponent(returnTo)}`);
      return;
    }
    setActivatingId(strategyId);
    setError(null);
    try {
      const res = await fetch("/api/decision/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          strategyId,
          planMode: brief?.planMode ?? planMode,
          paymentMode,
          enabledLegIds: enabledLegIds.length > 0 ? enabledLegIds : undefined,
          ...(staysPayload.length > 0 ? { stays: staysPayload } : {}),
        }),
      });
      if (res.status === 401) {
        sessionStorage.setItem(PENDING_ACTIVATE_KEY, JSON.stringify(pending));
        router.push(`/sign-up?redirect_url=${encodeURIComponent(embedded ? "/?tab=plan" : "/travel-assistant")}`);
        return;
      }
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const msg =
          typeof errBody?.error === "string"
            ? errBody.error
            : res.status === 401
              ? "Sign in to activate a trip."
              : "Activation failed — try again.";
        throw new Error(msg);
      }
      const data = await res.json();
      openWalkthroughFromResponse(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Activation failed");
    } finally {
      setActivatingId(null);
    }
  };

  useEffect(() => {
    if (!isSignedIn) return;
    const raw = sessionStorage.getItem(PENDING_ACTIVATE_KEY);
    if (!raw) return;
    try {
      const pending = JSON.parse(raw) as PendingActivate;
      sessionStorage.removeItem(PENDING_ACTIVATE_KEY);
      if (!pending.strategyId || !pending.prompt?.trim()) return;
      setPrompt(pending.prompt);
      setInputPrompt(pending.prompt);
      setHasAnalyzed(true);
      void activateTripDirect(pending);
    } catch {
      sessionStorage.removeItem(PENDING_ACTIVATE_KEY);
    }
  }, [isSignedIn, activateTripDirect]);

  const renderStayCarousel = (stays: RankedStay[], legKey: string) => (
    <div className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2">
      {stays.slice(0, 6).map((stay, stayIdx) => {
        const selected = selectedStayByLeg[legKey] === stay.quote.id;
        return (
          <button
            key={`${legKey}-${stay.quote.id}`}
            type="button"
            onClick={() =>
              setSelectedStayByLeg((current) => {
                const next = { ...current };
                if (current[legKey] === stay.quote.id) {
                  delete next[legKey];
                } else {
                  next[legKey] = stay.quote.id;
                }
                return next;
              })
            }
            className={`w-60 shrink-0 snap-start overflow-hidden rounded-3xl border text-left transition-all duration-300 ${
              selected
                ? "border-[#f4c95d] bg-[#1e3555] shadow-lg shadow-amber-950/25"
                : "border-slate-600 bg-[#152238] hover:border-slate-500 hover:bg-[#1a2d4a]"
            }`}
          >
            <div className="relative h-28 w-full">
              {stay.quote.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={stay.quote.photoUrl}
                  alt={stay.quote.name}
                  referrerPolicy="no-referrer"
                  className="h-28 w-full object-cover"
                />
              ) : (
                <div className="flex h-28 items-center justify-center bg-slate-800 text-3xl">
                  🏨
                </div>
              )}
              {stay.kepiPick && (
                <span className="absolute left-2 top-2 rounded-full bg-[#f4c95d] px-2 py-0.5 text-[9px] font-black uppercase text-[#0b1f3a]">
                  Kepi pick
                </span>
              )}
              {selected && (
                <span className="absolute bottom-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#f4c95d] text-xs font-black text-[#0b1f3a]">
                  ✓
                </span>
              )}
            </div>
            <div className="px-3.5 py-3">
              <p className="truncate text-sm font-bold text-white">{stay.quote.name}</p>
              <p className="mt-0.5 truncate text-[11px] text-slate-400">{stay.whyLine}</p>
              <p className="mt-2 text-base font-black text-white">
                ${Math.round(stay.quote.nightlyUsd).toLocaleString()}
                <span className="text-[10px] font-bold text-slate-400"> /night</span>
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );

  const live = brief?.livePricing;
  const bestLiveFare = live?.bestOffer?.amount ?? null;

  const selectedStayPayloads = useMemo(
    () => (staysData ? collectSelectedStayPayloads(staysData, selectedStayByLeg) : []),
    [staysData, selectedStayByLeg],
  );
  const expandedStrategy = brief?.strategies.find((strategy) => strategy.id === expandedId) ?? null;
  const alignmentPreviewStrategy =
    expandedStrategy ?? (visibleStrategies.length > 0 ? visibleStrategies[0] : null);
  const alignmentPreviewLegs = useMemo(() => {
    if (!brief || !alignmentPreviewStrategy) return [];
    return buildAlignmentBoard(
      brief,
      alignmentPreviewStrategy,
      selectedStayPayloads.length > 0 ? selectedStayPayloads : null,
    );
  }, [brief, alignmentPreviewStrategy, selectedStayPayloads]);
  const hotelTotalUsd = selectedStayPayloads.reduce((sum, stay) => sum + stay.totalAmountUsd, 0);
  const tripTotal =
    hotelTotalUsd > 0 && expandedStrategy
      ? Math.round(expandedStrategy.scores.trueOutOfPocket + hotelTotalUsd)
      : null;

  return (
    <div className={embedded ? "bg-[#0b1f3a] text-white" : "min-h-screen bg-[#0b1f3a] text-white"}>
      <style>{`@keyframes deckRise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
@keyframes deckPulse{0%,100%{opacity:1}50%{opacity:0.45}}`}</style>
      {/* Ambient depth — same vignette family as the Airport Navigator */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(90% 60% at 50% 0%, rgba(244,201,93,0.07), transparent 60%), radial-gradient(120% 90% at 50% 110%, rgba(2,8,20,0.7), transparent 55%)",
        }}
      />

      {!embedded ? (
      <header className="relative z-10 border-b border-slate-700 px-5 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#f4c95d]">
              Kepi · Decision Engine
            </p>
            <h1 className="text-xl font-black tracking-tight">Command Deck</h1>
          </div>
          <div className="flex items-center gap-2">
            {brief && (
              <button
                type="button"
                onClick={handleReset}
                className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-500/20 transition"
              >
                ↩ New trip
              </button>
            )}
            <Link
              href="/travel-assistant"
              className="rounded-xl border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-700"
            >
              My trips →
            </Link>
          </div>
        </div>
      </header>
      ) : null}

      <main className={`relative z-10 mx-auto max-w-3xl px-5 ${embedded ? "py-4 pb-8" : "py-6 pb-16"}`}>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-400">
            {planMode === "hotels"
              ? "Hotels mode — ranked stays per city. No flight search this session."
              : planMode === "full"
                ? "Full trip — flights, hotels, and status plays together."
                : "Flights mode — routes, open-jaw returns, cash/points/mix."}
          </p>
          <button
            type="button"
            onClick={() => setRecordOpen(true)}
            className="shrink-0 rounded-2xl border border-amber-400/60 bg-amber-500/20 px-4 py-2.5 text-sm font-black text-amber-100 transition-all hover:bg-amber-500/30"
          >
            🎙 Record my trip
          </button>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {(["flights", "hotels", "full"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => handlePlanModeChange(mode)}
              className={`rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wide transition ${
                planMode === mode
                  ? "bg-[#f4c95d] text-[#0b1f3a]"
                  : "border border-slate-600 bg-[#152238] text-slate-300 hover:border-slate-400"
              }`}
            >
              {mode === "flights" ? "Flights" : mode === "hotels" ? "Hotels" : "Full trip"}
            </button>
          ))}
        </div>

        {/* Intent input */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-2.5 sm:flex-row">
          <input
            id="trip-intent"
            value={inputPrompt}
            onChange={(event) => setInputPrompt(event.target.value)}
            placeholder={inputPlaceholder}
            className="flex-1 rounded-2xl border border-slate-500 bg-[#152238] px-4 py-3 text-base font-medium text-white placeholder:text-slate-400 focus:border-amber-400/70 focus:outline-none focus:ring-1 focus:ring-amber-400/40"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-2xl bg-[#f4c95d] px-6 py-3 text-sm font-black text-[#0b1f3a] transition-all hover:bg-[#ffe29a] disabled:opacity-60"
          >
            {loading ? "Analyzing…" : brief ? "🔄 Re-analyze" : "⚡ Analyze"}
          </button>
        </form>

        {/* Refinement chips — quick follow-ups when results are showing */}
        {brief && !loading && (
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              { label: "💰 Cash only", action: () => handlePaymentModeChange("cash") },
              { label: "🏆 Points play", action: () => handlePaymentModeChange("points") },
              { label: "🏨 Add hotels", action: () => handlePlanModeChange("full") },
              { label: "📅 Try different dates", action: () => { setInputPrompt((p) => p + " — try flexible dates"); } },
              { label: "✈️ Direct flights only", action: () => { setInputPrompt((p) => p + " direct only"); void fetchStrategies((prompt + " direct only"), comfortWeight); } },
            ].map(({ label, action }) => (
              <button
                key={label}
                type="button"
                onClick={action}
                className="rounded-xl border border-slate-600 bg-slate-800/60 px-3 py-1.5 text-[11px] font-semibold text-slate-300 hover:border-amber-400/50 hover:text-amber-200 transition"
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Comfort ⇄ value steering — only after a trip is loaded */}
        {brief && (
        <div className="mt-4 rounded-2xl border border-slate-600 bg-[#152238] px-4 py-3">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-slate-400">
            <span>Save money</span>
            <span className="text-slate-200">Steering</span>
            <span>Max comfort</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(comfortWeight * 100)}
            onChange={(event) => handleComfortChange(Number(event.target.value) / 100)}
            className="mt-2 w-full accent-[#f4c95d]"
            aria-label="Balance between saving money and comfort"
          />
        </div>
        )}

        {brief && brief.planMode !== "hotels" && (
          <ExpertDeckPanel
            enabled={Boolean(expertOptions.enabled)}
            onToggle={(enabled) => setExpertOptions((current) => ({ ...current, enabled }))}
            options={expertOptions}
            onChange={setExpertOptions}
            searchAirports={brief.searchAirports}
            candidateOrigins={candidateOrigins}
            flightLegs={brief.flightLegs}
            pointsPrograms={pointsPrograms}
            onApply={handleExpertApply}
            busy={loading || legToggleBusy}
          />
        )}

        {brief && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setRefineOpen((open) => !open)}
              className="text-xs font-bold text-slate-400 hover:text-slate-200"
            >
              {refineOpen ? "▾ Hide refinements" : "▸ Refine ranking (voice)"}
            </button>
            {refineOpen && (
        <div className="mt-2 flex items-center gap-3 rounded-2xl border border-slate-600 bg-[#152238] px-3 py-2.5">
          <button
            type="button"
            onClick={listening ? stopListening : startListening}
            disabled={loading}
            aria-label={listening ? "Stop listening" : "Ask a what-if by voice"}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base transition-all ${
              listening ? "bg-[#f4c95d] text-[#0b1f3a]" : "border border-slate-500 bg-slate-700 text-white hover:bg-slate-600"
            }`}
            style={listening ? { animation: "deckPulse 1.2s ease-in-out infinite" } : undefined}
          >
            🎙
          </button>
          <p className="min-h-5 flex-1 truncate text-xs font-medium text-slate-300">
            {transcript || "Ask a what-if: “leave a week earlier” · “prioritize comfort” · “direct only”"}
          </p>
        </div>
            )}
          </div>
        )}

        {clarification && !loading && (
          <div className="mt-4 rounded-3xl border border-amber-400/30 bg-gradient-to-br from-amber-950/30 to-[#152238] px-5 py-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">One more thing</p>
            <p className="mt-2 text-lg font-bold text-white">{clarification.message}</p>
            <p className="mt-1 text-sm text-slate-400">{clarification.hint}</p>
            <div className="mt-4 flex gap-2">
              <input
                type="text"
                placeholder="Type your answer…"
                className="flex-1 rounded-2xl border border-slate-600 bg-slate-800 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-amber-400/60 focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.currentTarget.value.trim()) {
                    const answer = e.currentTarget.value.trim();
                    const refined = (prompt + " " + answer).trim();
                    setInputPrompt(refined);
                    setClarification(null);
                    void fetchStrategies(refined, comfortWeight);
                  }
                }}
                autoFocus
              />
              <button
                type="button"
                onClick={(ev) => {
                  const inp = ev.currentTarget.previousElementSibling as HTMLInputElement;
                  if (inp?.value.trim()) {
                    const refined = (prompt + " " + inp.value.trim()).trim();
                    setInputPrompt(refined);
                    setClarification(null);
                    void fetchStrategies(refined, comfortWeight);
                  }
                }}
                className="rounded-2xl bg-amber-400 px-5 py-3 font-bold text-[#0b1f3a] active:opacity-80"
              >
                Go
              </button>
            </div>
          </div>
        )}

        {!hasAnalyzed && !loading && !clarification && (
          <div className="mt-6 rounded-3xl bg-gradient-to-br from-[#152238] via-[#0f1d35] to-[#152238] border border-slate-700 px-6 py-8">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#f4c95d]">Your personal trip guru</p>
            <p className="mt-2 text-xl font-black text-white">Where are we going?</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Tell me your trip in plain English — destination, dates, who&apos;s going, and what matters to you. I&apos;ll find the smartest way to get there.
            </p>
            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[
                "Fly from Beaumont CA to New York on Sept 1st, back Sept 10",
                "Family of 4 to Hawaii in December, budget-friendly",
                "Business trip LAX to Chicago next Tuesday",
                "Europe for 2 weeks in June — open to routing through London",
              ].map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => { setInputPrompt(example); }}
                  className="rounded-2xl border border-slate-600 bg-slate-800/60 px-4 py-3 text-left text-xs text-slate-300 hover:border-amber-400/50 hover:text-white transition"
                >
                  <span className="text-[#f4c95d]">→</span> {example}
                </button>
              ))}
            </div>
            {!isSignedIn && (
              <p className="mt-5 text-xs text-slate-500">Sign in to analyze and book — planning is always free.</p>
            )}
          </div>
        )}

        {/* Live pricing strip — real Duffel fares, honestly labeled */}
        {brief && live && (
          <div
            className={`mt-3 flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-semibold ${
              live.configured && live.bestOffer
                ? "border border-emerald-600/50 bg-emerald-950/70 text-emerald-100"
                : "border border-slate-600 bg-[#152238] text-slate-300"
            }`}
          >
            <span className={live.configured && live.bestOffer ? "animate-pulse" : ""}>●</span>
            {live.configured && live.bestOffer ? (
              <span>
                Live fares — out ${Math.round(live.bestOffer.amount).toLocaleString()} {live.bestOffer.airline}{" "}
                {live.bestOffer.origin}→{live.bestOffer.destination}
                {live.returnOffer ? (
                  <>
                    {" "}
                    · return ${Math.round(live.returnOffer.amount).toLocaleString()} {live.returnOffer.airline}{" "}
                    {live.returnOffer.origin}→{live.returnOffer.destination}
                  </>
                ) : null}
                {live.roundTripTotalUsd ? (
                  <> · RT ${Math.round(live.roundTripTotalUsd).toLocaleString()}</>
                ) : null}
              </span>
            ) : (
              <span>{live.message ?? "Live pricing unavailable — showing modeled estimates."}</span>
            )}
          </div>
        )}

        {counterfactualNote && (
          <p className="mt-3 rounded-xl border border-amber-600/30 bg-amber-950/40 px-3 py-2 text-xs font-bold text-amber-100">
            {counterfactualNote}
          </p>
        )}
        {error && (
          <p className="mt-3 rounded-xl border border-red-600/40 bg-red-950/50 px-3 py-2 text-xs font-bold text-red-100">{error}</p>
        )}

        {/* One-tap re-ranking questions */}
        {brief && brief.questions.length > 0 && (
          <div className="mt-5 space-y-2.5">
            {brief.questions.map((question) => (
              <div key={question.id} className="rounded-2xl border border-slate-600 bg-[#152238] px-4 py-3">
                <p className="text-sm font-bold text-white">{question.prompt}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {question.stakes}
                  {question.flipsRanking && <span className="text-amber-200"> · could change the winner</span>}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {question.options.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => void handleQuestionAnswer(question, option.id)}
                      className="rounded-xl border border-slate-500 bg-slate-700 px-3 py-1.5 text-xs font-bold text-slate-100 transition-all hover:border-amber-400 hover:bg-[#f4c95d] hover:text-[#0b1f3a]"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Inferred summary — Kepi shows its homework */}
        {brief && (
          <>
            {brief.originRequired && (
              <div className="mt-4 rounded-2xl border border-amber-500/60 bg-amber-950/40 px-4 py-3 text-sm leading-relaxed text-amber-100">
                Name your departure airport (e.g. London Heathrow, JFK) — Kepi won&apos;t assume US West Coast.
              </div>
            )}
            <TripItinerarySummary intent={brief.intent} />
            {brief.flightLegs && brief.flightLegs.length > 0 && brief.planMode !== "hotels" ? (
              <div className="mt-4 rounded-2xl border border-slate-600 bg-[#152238] px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Flight legs</p>
                <p className="mt-1 text-xs text-slate-400">
                  Tap optional legs to search city-to-city flights. Long-haul legs always on.
                  {legToggleBusy ? " Updating fares…" : ""}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {brief.flightLegs.map((leg) => {
                    const chip = (
                      <span
                        className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${
                          leg.enabled
                            ? "border border-emerald-500/50 bg-emerald-950/50 text-emerald-100"
                            : "border border-dashed border-slate-600 bg-slate-800/80 text-slate-400"
                        }`}
                      >
                        {leg.fromLabel} → {leg.toLabel}
                        {leg.optional ? (leg.enabled ? " · on" : " · off") : ""}
                      </span>
                    );
                    if (!leg.optional) {
                      return <span key={leg.id}>{chip}</span>;
                    }
                    return (
                      <button
                        key={leg.id}
                        type="button"
                        disabled={legToggleBusy || loading}
                        onClick={() => handleLegToggle(leg.id)}
                        className="text-left disabled:opacity-60"
                        title={leg.loyaltyNote ?? "Toggle this connector leg"}
                      >
                        {chip}
                      </button>
                    );
                  })}
                </div>
                {brief.flightLegs.some((leg) => leg.loyaltyNote) ? (
                  <p className="mt-3 text-xs leading-relaxed text-amber-200/90">
                    {brief.flightLegs.find((leg) => leg.loyaltyNote)?.loyaltyNote}
                  </p>
                ) : null}
              </div>
            ) : null}
            <p className="mt-5 text-xs leading-relaxed text-slate-400">
              <span className="font-bold text-slate-200">Kepi inferred:</span> {brief.inferredSummary}
            </p>
          </>
        )}

        {brief?.topologySearch && !loading ? (
          <TopologyWaveHero search={brief.topologySearch} />
        ) : null}

        {brief?.fusedFlightSearch && brief.planMode !== "hotels" && !loading ? (
          <FusedFlightHero search={brief.fusedFlightSearch} />
        ) : null}

        {brief && alignmentPreviewLegs.length > 0 && !loading && (
          <div className="mt-5">
            <TripAlignmentBoard
              legs={alignmentPreviewLegs}
              strategyTitle={alignmentPreviewStrategy?.title}
            />
            <p className="mt-2 text-center text-[10px] leading-relaxed text-slate-500">
              Green = live quote · Amber = estimate · Slate = skip · Save plan to open booking links
            </p>
          </div>
        )}

        {/* Strategies */}
        {brief && brief.planMode === "hotels" && (
          <p className="mt-5 rounded-2xl border border-slate-600 bg-[#152238] px-4 py-3 text-xs leading-relaxed text-slate-300">
            <span className="font-bold text-slate-100">Hotels only:</span> pick a property below, then save
            your stay plan. Switch to Flights or Full trip when you&apos;re ready to route airfare.
          </p>
        )}
        {brief && brief.planMode === "flights" && (
          <p className="mt-5 rounded-2xl border border-slate-600 bg-[#152238] px-4 py-3 text-xs leading-relaxed text-slate-300">
            <span className="font-bold text-slate-100">Flights only:</span> pick cash, points, or mix — up to 3
            plays. {paymentModeDescription(paymentMode)}
          </p>
        )}
        {brief && brief.planMode === "flights" && (
          <div className="mt-3 flex flex-wrap gap-2">
            {(["cash", "points", "mix"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => handlePaymentModeChange(mode)}
                className={`rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wide transition ${
                  paymentMode === mode
                    ? "bg-[#f4c95d] text-[#0b1f3a]"
                    : "border border-slate-600 bg-[#152238] text-slate-300 hover:border-slate-400"
                }`}
              >
                {mode === "cash" ? "Cash" : mode === "points" ? "Points" : "Mix"}
              </button>
            ))}
          </div>
        )}
        {brief && brief.planMode !== "flights" && (
          <p className="mt-5 rounded-2xl border border-slate-600 bg-[#152238] px-4 py-3 text-xs leading-relaxed text-slate-300">
            <span className="font-bold text-slate-100">Ranked by value:</span> #1 is the lowest total
            trip cost (cash + points at your ¢/pt).{" "}
            <span className="font-semibold text-amber-200">Best value</span> = cheapest overall.{" "}
            <span className="font-semibold text-sky-200">Status pick</span> = worth a bit more when requal and
            lounge benefits matter to you.
          </p>
        )}
        <div className="mt-4 space-y-3">
          {loading && !legToggleBusy && (
            <div>
              <AnalyzeProgressPanel planMode={planMode} stepIndex={analyzeStep} />
              <button
                type="button"
                onClick={() => { setLoading(false); setError("Search cancelled — tap Analyze to try again."); }}
                className="mt-3 w-full rounded-2xl border border-slate-600 bg-slate-800 py-2.5 text-sm font-semibold text-slate-300 active:opacity-70"
              >
                Cancel
              </button>
            </div>
          )}
          {legToggleBusy && (
            <div className="rounded-3xl border border-slate-600 bg-[#152238] p-6 text-center">
              <p
                className="text-sm font-bold text-slate-300"
                style={{ animation: "deckPulse 1.4s ease-in-out infinite" }}
              >
                Updating connector fares…
              </p>
            </div>
          )}
          {!loading && visibleStrategies.length === 0 && brief && brief.planMode !== "hotels" && (
            <p className="rounded-2xl border border-slate-600 bg-[#152238] px-4 py-3 text-xs text-slate-300">
              No strategies yet — add your departure airport if missing.
            </p>
          )}
          {visibleStrategies.map((strategy, index) => (
            <StrategyCard
              key={strategy.id}
              strategy={strategy}
              rank={index + 1}
              index={index}
              expanded={expandedId === strategy.id}
              activating={activatingId === strategy.id}
              compareLoading={flexLoading && flexStrategyId === strategy.id}
              bestLiveFare={bestLiveFare}
              liveConfigured={Boolean(live?.configured && live.quotesFound > 0)}
              expertMode={Boolean(expertOptions.enabled)}
              hideCompareDates={strategy.id === "hotels-only"}
              onToggle={() => setExpandedId((current) => (current === strategy.id ? null : strategy.id))}
              onActivate={() => void handleActivate(strategy.id)}
              onCompareDates={() => void loadFlexOptions(strategy.id)}
            />
          ))}
        </div>

        <StrategyFlexModal
          open={flexOpen}
          loading={flexLoading}
          error={flexError}
          data={flexData}
          onClose={() => setFlexOpen(false)}
        />

        {/* Where you'll sleep — Kepi already checked, ranked to your genome */}
        {(brief?.planMode === "hotels" ||
          brief?.planMode === "full") &&
          (staysLoading ||
          (staysData && staysData.stays.length > 0) ||
          staysData?.error ||
          staysData?.notice) && (
          <section className={`${brief?.planMode === "hotels" ? "mt-5" : "mt-8"}`}>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-black uppercase tracking-widest text-slate-200">
                Where you&apos;ll sleep
              </h2>
              <div className="flex shrink-0 items-center gap-2">
                {staysData?.source === "estimated" && (
                  <span className="rounded-full border border-amber-500/50 bg-amber-950/60 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-100">
                    Estimated rates
                  </span>
                )}
                {staysData && staysData.stays.length > 0 && (
                  <span className="text-[10px] font-semibold text-slate-400">
                    {staysData.intent.nights} nights · {staysData.intent.startDate.slice(5)} →{" "}
                    {staysData.intent.endDate.slice(5)}
                  </span>
                )}
              </div>
            </div>

            {staysLoading && (
              <div className="mt-3 rounded-3xl border border-slate-600 bg-[#152238] p-6 text-center">
                <p className="text-xs font-bold text-slate-300" style={{ animation: "deckPulse 1.4s ease-in-out infinite" }}>
                  Kepi is already checking hotels near {brief?.intent.destination} for your dates…
                </p>
              </div>
            )}

            {!staysLoading && staysData?.notice && (
              <p className="mt-3 rounded-2xl border border-amber-600/40 bg-amber-950/50 px-4 py-3 text-xs font-semibold text-amber-100">
                {staysData.notice}
              </p>
            )}

            {!staysLoading && staysData?.error && staysData.stays.length === 0 && !staysData.notice && (
              <p className="mt-3 rounded-2xl border border-slate-600 bg-[#152238] px-4 py-3 text-xs font-semibold text-slate-300">
                {typeof staysData.error === "string" ? staysData.error : "Hotel search unavailable right now."}
              </p>
            )}

            {!staysLoading && staysData?.stopLegs && staysData.stopLegs.length > 0 && (
              <div className="mt-4 space-y-6">
                {staysData.stopLegs.map((leg) => (
                  <div key={`${leg.stopName}-${leg.checkInDate}`}>
                    <p className="mb-2 text-xs font-bold text-slate-200">
                      {leg.stopName} · {leg.nights} nights · {leg.checkInDate.slice(5)} → {leg.checkOutDate.slice(5)}
                    </p>
                    {leg.stays.length > 0 ? (
                      renderStayCarousel(leg.stays, stayLegKey(leg))
                    ) : (
                      <p className="text-xs text-slate-400">No hotels found for {leg.stopName}.</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!staysLoading && staysData && !staysData.stopLegs?.length && staysData.stays.length > 0 && (
              <div className="mt-3">
                {renderStayCarousel(staysData.stays, "default")}
              </div>
            )}
          </section>
        )}

        {/* Fused trip total — flight strategy + stay, one honest number */}
        {tripTotal !== null && selectedStayPayloads.length > 0 && expandedStrategy && (
          <div className="sticky bottom-4 z-20 mt-6">
            <div className="flex items-center justify-between gap-3 rounded-3xl border border-amber-400/60 bg-[#0b1f3a] px-5 py-3.5 shadow-xl">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-200">Trip total</p>
                <p className="truncate text-[11px] font-semibold text-slate-300">
                  {expandedStrategy.title}
                  {selectedStayPayloads.length === 1
                    ? ` + ${staysData?.intent.nights} nights ${selectedStayPayloads[0]?.name ?? ""}`
                    : ` + ${selectedStayPayloads.length} hotel stays · ${staysData?.intent.nights} nights total`}
                </p>
              </div>
              <p className="shrink-0 text-2xl font-black tabular-nums text-white">
                ${tripTotal.toLocaleString()}
              </p>
            </div>
          </div>
        )}

        {/* Genome footer */}
        {brief && (
          <p className="mt-6 text-center text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            Tuned to your traveler genome · {brief.genomeSnapshot.homeRegion} · trip #{brief.genomeSnapshot.tripCount + 1}
          </p>
        )}
      </main>

      <RecordTripModal
        open={recordOpen}
        loading={loading}
        onClose={() => setRecordOpen(false)}
        onSubmit={handleRecordTrip}
      />

      {walkthroughData ? (
        <BookingWalkthroughModal
          open={walkthroughOpen}
          tripName={walkthroughData.tripName}
          strategyTitle={walkthroughData.strategyTitle}
          legs={walkthroughData.legs}
          verifiedLegCount={walkthroughData.verifiedLegCount}
          totalBookableLegs={walkthroughData.totalBookableLegs}
          forwardAddress={forwardAddress}
          onClose={() => setWalkthroughOpen(false)}
          onGoToTrip={() => {
            setWalkthroughOpen(false);
            router.push(walkthroughData.redirectPath);
          }}
        />
      ) : null}
    </div>
  );
}
