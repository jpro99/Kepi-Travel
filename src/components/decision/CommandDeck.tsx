"use client";

import { DecisionConstellation } from "@/components/decision/DecisionConstellation";
import { InstrumentPanel } from "@/components/decision/InstrumentPanel";
import { StrategyCard } from "@/components/decision/StrategyCard";
import { VoiceIntentBar } from "@/components/decision/VoiceIntentBar";
import { Button } from "@/components/ui/button";
import type {
  CounterfactualMutation,
  DecisionBrief,
  DecisionQuestion,
} from "@/lib/decision/types";
import { Loader2, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const DEFAULT_PROMPT = "I want to go to Italy in September";

export function CommandDeck() {
  const router = useRouter();
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [inputPrompt, setInputPrompt] = useState(DEFAULT_PROMPT);
  const [brief, setBrief] = useState<DecisionBrief | null>(null);
  const [comfortWeight, setComfortWeight] = useState(0.55);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [counterfactualNote, setCounterfactualNote] = useState<string | null>(null);

  const fetchStrategies = useCallback(
    async (nextPrompt: string, weight: number, mutation?: CounterfactualMutation) => {
      setLoading(true);
      setError(null);
      try {
        const endpoint = mutation ? "/api/decision/counterfactual" : "/api/decision/strategies";
        const body = mutation
          ? { prompt: nextPrompt, mutation: { ...mutation, priorityComfort: weight } }
          : { prompt: nextPrompt, comfortWeight: weight };

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("Failed to analyze trip");
        const data = await res.json();
        setBrief(data.brief);
        if (mutation && data.counterfactual?.rankingChanged) {
          setCounterfactualNote("Ranking updated from your voice refinement.");
        } else if (mutation) {
          setCounterfactualNote("Scores updated — top pick unchanged.");
        } else {
          setCounterfactualNote(null);
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPrompt(inputPrompt);
    void fetchStrategies(inputPrompt, comfortWeight);
  };

  useEffect(() => {
    void fetchStrategies(DEFAULT_PROMPT, comfortWeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial demo load only
  }, []);

  const handleComfortChange = (value: number) => {
    setComfortWeight(value);
    if (brief) void fetchStrategies(prompt, value);
  };

  const handleVoiceMutation = (mutation: CounterfactualMutation, utterance: string) => {
    setCounterfactualNote(`Heard: “${utterance}”`);
    void fetchStrategies(prompt, comfortWeight, mutation);
  };

  const handleQuestionAnswer = async (question: DecisionQuestion, optionId: string) => {
    const option = question.options.find((o) => o.id === optionId);
    if (option?.genomeOverride) {
      await fetch("/api/traveler/genome", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "correct",
          correction: { override: option.genomeOverride, context: question.prompt },
        }),
      });
    }
    if (optionId === "yes" && question.id === "q-reposition") {
      void fetchStrategies(prompt, comfortWeight, { willingToReposition: true });
    }
    if (optionId === "no" && question.id.startsWith("q-reposition")) {
      void fetchStrategies(prompt, comfortWeight, { willingToReposition: false });
    }
  };

  const handleActivate = async (strategyId: string) => {
    setActivatingId(strategyId);
    setError(null);
    try {
      const res = await fetch("/api/decision/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, strategyId }),
      });
      if (!res.ok) throw new Error("Activation failed");
      const data = await res.json();
      router.push(data.activation.redirectPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Activation failed");
      setActivatingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-foreground">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-900/20 via-transparent to-transparent" />

      <header className="relative z-10 border-b border-white/5 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-emerald-400/80">
              Kepi Travel Decision Engine
            </p>
            <h1 className="text-2xl font-bold tracking-tight">Command Deck</h1>
          </div>
          <nav className="flex gap-4 text-sm">
            <Link href="/travel-assistant" className="text-muted-foreground hover:text-foreground">
              Travel Assistant
            </Link>
            <Link href="/" className="text-muted-foreground hover:text-foreground">
              Home
            </Link>
          </nav>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-6 py-8">
        <form onSubmit={handleSubmit} className="mb-8">
          <label htmlFor="trip-intent" className="sr-only">
            Trip intent
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              id="trip-intent"
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              placeholder="Italy in September…"
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-lg backdrop-blur-sm placeholder:text-muted-foreground focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
            />
            <Button type="submit" size="lg" disabled={loading} className="gap-2 bg-emerald-600 hover:bg-emerald-500">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Analyze
            </Button>
          </div>
        </form>

        {!brief && !loading && (
          <p className="text-center text-muted-foreground">
            Say where and when — Kepi derives airports, strategies, and loyalty logic automatically.
          </p>
        )}

        {brief && (
          <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
            <div className="space-y-6">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <p className="text-sm text-emerald-400/90">{brief.inferredSummary}</p>
                <p className="mt-1 text-xs text-muted-foreground">{brief.intent.seasonNote}</p>
                {brief.livePricing?.message && (
                  <p className="mt-2 text-xs text-sky-400">
                    {brief.livePricing.configured ? "✈ " : ""}
                    {brief.livePricing.message}
                  </p>
                )}
                {counterfactualNote && (
                  <p className="mt-2 text-xs text-sky-400">{counterfactualNote}</p>
                )}
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Priority</span>
                  <span>
                    Value {(100 - comfortWeight * 100).toFixed(0)}% · Comfort {(comfortWeight * 100).toFixed(0)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.2}
                  max={0.9}
                  step={0.05}
                  value={comfortWeight}
                  onChange={(e) => handleComfortChange(parseFloat(e.target.value))}
                  className="w-full accent-emerald-500"
                  aria-label="Comfort vs value priority"
                />
              </div>

              <VoiceIntentBar onMutation={handleVoiceMutation} disabled={loading} />

              <div className="space-y-4">
                {brief.strategies.map((s, i) => (
                  <StrategyCard
                    key={s.id}
                    strategy={s}
                    rank={i + 1}
                    expanded={expandedId === s.id}
                    activating={activatingId === s.id}
                    onToggle={() => {
                      setExpandedId((current) => (current === s.id ? null : s.id));
                    }}
                    onActivate={() => {
                      void handleActivate(s.id);
                    }}
                  />
                ))}
              </div>

              {brief.questions.length > 0 && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4">
                  <p className="text-sm font-medium text-amber-200/90">One question that matters</p>
                  {brief.questions.slice(0, 1).map((q) => (
                    <div key={q.id} className="mt-3">
                      <p className="font-medium">{q.prompt}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{q.stakes}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {q.options.map((opt) => (
                          <Button
                            key={opt.id}
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void handleQuestionAnswer(q, opt.id)}
                          >
                            {opt.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <InstrumentPanel
                highlights={brief.instrumentHighlights}
                homeRegion={brief.genomeSnapshot.homeRegion}
                hotelPriority={brief.genomeSnapshot.hotelChainPriority}
              />
              <DecisionConstellation strategies={brief.strategies} comfortWeight={comfortWeight} />
              <div className="rounded-2xl border border-border/60 bg-card/30 p-4 text-xs text-muted-foreground">
                <p className="font-medium text-foreground/80">Search space</p>
                <p className="mt-2">{brief.searchAirports.join(" · ")}</p>
                <p className="mt-3">
                  Trips planned: {brief.genomeSnapshot.tripCount} — fewer questions over time.
                </p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <p className="mt-4 text-center text-sm text-red-400" role="alert">
            {error}
          </p>
        )}

        {loading && !brief && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
          </div>
        )}
      </main>
    </div>
  );
}
