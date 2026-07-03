"use client";

import { useMemo, useState } from "react";
import type { CabinClass, FusedOffer, FusedSearchResult } from "@/lib/flights/types";
import { resolveAwardBookUrl, resolveCashBookUrl } from "@/lib/decision/bookingLinks";
import { buildSeatsAeroSearchUrl } from "@/lib/decision/awardFlexEstimate";
import { labelFor as programLabel } from "@/lib/flights/programLabels";
import { AirportComparisonTable } from "@/components/decision/AirportComparisonTable";

interface FusedFlightHeroProps {
  search: FusedSearchResult;
  onOpenFlexForOrigin?: (originIata: string, cabin: CabinClass, baselineCashCents: number) => void;
}

function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function offerHeadline(row: FusedOffer): string {
  if (row.offer.kind === "cash") {
    const origin = row.searchOrigin ?? row.offer.segments[0]?.origin ?? "";
    const carrier = row.offer.segments[0]?.marketingCarrier ?? "Duffel";
    const originBit = origin ? `${origin} · ` : "";
    return `${originBit}${formatUsd(row.cashEquivalent)} cash · ${carrier}`;
  }
  if (row.isGatewayPlay && row.gatewayPlayTitle) {
    return row.gatewayPlayTitle;
  }
  return `${row.offer.milesCost.toLocaleString()} ${programLabel(row.offer.program)} mi`;
}

function cashBookLink(row: FusedOffer, departDate: string) {
  if (row.offer.kind !== "cash") return null;
  const seg = row.offer.segments[0];
  if (!seg) return null;
  const airline = row.offer.airlineName ?? seg.marketingCarrier;
  return resolveCashBookUrl({
    origin: row.searchOrigin ?? seg.origin,
    destination: seg.destination,
    departureDate: departDate,
    airline,
    offerId: row.offer.id,
    quotedPriceUsd: row.cashEquivalent / 100,
    flightNumber: seg.flightNumber !== "—" ? seg.flightNumber : undefined,
  });
}

function awardBookLink(row: FusedOffer, departDate: string, destination: string) {
  if (row.offer.kind !== "award") return null;
  const origin = row.searchOrigin ?? row.offer.segments[0]?.origin ?? "";
  const verifyUrl = buildSeatsAeroSearchUrl({ origin, destination, departureDate: departDate });
  return resolveAwardBookUrl({
    program: row.offer.program,
    origin,
    destination,
    departureDate: departDate,
    milesCost: row.offer.milesCost,
    verifyUrl,
  });
}

export function FusedFlightHero({ search, onOpenFlexForOrigin }: FusedFlightHeroProps) {
  const defaultCabin: CabinClass =
    search.cabinsSearched?.includes(search.params.cabin) ? search.params.cabin : "business";
  const [activeCabin, setActiveCabin] = useState<CabinClass>(defaultCabin);

  const slice = search.byCabin?.[activeCabin];
  const offers = slice?.offers ?? search.offers;
  const cheapestCash = slice?.cheapestCash ?? search.cheapestCash;
  const bestAward = slice?.bestAward ?? search.bestAward;
  const leaderboard = slice?.originCashLeaderboard ?? search.originCashLeaderboard ?? [];
  const awardLeaderboard = slice?.originAwardLeaderboard ?? search.originAwardLeaderboard ?? [];
  const gatewayPlays = slice?.gatewayPlays ?? search.gatewayPlays ?? [];
  const headline = slice?.headline ?? search.headline;
  const best = offers[0];

  const cabinTabs = useMemo(
    () => search.cabinsSearched ?? [search.params.cabin],
    [search.cabinsSearched, search.params.cabin],
  );

  const route = `${search.params.origin} → ${search.params.destination}`;

  return (
    <section className="mt-5 overflow-hidden rounded-3xl border border-sky-500/30 bg-gradient-to-br from-[#0b1f3a] via-[#122a45] to-[#0b1f3a] p-5 shadow-lg">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-300">
            Live cash vs points
          </p>
          <h2 className="mt-1 text-lg font-black leading-snug text-white">
            {headline ?? "Fused cash + award search complete"}
          </h2>
          <p className="mt-2 text-xs text-slate-300">
            {route} · {search.params.departDate}
            {search.params.passengers > 1 ? ` · ${search.params.passengers} travelers` : null}
            {search.cabinsSearched?.length
              ? ` · economy + business searched`
              : ` · ${search.params.cabin.replace("_", " ")}`}
          </p>
          {cabinTabs.length > 1 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {cabinTabs.map((cabin) => (
                <button
                  key={cabin}
                  type="button"
                  onClick={() => setActiveCabin(cabin)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold capitalize transition-colors ${
                    activeCabin === cabin
                      ? "bg-sky-500 text-white"
                      : "border border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {cabin.replace("_", " ")}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="rounded-2xl border border-sky-500/30 bg-sky-950/40 px-3 py-2 text-right">
          <p className="text-[10px] font-bold uppercase tracking-widest text-sky-200/80">Sources</p>
          <p className="text-sm font-black tabular-nums text-white">
            {search.meta.cashCount} cash · {search.meta.awardCount} award
          </p>
          <p className="text-[10px] text-sky-100/70">
            {search.meta.elapsedMs}ms
            {search.meta.cashCached || search.meta.awardCached
              ? ` · cache ${search.meta.cashCached ? "cash" : ""}${search.meta.cashCached && search.meta.awardCached ? "+" : ""}${search.meta.awardCached ? "award" : ""}`
              : " · live"}
          </p>
          {search.meta.awardGatewaysSearched.length > 0 ? (
            <p className="mt-1 text-[9px] text-emerald-200/80">
              Gateway search: {search.meta.awardGatewaysSearched.join(", ")}
            </p>
          ) : null}
        </div>
      </div>

      <AirportComparisonTable
        cashLeaderboard={leaderboard}
        awardLeaderboard={awardLeaderboard}
        alaskaUpgradeCandidates={search.alaskaUpgradeCandidates}
        destination={search.params.destination}
        departDate={search.params.departDate}
        onRowClick={(originIata, baselineCashCents) =>
          onOpenFlexForOrigin?.(originIata, activeCabin, baselineCashCents)
        }
      />

      {best ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <article className="rounded-2xl border border-slate-600 bg-[#152238]/80 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Best live cash</p>
            <p className="mt-2 text-2xl font-black tabular-nums text-slate-100">
              {cheapestCash ? formatUsd(cheapestCash.cashEquivalent) : "—"}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {cheapestCash?.searchOrigin ? `from ${cheapestCash.searchOrigin} · ` : ""}
              {cheapestCash?.metrics?.stops ?? 0} stop
              {(cheapestCash?.metrics?.stops ?? 0) === 1 ? "" : "s"}
              {cheapestCash?.score !== undefined ? ` · score ${cheapestCash.score}` : null}
            </p>
            {cheapestCash ? (
              (() => {
                const book = cashBookLink(cheapestCash, search.params.departDate);
                return book ? (
                  <a
                    href={book.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-3 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-900/50"
                  >
                    {book.label}
                  </a>
                ) : null;
              })()
            ) : null}
          </article>
          <article
            className={`rounded-2xl border p-4 ${
              bestAward
                ? "border-emerald-500/40 bg-emerald-950/30 text-emerald-200"
                : "border-sky-500/40 bg-sky-950/30 text-sky-200"
            }`}
          >
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">Kepi verdict</p>
            <p className="mt-1 text-sm font-black">
              {best.offer.kind === "award" ? "Use points" : "Pay cash"}
            </p>
            <p className="mt-2 text-2xl font-black tabular-nums text-white">{offerHeadline(best)}</p>
            <p className="mt-1 text-xs leading-relaxed opacity-90">
              {best.centsPerPoint ? `${best.centsPerPoint}c/pt · ` : null}
              {best.recommendationReason ?? (best.score !== undefined ? `Composite score ${best.score}` : null)}
            </p>
            {best.offer.kind === "award" ? (
              (() => {
                const book = awardBookLink(best, search.params.departDate, search.params.destination);
                return book ? (
                  <a
                    href={book.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-3 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-900/50"
                  >
                    {book.label}
                  </a>
                ) : null;
              })()
            ) : cheapestCash ? (
              (() => {
                const book = cashBookLink(cheapestCash, search.params.departDate);
                return book ? (
                  <a
                    href={book.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-3 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-900/50"
                  >
                    {book.label}
                  </a>
                ) : null;
              })()
            ) : null}
          </article>
        </div>
      ) : null}

      {gatewayPlays.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">
            West Coast gateway awards · Seats.aero live
          </p>
          <p className="mt-1 text-xs text-emerald-100/80">
            No space from your home airports — these are the best partner miles from West Coast hubs.
          </p>
          <ul className="mt-3 space-y-2">
            {gatewayPlays.slice(0, 3).map((row) => {
              const award = row.offer.kind === "award" ? row.offer : null;
              if (!award) return null;
              const gateway = row.searchOrigin ?? "SEA";
              const book = awardBookLink(row, search.params.departDate, search.params.destination);
              return (
                <li
                  key={award.id}
                  className="rounded-xl border border-emerald-500/25 bg-[#0b1f3a]/50 px-3 py-3"
                >
                  <p className="text-sm font-black text-white">
                    {row.gatewayPlayTitle ?? `Gateway play · ${gateway}`}
                  </p>
                  <p className="mt-1 text-xs text-emerald-100/90">
                    {row.feederOrigin
                      ? `${row.feederOrigin} → ${gateway} feeder`
                      : null}
                    {row.feederOrigin && row.feederCashUsd !== undefined
                      ? ` (~$${Math.round(row.feederCashUsd)}) + `
                      : row.feederOrigin
                        ? " + "
                        : ""}
                    {gateway} → {search.params.destination}: {award.milesCost.toLocaleString()}{" "}
                    {programLabel(award.program)} mi
                    {row.centsPerPoint ? ` · ${row.centsPerPoint}c/pt` : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {book ? (
                      <a
                        href={book.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-2.5 py-1 text-[10px] font-bold text-emerald-200 hover:bg-emerald-900/50"
                      >
                        {book.label}
                      </a>
                    ) : null}
                    <a
                      href={buildSeatsAeroSearchUrl({
                        origin: gateway,
                        destination: search.params.destination,
                        departureDate: search.params.departDate,
                      })}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-sky-500/30 bg-sky-950/40 px-2.5 py-1 text-[10px] font-bold text-sky-200 hover:bg-sky-900/50"
                    >
                      Verify on Seats.aero ↗
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {search.alaskaUpgradeCandidates && search.alaskaUpgradeCandidates.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-amber-500/35 bg-amber-950/25 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-300">
            Alaska Guest Upgrade Play
          </p>
          <p className="mt-1 text-xs text-amber-100/85">
            Book Alaska-metal economy, then apply your upgrade certificate in Manage Reservation.
          </p>
          <ul className="mt-3 space-y-2">
            {search.alaskaUpgradeCandidates.slice(0, 4).map((candidate) => (
              <li
                key={`${candidate.origin}-${candidate.cashUsd}`}
                className="rounded-xl border border-amber-500/25 bg-[#0b1f3a]/50 px-3 py-3"
              >
                <p className="text-sm font-black text-white">
                  {candidate.origin} → {candidate.destination} · ${Math.round(candidate.cashUsd).toLocaleString()}{" "}
                  {candidate.cabin.replace("_", " ")}
                </p>
                <p className="mt-1 text-xs text-amber-100/80">{candidate.detail}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <a
                    href={candidate.bookUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-amber-500/45 bg-amber-950/50 px-3 py-1.5 text-xs font-bold text-amber-100 hover:bg-amber-900/50"
                  >
                    {candidate.bookLabel}
                  </a>
                  <a
                    href="https://www.alaskaair.com/content/travel-info/on-board/upgrades"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-slate-500/40 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-800/60"
                  >
                    How upgrade certs work ↗
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {search.warnings.length > 0 ? (
        <p className="mt-3 text-[10px] text-amber-200/90">{search.warnings.join(" ")}</p>
      ) : null}

      {offers.length > 1 ? (
        <ul className="mt-4 space-y-2">
          {offers.slice(1, 5).map((row) => {
            const book =
              row.offer.kind === "cash"
                ? cashBookLink(row, search.params.departDate)
                : awardBookLink(row, search.params.departDate, search.params.destination);
            return (
              <li
                key={row.offer.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-600/80 bg-[#152238]/60 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-white">{offerHeadline(row)}</p>
                  <p className="truncate text-[10px] text-slate-400">
                    {row.offer.kind === "award"
                      ? row.isGatewayPlay
                        ? "West Coast gateway · live Seats.aero"
                        : row.reachable
                          ? "Reachable"
                          : "Transfer needed"
                      : "Live Duffel cash"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <p className="text-sm font-black tabular-nums text-slate-200">
                    {formatUsd(row.cashEquivalent)}
                  </p>
                  {book ? (
                    <a
                      href={book.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-slate-500/50 px-2 py-0.5 text-[9px] font-bold text-sky-200 hover:bg-slate-700/50"
                    >
                      Book ↗
                    </a>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
