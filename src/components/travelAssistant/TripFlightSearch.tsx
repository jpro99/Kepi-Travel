"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AirlineChainFilterBar } from "@/components/travelAssistant/ChainFilterBar";
import { resolveAwardBookUrl, resolveCashBookUrl } from "@/lib/decision/bookingLinks";
import {
  enabledAirlineChainIds,
  loadAirlineChainToggles,
  saveAirlineChainToggles,
  type ChainToggleMap,
} from "@/lib/loyalty/chainFilterPrefs";
import { airlineParticipatesInPoints, matchAirlineChain, type AirlineChainId } from "@/lib/loyalty/chainRegistry";
import type { FusedOffer, FusedSearchResult } from "@/lib/flights/types";
import type { FlightSearchPlan, PlannedFlightLeg } from "@/lib/travelAssistant/tripPlanBooking";

type PayMode = "cash" | "points";

interface CashFlightRow {
  id: string;
  price: number;
  currency: string;
  airline: string;
  airlineName: string;
  departs: string;
  arrives: string;
  fromIata: string;
  toIata: string;
  stops: number;
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
  const [payMode, setPayMode] = useState<PayMode>("cash");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cashFlights, setCashFlights] = useState<CashFlightRow[]>([]);
  const [fusedResult, setFusedResult] = useState<FusedSearchResult | null>(null);
  const [chainToggles, setChainToggles] = useState<ChainToggleMap<AirlineChainId>>(() => loadAirlineChainToggles());
  const [chainFilterCollapsed, setChainFilterCollapsed] = useState(true);

  const enabledChains = useMemo(() => new Set(enabledAirlineChainIds(chainToggles)), [chainToggles]);

  const handleChainToggle = (id: AirlineChainId, enabled: boolean): void => {
    setChainToggles((prev) => {
      const next = { ...prev, [id]: enabled };
      saveAirlineChainToggles(next);
      return next;
    });
  };

  const runSearch = async (): Promise<void> => {
    if (!leg) return;
    setLoading(true);
    setError(null);
    setCashFlights([]);
    setFusedResult(null);

    try {
      if (payMode === "cash") {
        const response = await fetch("/api/flights/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            origin: leg.fromIata,
            destination: leg.toIata,
            departDate: leg.departureDate,
            returnDate: returnDate(selectedLegs),
            passengers: 1,
            cabin: "economy",
          }),
        });
        const payload = (await response.json()) as { error?: string; flights?: CashFlightRow[] };
        if (!response.ok) {
          setError(payload.error ?? "Flight search failed.");
          return;
        }
        setCashFlights(payload.flights ?? []);
        if ((payload.flights?.length ?? 0) === 0) setError("No cash flights found for these dates.");
      } else {
        const response = await fetch("/api/flights/award-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            origin: leg.fromIata,
            destination: leg.toIata,
            departDate: leg.departureDate,
            returnDate: returnDate(selectedLegs),
            passengers: 1,
            cabin: "economy",
          }),
        });
        const payload = (await response.json()) as FusedSearchResult & { error?: string };
        if (!response.ok) {
          setError(payload.error ?? "Award search failed.");
          return;
        }
        setFusedResult(payload);
        const awardCount = payload.offers?.filter((row) => row.offer.kind === "award").length ?? 0;
        if (awardCount === 0) setError("No award space found — try cash or adjust airlines.");
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
  }, [payMode, leg?.id, selectedLegs.map((row) => row.id).join("|")]);

  const filteredCash = useMemo(() => {
    return cashFlights.filter((flight) => {
      const chainId = matchAirlineChain(flight.airlineName, flight.airline);
      if (!chainId) return payMode !== "points";
      if (payMode === "points" && !airlineParticipatesInPoints(flight.airlineName, flight.airline)) return false;
      return enabledChains.has(chainId);
    });
  }, [cashFlights, enabledChains, payMode]);

  const filteredAwards = useMemo(() => {
    const offers = fusedResult?.offers ?? [];
    return offers.filter((row) => {
      if (row.offer.kind !== "award") return false;
      const carrier = row.offer.segments[0]?.marketingCarrier ?? "";
      const chainId = matchAirlineChain(row.offer.program, carrier);
      if (!chainId) return false;
      return enabledChains.has(chainId);
    });
  }, [fusedResult, enabledChains]);

  const renderCashRow = (flight: CashFlightRow): ReactNode => {
    const book = resolveCashBookUrl({
      origin: flight.fromIata,
      destination: flight.toIata,
      departureDate: leg?.departureDate ?? "",
      returnDate: returnDate(selectedLegs),
      airline: flight.airlineName,
      airlineIata: flight.airline,
      offerId: flight.id,
      quotedPriceUsd: flight.price,
    });
    return (
      <div
        key={flight.id}
        className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-black text-slate-900 dark:text-white">
              {flight.airlineName || flight.airline} · {flight.stops === 0 ? "Nonstop" : `${flight.stops} stop`}
            </p>
            <p className="text-[11px] text-slate-500">
              {flight.fromIata} {formatTime(flight.departs)} → {flight.toIata} {formatTime(flight.arrives)}
            </p>
          </div>
          <p className="text-lg font-black text-slate-900 dark:text-white">${Math.round(flight.price)}</p>
        </div>
        <a
          href={book.url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-sky-600 py-2.5 text-center text-xs font-black text-white hover:bg-sky-500"
        >
          {book.label}
        </a>
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
      returnDate: returnDate(selectedLegs),
      milesCost: award.milesCost,
      verifyUrl: award.rawAvailabilityId ? `https://seats.aero` : undefined,
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
          {book.label}
        </a>
      </div>
    );
  };

  if (!leg) {
    return <p className="text-sm text-slate-500">Select at least one flight leg to search.</p>;
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-bold text-slate-900 dark:text-white">{plan.summary}</p>
        <p className="text-[11px] text-slate-500">
          {leg.fromIata} → {leg.toIata} · {leg.departureDate}
          {returnDate(selectedLegs) ? ` · return ${returnDate(selectedLegs)}` : ""}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {(["cash", "points"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setPayMode(mode)}
            className={`rounded-full px-3 py-1 text-[10px] font-bold ${
              payMode === mode ? "bg-emerald-600 text-white" : "border border-slate-300 text-slate-600"
            }`}
          >
            {mode === "cash" ? "Cash" : "Points & miles"}
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

      <AirlineChainFilterBar
        toggles={chainToggles}
        onChange={handleChainToggle}
        collapsed={chainFilterCollapsed}
        onToggleCollapse={() => setChainFilterCollapsed((value) => !value)}
      />

      {payMode === "points" ? (
        <p className="text-[11px] text-emerald-800 dark:text-emerald-200">
          Points mode shows airlines with loyalty programs. Uncheck carriers you don&apos;t want — booking opens their site with route and dates filled in.
        </p>
      ) : null}

      {error ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">{error}</p>
      ) : null}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((key) => (
            <div key={key} className="h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : null}

      {!loading && payMode === "cash" ? (
        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {filteredCash.map((flight) => renderCashRow(flight))}
          {filteredCash.length === 0 && !error ? (
            <p className="text-xs text-slate-500">No flights match your airline filters.</p>
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
