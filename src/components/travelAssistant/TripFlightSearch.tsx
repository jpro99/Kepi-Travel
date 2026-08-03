"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AirlineChainFilterBar } from "@/components/travelAssistant/ChainFilterBar";
import { buildGoogleFlightsUrl, resolveAwardBookUrl } from "@/lib/decision/bookingLinks";
import { TripFirstBanner } from "@/components/travelAssistant/TripFirstBanner";
import {
  buildFlightAwardBookLabel,
  buildForwardAfterBookHint,
} from "@/lib/travelAssistant/tripFirstMessaging";
import {
  buildFlightCompareGoogleLabel,
  buildFlightQuoteDisclaimer,
  isTestOrFakeCarrier,
} from "@/lib/flights/bookFlightAdvisorPicks";
import {
  enabledAirlineChainIds,
  loadAirlineChainToggles,
  saveAirlineChainToggles,
  type ChainToggleMap,
} from "@/lib/loyalty/chainFilterPrefs";
import { airlineParticipatesInPoints, matchAirlineChain, type AirlineChainId } from "@/lib/loyalty/chainRegistry";
import type { FusedOffer, FusedSearchResult } from "@/lib/flights/types";
import type { FlightSearchPlan, PlannedFlightLeg } from "@/lib/travelAssistant/tripPlanBooking";

type PayMode = "advisor" | "cash" | "points";

interface AdvisorPickDto {
  kind: "overall" | "cash" | "miles" | "alaska";
  title: string;
  reason: string;
  quoteUsd: number | null;
  milesCost: number | null;
  programLabel: string | null;
  programId: string | null;
  originIata: string;
  destinationIata: string;
  airlineLabel: string;
  stops: number;
  quoteDisclaimer: string;
  ctaLabel: string;
  ctaKind: "google" | "seats";
  offerKind: "cash" | "award" | null;
}

export interface TripFlightSearchProps {
  plan: FlightSearchPlan;
  selectedLegs: PlannedFlightLeg[];
  onClose?: () => void;
}

function primaryLeg(selectedLegs: PlannedFlightLeg[]): PlannedFlightLeg | null {
  return selectedLegs.find((leg) => leg.role === "outbound") ?? selectedLegs[0] ?? null;
}

function returnDate(selectedLegs: PlannedFlightLeg[]): string | undefined {
  const ret = selectedLegs.find((leg) => leg.role === "return");
  return ret?.departureDate;
}

function formatTime(iso: string): string {
  const match = /T(\d{2}):(\d{2})/.exec(iso);
  if (!match) return "";
  const h = Number(match[1]);
  return `${h % 12 || 12}:${match[2]} ${h >= 12 ? "PM" : "AM"}`;
}

export function TripFlightSearch({ plan, selectedLegs }: TripFlightSearchProps) {
  const leg = primaryLeg(selectedLegs);
  const [payMode, setPayMode] = useState<PayMode>("advisor");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picks, setPicks] = useState<AdvisorPickDto[]>([]);
  const [originsSearched, setOriginsSearched] = useState<string[]>([]);
  const [headline, setHeadline] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [fusedResult, setFusedResult] = useState<FusedSearchResult | null>(null);
  const [chainToggles, setChainToggles] = useState<ChainToggleMap<AirlineChainId>>(() => loadAirlineChainToggles());
  const [chainFilterCollapsed, setChainFilterCollapsed] = useState(true);

  const enabledChains = useMemo(() => new Set(enabledAirlineChainIds(chainToggles)), [chainToggles]);
  const retDate = returnDate(selectedLegs);

  const handleChainToggle = (id: AirlineChainId, enabled: boolean): void => {
    setChainToggles((prev) => {
      const next = { ...prev, [id]: enabled };
      saveAirlineChainToggles(next);
      return next;
    });
  };

  const googleUrlFor = (origin: string, destination: string): string =>
    buildGoogleFlightsUrl({
      origin,
      destination,
      departureDate: leg?.departureDate ?? "",
      returnDate: retDate,
    });

  const runSearch = async (): Promise<void> => {
    if (!leg) return;
    setLoading(true);
    setError(null);
    setPicks([]);
    setFusedResult(null);
    setWarnings([]);
    setHeadline(null);

    try {
      const response = await fetch("/api/flights/advisor-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: leg.fromIata,
          destination: leg.toIata,
          departDate: leg.departureDate,
          returnDate: retDate,
          passengers: 1,
          cabin: "economy",
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        picks?: AdvisorPickDto[];
        originsSearched?: string[];
        headline?: string | null;
        warnings?: string[];
        offers?: FusedOffer[];
        params?: FusedSearchResult["params"];
        originCashLeaderboard?: FusedSearchResult["originCashLeaderboard"];
      };
      if (!response.ok) {
        setError(payload.error ?? "Flight search failed.");
        return;
      }
      setPicks(payload.picks ?? []);
      setOriginsSearched(payload.originsSearched ?? []);
      setHeadline(payload.headline ?? null);
      setWarnings(payload.warnings ?? []);
      if (payload.offers && payload.params) {
        setFusedResult({
          params: payload.params,
          offers: payload.offers,
          originCashLeaderboard: payload.originCashLeaderboard,
          warnings: payload.warnings ?? [],
          meta: {
            cashCount: payload.offers.filter((o) => o.offer.kind === "cash").length,
            awardCount: payload.offers.filter((o) => o.offer.kind === "award").length,
            cashCached: false,
            awardCached: false,
            elapsedMs: 0,
            cashOriginsSearched: payload.originsSearched ?? [],
            awardOriginsSearched: payload.originsSearched ?? [],
            awardGatewaysSearched: [],
          },
        });
      }
      if ((payload.picks?.length ?? 0) === 0) {
        setError(payload.warnings?.[0] ?? "No personalized picks yet — try Refresh or compare on Google Flights.");
      }
    } catch {
      setError("Connection error — try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leg?.id, selectedLegs.map((row) => row.id).join("|")]);

  const filteredCash = useMemo(() => {
    const offers = fusedResult?.offers ?? [];
    return offers.filter((row) => {
      if (row.offer.kind !== "cash") return false;
      if (isTestOrFakeCarrier(row.offer.airlineName, row.offer.segments[0]?.marketingCarrier)) return false;
      const chainId = matchAirlineChain(row.offer.airlineName, row.offer.segments[0]?.marketingCarrier);
      if (!chainId) return true;
      return enabledChains.has(chainId);
    });
  }, [fusedResult, enabledChains]);

  const filteredAwards = useMemo(() => {
    const offers = fusedResult?.offers ?? [];
    return offers.filter((row) => {
      if (row.offer.kind !== "award") return false;
      const carrier = row.offer.segments[0]?.marketingCarrier ?? "";
      const chainId = matchAirlineChain(row.offer.program, carrier);
      if (!chainId) return false;
      if (!airlineParticipatesInPoints(row.offer.program, carrier)) return false;
      return enabledChains.has(chainId);
    });
  }, [fusedResult, enabledChains]);

  const renderPick = (pick: AdvisorPickDto): ReactNode => {
    const href =
      pick.ctaKind === "seats"
        ? resolveAwardBookUrl({
            program: pick.programId ?? pick.programLabel ?? "alaska",
            origin: pick.originIata,
            destination: pick.destinationIata,
            departureDate: leg?.departureDate ?? "",
            returnDate: retDate,
            milesCost: pick.milesCost ?? 0,
            verifyUrl: "https://seats.aero",
          }).url
        : googleUrlFor(pick.originIata || leg?.fromIata || "", pick.destinationIata || leg?.toIata || "");

    return (
      <div
        key={`${pick.kind}-${pick.originIata}-${pick.airlineLabel}`}
        className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-sky-700 dark:text-sky-300">
              {pick.title}
            </p>
            <p className="text-sm font-black text-slate-900 dark:text-white">
              {pick.airlineLabel}
              {pick.stops === 0 ? " · Nonstop" : ` · ${pick.stops} stop${pick.stops === 1 ? "" : "s"}`}
            </p>
            <p className="text-[11px] text-slate-500">
              {pick.originIata} → {pick.destinationIata}
              {pick.milesCost != null ? ` · ${pick.milesCost.toLocaleString()} mi` : ""}
            </p>
          </div>
          {pick.quoteUsd != null && pick.ctaKind === "google" ? (
            <p className="text-lg font-black text-slate-900 dark:text-white">~${pick.quoteUsd}</p>
          ) : pick.milesCost != null ? (
            <p className="text-sm font-black text-emerald-800 dark:text-emerald-200">
              {pick.milesCost.toLocaleString()} mi
            </p>
          ) : null}
        </div>
        <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">{pick.reason}</p>
        <p className="text-[10px] text-slate-500">{pick.quoteDisclaimer}</p>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-sky-600 py-2.5 text-center text-xs font-black text-white hover:bg-sky-500"
        >
          {pick.ctaLabel}
        </a>
        <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">{buildForwardAfterBookHint()}</p>
      </div>
    );
  };

  const renderCashRow = (row: FusedOffer): ReactNode => {
    if (row.offer.kind !== "cash") return null;
    const cash = row.offer;
    const first = cash.segments[0];
    const last = cash.segments[cash.segments.length - 1];
    const origin = (row.searchOrigin ?? first?.origin ?? leg?.fromIata ?? "").toUpperCase();
    const destination = (last?.destination ?? leg?.toIata ?? "").toUpperCase();
    const quoteUsd = Math.round(cash.totalAmount >= 1000 ? cash.totalAmount / 100 : cash.totalAmount);
    return (
      <div
        key={cash.id}
        className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-black text-slate-900 dark:text-white">
              {cash.airlineName || first?.marketingCarrier} ·{" "}
              {row.metrics?.stops === 0 ? "Nonstop" : `${row.metrics?.stops ?? 0} stop`}
            </p>
            <p className="text-[11px] text-slate-500">
              {origin} {formatTime(first?.departingAt ?? "")} → {destination} {formatTime(last?.arrivingAt ?? "")}
            </p>
          </div>
          <p className="text-lg font-black text-slate-900 dark:text-white">~${quoteUsd}</p>
        </div>
        <p className="text-[10px] text-slate-500">{buildFlightQuoteDisclaimer(quoteUsd)}</p>
        <a
          href={googleUrlFor(origin, destination)}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-sky-600 py-2.5 text-center text-xs font-black text-white hover:bg-sky-500"
        >
          {buildFlightCompareGoogleLabel()}
        </a>
        <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">{buildForwardAfterBookHint()}</p>
      </div>
    );
  };

  const renderAwardRow = (row: FusedOffer): ReactNode => {
    if (row.offer.kind !== "award") return null;
    const award = row.offer;
    const first = award.segments[0];
    const last = award.segments[award.segments.length - 1];
    const book = resolveAwardBookUrl({
      program: award.program,
      origin: first?.origin ?? leg?.fromIata ?? "",
      destination: last?.destination ?? leg?.toIata ?? "",
      departureDate: (first?.departingAt ?? "").slice(0, 10) || leg?.departureDate || "",
      returnDate: retDate,
      milesCost: award.milesCost,
      verifyUrl: "https://seats.aero",
    });
    return (
      <div
        key={award.id}
        className="flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-black text-slate-900 dark:text-white">
              {award.program} · {award.milesCost.toLocaleString()} mi
            </p>
            <p className="text-[11px] text-slate-500">
              {first?.origin} → {last?.destination} · {award.cabin.replace("_", " ")}
              {award.cashSurcharge > 0 ? ` + $${Math.round(award.cashSurcharge)} fees` : ""}
            </p>
          </div>
          {row.centsPerPoint ? (
            <p className="text-sm font-black text-emerald-800 dark:text-emerald-200">{row.centsPerPoint.toFixed(1)}¢/pt</p>
          ) : null}
        </div>
        <a
          href={book.url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-emerald-600 py-2.5 text-center text-xs font-black text-white hover:bg-emerald-500"
        >
          {buildFlightAwardBookLabel(award.program)}
        </a>
        <p className="text-[10px] leading-relaxed text-emerald-900/80 dark:text-emerald-200/80">{buildForwardAfterBookHint()}</p>
      </div>
    );
  };

  if (!leg) {
    return <p className="text-sm text-slate-500">Select at least one flight leg to search.</p>;
  }

  return (
    <div className="space-y-3">
      <TripFirstBanner variant="flight" />

      <div>
        <p className="text-sm font-bold text-slate-900 dark:text-white">{plan.summary}</p>
        <p className="text-[11px] text-slate-500">
          {leg.fromIata} → {leg.toIata} · {leg.departureDate}
          {retDate ? ` · return ${retDate}` : ""}
        </p>
        {originsSearched.length > 1 ? (
          <p className="mt-1 text-[11px] text-slate-500">
            Also checking nearby airports: {originsSearched.filter((a) => a !== leg.fromIata).join(", ")}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {(
          [
            ["advisor", "Top picks"],
            ["cash", "More cash"],
            ["points", "More miles"],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => setPayMode(mode)}
            className={`rounded-full px-3 py-1 text-[10px] font-bold ${
              payMode === mode ? "bg-emerald-600 text-white" : "border border-slate-300 text-slate-600"
            }`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          disabled={loading}
          onClick={() => void runSearch()}
          className="rounded-full border border-sky-300 px-3 py-1 text-[10px] font-bold text-sky-700 disabled:opacity-50"
        >
          {loading ? "Searching…" : "Refresh"}
        </button>
      </div>

      {payMode !== "advisor" ? (
        <AirlineChainFilterBar
          toggles={chainToggles}
          onChange={handleChainToggle}
          collapsed={chainFilterCollapsed}
          onToggleCollapse={() => setChainFilterCollapsed((value) => !value)}
        />
      ) : null}

      <p className="text-[11px] text-sky-800 dark:text-sky-200">
        Personalized ranking for how you fly — quotes are for comparison. Confirm price on Google Flights or the
        airline, then forward confirmation to Kepi.
      </p>
      {headline ? <p className="text-[11px] font-medium text-slate-700 dark:text-slate-200">{headline}</p> : null}

      {error ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">{error}</p>
      ) : null}
      {!error && warnings.length > 0 ? (
        <p className="text-[10px] text-slate-500">{warnings[0]}</p>
      ) : null}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((key) => (
            <div key={key} className="h-20 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : null}

      {!loading && payMode === "advisor" ? (
        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {picks.map((pick) => renderPick(pick))}
          {picks.length === 0 && !error ? (
            <p className="text-xs text-slate-500">No advisor picks yet — try Refresh.</p>
          ) : null}
        </div>
      ) : null}

      {!loading && payMode === "cash" ? (
        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {filteredCash.map((row) => renderCashRow(row))}
          {filteredCash.length === 0 && !error ? (
            <p className="text-xs text-slate-500">No cash flights match your airline filters.</p>
          ) : null}
        </div>
      ) : null}

      {!loading && payMode === "points" ? (
        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {filteredAwards.map((row) => renderAwardRow(row))}
          {filteredAwards.length === 0 && !error ? (
            <p className="text-xs text-slate-500">No award flights match your airline filters.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
