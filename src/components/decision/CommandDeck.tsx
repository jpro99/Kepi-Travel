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

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import type {
  CounterfactualMutation,
  DecisionBrief,
  DecisionQuestion,
  TravelStrategy,
} from "@/lib/decision/types";
import type { RankedStay } from "@/lib/decision/stayRanking";

interface StaysResponse {
  configured: boolean;
  error?: string;
  intent: { destination: string; nights: number; startDate: string; endDate: string };
  stays: RankedStay[];
}

const DEFAULT_PROMPT = "I want to go to Italy in September";

const SEGMENT_ICON: Record<string, string> = {
  flight: "✈️",
  hotel: "🏨",
  drive: "🚗",
  train: "🚆",
};

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
        <span className="text-[7px] font-bold uppercase tracking-widest text-white/50">TVS</span>
      </div>
    </div>
  );
}

/* ── Strategy card ──────────────────────────────────────────────────────── */
function StrategyCard({
  strategy,
  rank,
  index,
  expanded,
  activating,
  bestLiveFare,
  onToggle,
  onActivate,
}: {
  strategy: TravelStrategy;
  rank: number;
  index: number;
  expanded: boolean;
  activating: boolean;
  bestLiveFare: number | null;
  onToggle: () => void;
  onActivate: () => void;
}) {
  const gold = strategy.recommended;
  const savesVsWalkUp =
    bestLiveFare !== null && bestLiveFare > strategy.scores.trueOutOfPocket
      ? Math.round(bestLiveFare - strategy.scores.trueOutOfPocket)
      : null;

  return (
    <article
      className={`overflow-hidden rounded-3xl border backdrop-blur transition-all duration-300 ${
        gold
          ? "border-[#f4c95d]/60 bg-gradient-to-br from-[#f4c95d]/10 via-white/[0.04] to-transparent shadow-[0_8px_32px_rgba(244,201,93,0.12)]"
          : "border-white/10 bg-white/[0.04] hover:border-white/20"
      }`}
      style={{ animation: `deckRise 0.45s ease-out both`, animationDelay: `${index * 90}ms` }}
    >
      <button type="button" className="w-full px-5 py-4 text-left" onClick={onToggle}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              {gold && (
                <span className="rounded-full bg-[#f4c95d] px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#0b1f3a]">
                  ★ Kepi&apos;s pick
                </span>
              )}
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                #{rank} · {strategy.kind.replace(/_/g, " ")}
              </span>
            </div>
            <h3 className="text-lg font-bold tracking-tight text-white">{strategy.title}</h3>
            <p className="mt-0.5 text-sm font-medium text-sky-100/90">{strategy.headline}</p>
          </div>
          <TvsDial value={strategy.scores.tvs} gold={gold} />
        </div>

        <p className="mt-3 text-sm leading-relaxed text-white/60">{strategy.reasoning}</p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="rounded-lg bg-white/8 px-2 py-1 text-[11px] font-bold text-white/85">
            ${strategy.scores.trueOutOfPocket.toLocaleString()} true cost
          </span>
          <span className="rounded-lg bg-white/8 px-2 py-1 text-[11px] font-semibold text-white/70">
            {strategy.scores.frictionMinutes}m friction
          </span>
          {strategy.segments.find((seg) => seg.cpp) && (
            <span className="rounded-lg bg-white/8 px-2 py-1 text-[11px] font-semibold text-white/70">
              {strategy.segments.find((seg) => seg.cpp)?.cpp}¢/mi redemption
            </span>
          )}
          {savesVsWalkUp !== null && savesVsWalkUp > 0 && (
            <span className="rounded-lg bg-emerald-400/15 px-2 py-1 text-[11px] font-bold text-emerald-300">
              saves ${savesVsWalkUp.toLocaleString()} vs live fare
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-white/10 px-5 pb-5 pt-4">
          {/* Segment timeline */}
          <ol className="space-y-0">
            {strategy.segments.map((seg, segIdx) => (
              <li key={`${seg.label}-${segIdx}`} className="relative flex gap-3 pb-4 last:pb-0">
                {segIdx < strategy.segments.length - 1 && (
                  <span className="absolute left-[13px] top-7 h-full w-px bg-gradient-to-b from-[#f4c95d]/50 to-transparent" />
                )}
                <span className="z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm">
                  {SEGMENT_ICON[seg.mode] ?? "•"}
                </span>
                <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">{seg.label}</p>
                    <p className="text-xs text-white/55">{seg.detail}</p>
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-white/80">
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
                <li key={inst.instrumentId} className="flex items-start gap-2 text-xs text-white/75">
                  <span className={inst.optimal ? "text-emerald-400" : "text-white/40"}>
                    {inst.optimal ? "✓" : "○"}
                  </span>
                  <span>
                    {inst.label}
                    <span className="text-white/45"> · ${inst.valueUsd} value</span>
                    {inst.warning && <span className="text-amber-300/90"> — {inst.warning}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* Pre-crime warnings — Kepi tells you what goes wrong BEFORE it does */}
          {strategy.preCrimeWarnings.map((warning) => (
            <p
              key={warning}
              className="mt-3 flex items-start gap-2 rounded-xl bg-amber-400/10 px-3 py-2 text-xs leading-relaxed text-amber-200"
            >
              <span className="mt-px shrink-0">⚠</span>
              {warning}
            </p>
          ))}

          <button
            type="button"
            onClick={onActivate}
            disabled={activating}
            className={`mt-4 w-full rounded-2xl py-3 text-sm font-black tracking-wide transition-all ${
              gold
                ? "bg-[#f4c95d] text-[#0b1f3a] hover:bg-[#ffe29a] disabled:opacity-60"
                : "bg-white/10 text-white hover:bg-white/15 disabled:opacity-60"
            }`}
          >
            {activating ? "Building your trip…" : "Activate this strategy →"}
          </button>
        </div>
      )}
    </article>
  );
}

const PENDING_ACTIVATE_KEY = "kepi:pendingActivate";

/* ── Command Deck ───────────────────────────────────────────────────────── */
export function CommandDeck({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [inputPrompt, setInputPrompt] = useState(DEFAULT_PROMPT);
  const [brief, setBrief] = useState<DecisionBrief | null>(null);
  const [comfortWeight, setComfortWeight] = useState(0.55);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [counterfactualNote, setCounterfactualNote] = useState<string | null>(null);

  // Stays — load unasked, the moment strategies exist (godlike mode)
  const [staysData, setStaysData] = useState<StaysResponse | null>(null);
  const [staysLoading, setStaysLoading] = useState(false);
  const [selectedStayId, setSelectedStayId] = useState<string | null>(null);

  // Voice counterfactual bar
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const fetchStrategies = useCallback(
    async (nextPrompt: string, weight: number, mutation?: CounterfactualMutation) => {
      setLoading(true);
      setError(null);
      try {
        const endpoint = mutation ? "/api/decision/counterfactual" : "/api/decision/strategies";
        const body = mutation
          ? { prompt: nextPrompt, mutation: { ...mutation, priorityComfort: mutation.priorityComfort ?? weight } }
          : { prompt: nextPrompt, comfortWeight: weight };
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          throw new Error(res.status === 401 ? "Sign in to use the Command Deck." : "Couldn't analyze that trip — try again.");
        }
        const data = await res.json();
        setBrief(data.brief);
        if (mutation && data.counterfactual?.rankingChanged) {
          setCounterfactualNote("Ranking changed from your refinement ↑");
        } else if (mutation) {
          setCounterfactualNote("Scores updated — top pick holds.");
        }
        const top = data.brief?.strategies?.[0];
        if (top) setExpandedId(top.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void fetchStrategies(DEFAULT_PROMPT, 0.55);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, []);

  // The traveler never asks for hotels — Kepi already checked, ranked to
  // their genome, by the time they scroll down.
  useEffect(() => {
    if (!brief) return;
    let cancelled = false;
    setStaysLoading(true);
    setStaysData(null);
    setSelectedStayId(null);
    void fetch("/api/decision/stays", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: StaysResponse) => {
        if (cancelled) return;
        setStaysData(data);
        const pick = data.stays.find((stay) => stay.kepiPick);
        if (pick) setSelectedStayId(pick.quote.id);
      })
      .catch(() => {
        if (!cancelled) setStaysData(null);
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
    setPrompt(inputPrompt);
    setCounterfactualNote(null);
    void fetchStrategies(inputPrompt, comfortWeight);
  };

  const handleComfortChange = (value: number) => {
    setComfortWeight(value);
    if (brief) void fetchStrategies(prompt, value);
  };

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

  const handleActivate = async (strategyId: string) => {
    if (!isSignedIn) {
      sessionStorage.setItem(
        PENDING_ACTIVATE_KEY,
        JSON.stringify({ prompt, strategyId }),
      );
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
        body: JSON.stringify({ prompt, strategyId }),
      });
      if (res.status === 401) {
        sessionStorage.setItem(
          PENDING_ACTIVATE_KEY,
          JSON.stringify({ prompt, strategyId }),
        );
        router.push(`/sign-up?redirect_url=${encodeURIComponent(embedded ? "/?tab=plan" : "/travel-assistant")}`);
        return;
      }
      if (!res.ok) throw new Error("Activation failed — try again.");
      const data = await res.json();
      router.push(data.activation.redirectPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Activation failed");
      setActivatingId(null);
    }
  };

  const handleActivateRef = useRef(handleActivate);
  handleActivateRef.current = handleActivate;

  useEffect(() => {
    if (!isSignedIn) return;
    const raw = sessionStorage.getItem(PENDING_ACTIVATE_KEY);
    if (!raw) return;
    try {
      const pending = JSON.parse(raw) as { prompt?: string; strategyId?: string };
      sessionStorage.removeItem(PENDING_ACTIVATE_KEY);
      if (!pending.strategyId) return;
      const nextPrompt = pending.prompt?.trim() || DEFAULT_PROMPT;
      setPrompt(nextPrompt);
      setInputPrompt(nextPrompt);
      void fetchStrategies(nextPrompt, comfortWeight).finally(() => {
        void handleActivateRef.current(pending.strategyId!);
      });
    } catch {
      sessionStorage.removeItem(PENDING_ACTIVATE_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resume once after auth
  }, [isSignedIn]);

  const live = brief?.livePricing;
  const bestLiveFare = live?.bestOffer?.amount ?? null;

  const selectedStay = staysData?.stays.find((stay) => stay.quote.id === selectedStayId) ?? null;
  const expandedStrategy = brief?.strategies.find((strategy) => strategy.id === expandedId) ?? null;
  const tripTotal =
    selectedStay && expandedStrategy
      ? Math.round(expandedStrategy.scores.trueOutOfPocket + selectedStay.quote.totalAmountUsd)
      : null;

  return (
    <div className={embedded ? "text-white" : "min-h-screen bg-[#0b1f3a] text-white"}>
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
      <header className="relative z-10 border-b border-white/8 px-5 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#f4c95d]">
              Kepi · Decision Engine
            </p>
            <h1 className="text-xl font-black tracking-tight">Command Deck</h1>
          </div>
          <Link
            href="/travel-assistant"
            className="rounded-xl bg-white/8 px-3 py-1.5 text-xs font-bold text-white/80 hover:bg-white/15"
          >
            Travel Assistant →
          </Link>
        </div>
      </header>
      ) : null}

      <main className={`relative z-10 mx-auto max-w-3xl px-5 ${embedded ? "py-4 pb-8" : "py-6 pb-16"}`}>
        {/* Intent input */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-2.5 sm:flex-row">
          <input
            id="trip-intent"
            value={inputPrompt}
            onChange={(event) => setInputPrompt(event.target.value)}
            placeholder="Where to? — “Italy in September”"
            className="flex-1 rounded-2xl border border-white/12 bg-white/[0.06] px-4 py-3 text-base font-medium backdrop-blur placeholder:text-white/35 focus:border-[#f4c95d]/60 focus:outline-none focus:ring-1 focus:ring-[#f4c95d]/30"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-2xl bg-[#f4c95d] px-6 py-3 text-sm font-black text-[#0b1f3a] transition-all hover:bg-[#ffe29a] disabled:opacity-60"
          >
            {loading ? "Thinking…" : "⚡ Analyze"}
          </button>
        </form>

        {/* Comfort ⇄ value steering */}
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-white/50">
            <span>Save money</span>
            <span className="text-white/80">Steering</span>
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

        {/* Voice counterfactual bar */}
        <div className="mt-3 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5 backdrop-blur">
          <button
            type="button"
            onClick={listening ? stopListening : startListening}
            disabled={loading}
            aria-label={listening ? "Stop listening" : "Ask a what-if by voice"}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base transition-all ${
              listening ? "bg-[#f4c95d] text-[#0b1f3a]" : "bg-white/10 text-white hover:bg-white/15"
            }`}
            style={listening ? { animation: "deckPulse 1.2s ease-in-out infinite" } : undefined}
          >
            🎙
          </button>
          <p className="min-h-5 flex-1 truncate text-xs font-medium text-white/55">
            {transcript || "Ask a what-if: “leave a week earlier” · “prioritize comfort” · “direct only”"}
          </p>
        </div>

        {/* Live pricing strip — real Duffel fares, honestly labeled */}
        {live && (
          <div
            className={`mt-3 flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-semibold backdrop-blur ${
              live.configured && live.bestOffer
                ? "border border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
                : "border border-white/10 bg-white/[0.04] text-white/55"
            }`}
          >
            <span className={live.configured && live.bestOffer ? "animate-pulse" : ""}>●</span>
            {live.configured && live.bestOffer ? (
              <span>
                Live fares verified — best ${Math.round(live.bestOffer.amount).toLocaleString()}{" "}
                {live.bestOffer.airline} {live.bestOffer.stops === 0 ? "nonstop" : `(${live.bestOffer.stops} stop${live.bestOffer.stops > 1 ? "s" : ""})`}{" "}
                from {live.bestOffer.origin} · {live.quotesFound} routes checked
              </span>
            ) : (
              <span>{live.message ?? "Live pricing unavailable — showing modeled estimates."}</span>
            )}
          </div>
        )}

        {counterfactualNote && (
          <p className="mt-3 rounded-xl bg-[#f4c95d]/10 px-3 py-2 text-xs font-bold text-[#ffe29a]">
            {counterfactualNote}
          </p>
        )}
        {error && (
          <p className="mt-3 rounded-xl bg-red-500/15 px-3 py-2 text-xs font-bold text-red-200">{error}</p>
        )}

        {/* One-tap re-ranking questions */}
        {brief && brief.questions.length > 0 && (
          <div className="mt-5 space-y-2.5">
            {brief.questions.map((question) => (
              <div key={question.id} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur">
                <p className="text-sm font-bold text-white">{question.prompt}</p>
                <p className="mt-0.5 text-[11px] text-white/45">
                  {question.stakes}
                  {question.flipsRanking && <span className="text-[#f4c95d]"> · could change the winner</span>}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {question.options.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => void handleQuestionAnswer(question, option.id)}
                      className="rounded-xl bg-white/8 px-3 py-1.5 text-xs font-bold text-white/85 transition-all hover:bg-[#f4c95d] hover:text-[#0b1f3a]"
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
          <p className="mt-5 text-xs leading-relaxed text-white/45">
            <span className="font-bold text-white/65">Kepi inferred:</span> {brief.inferredSummary}
          </p>
        )}

        {/* Strategies */}
        <div className="mt-4 space-y-3">
          {loading && !brief && (
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center">
              <p className="text-sm font-bold text-white/60" style={{ animation: "deckPulse 1.4s ease-in-out infinite" }}>
                Running the math on every way to get you there…
              </p>
            </div>
          )}
          {brief?.strategies.map((strategy, index) => (
            <StrategyCard
              key={strategy.id}
              strategy={strategy}
              rank={index + 1}
              index={index}
              expanded={expandedId === strategy.id}
              activating={activatingId === strategy.id}
              bestLiveFare={bestLiveFare}
              onToggle={() => setExpandedId((current) => (current === strategy.id ? null : strategy.id))}
              onActivate={() => void handleActivate(strategy.id)}
            />
          ))}
        </div>

        {/* Where you'll sleep — Kepi already checked, ranked to your genome */}
        {(staysLoading || (staysData && staysData.stays.length > 0) || staysData?.error) && (
          <section className="mt-8">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-black uppercase tracking-widest text-white/80">
                Where you&apos;ll sleep
              </h2>
              {staysData && staysData.stays.length > 0 && (
                <span className="text-[10px] font-semibold text-white/40">
                  {staysData.intent.nights} nights · {staysData.intent.startDate.slice(5)} → {staysData.intent.endDate.slice(5)}
                </span>
              )}
            </div>

            {staysLoading && (
              <div className="mt-3 rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-center">
                <p className="text-xs font-bold text-white/55" style={{ animation: "deckPulse 1.4s ease-in-out infinite" }}>
                  Kepi is already checking hotels near {brief?.intent.destination} for your dates…
                </p>
              </div>
            )}

            {!staysLoading && staysData?.error && staysData.stays.length === 0 && (
              <p className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-xs font-semibold text-white/50">
                {staysData.error}
              </p>
            )}

            {!staysLoading && staysData && staysData.stays.length > 0 && (
              <div className="-mx-5 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2">
                {staysData.stays.slice(0, 8).map((stay, stayIdx) => {
                  const selected = stay.quote.id === selectedStayId;
                  return (
                    <button
                      key={stay.quote.id}
                      type="button"
                      onClick={() =>
                        setSelectedStayId((current) => (current === stay.quote.id ? null : stay.quote.id))
                      }
                      className={`w-60 shrink-0 snap-start overflow-hidden rounded-3xl border text-left backdrop-blur transition-all duration-300 ${
                        selected
                          ? "border-[#f4c95d] bg-[#f4c95d]/10 shadow-[0_8px_28px_rgba(244,201,93,0.18)]"
                          : "border-white/10 bg-white/[0.04] hover:border-white/25"
                      }`}
                      style={{ animation: "deckRise 0.45s ease-out both", animationDelay: `${stayIdx * 70}ms` }}
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
                          <div className="h-28 w-full bg-gradient-to-br from-[#1d3557] to-[#0b1f3a]" />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-[#0b1f3a]/80 to-transparent" />
                        {stay.kepiPick && (
                          <span className="absolute left-2 top-2 rounded-full bg-[#f4c95d] px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#0b1f3a]">
                            ★ Kepi&apos;s pick
                          </span>
                        )}
                        {stay.chainMatch && (
                          <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[9px] font-bold text-[#ffe29a] backdrop-blur">
                            Your {stay.chainMatch}
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
                        <p className="mt-0.5 truncate text-[11px] text-white/50">
                          {stay.quote.area ?? staysData.intent.destination} · {stay.whyLine}
                        </p>
                        <p className="mt-2 text-base font-black text-white">
                          ${Math.round(stay.quote.nightlyUsd).toLocaleString()}
                          <span className="text-[10px] font-bold text-white/45"> /night</span>
                          <span className="ml-2 text-[10px] font-semibold text-white/45">
                            ${Math.round(stay.quote.totalAmountUsd).toLocaleString()} total
                          </span>
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Fused trip total — flight strategy + stay, one honest number */}
        {tripTotal !== null && selectedStay && expandedStrategy && (
          <div className="sticky bottom-4 z-20 mt-6">
            <div className="flex items-center justify-between gap-3 rounded-3xl border border-[#f4c95d]/50 bg-[#0b1f3a]/95 px-5 py-3.5 shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-[#f4c95d]">Trip total</p>
                <p className="truncate text-[11px] font-semibold text-white/65">
                  {expandedStrategy.title} + {staysData?.intent.nights} nights {selectedStay.quote.name}
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
          <p className="mt-6 text-center text-[10px] font-semibold uppercase tracking-widest text-white/30">
            Tuned to your traveler genome · {brief.genomeSnapshot.homeRegion} · trip #{brief.genomeSnapshot.tripCount + 1}
          </p>
        )}
      </main>
    </div>
  );
}
