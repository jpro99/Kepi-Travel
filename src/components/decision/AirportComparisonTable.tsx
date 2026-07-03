"use client";

import { labelFor } from "@/lib/flights/programLabels";
import { resolveCashBookUrl } from "@/lib/decision/bookingLinks";
import { buildSeatsAeroSearchUrl } from "@/lib/decision/awardFlexEstimate";
import type { AlaskaUpgradeCandidate, OriginAwardRow, OriginCashRow } from "@/lib/flights/types";

interface AirportComparisonTableProps {
  cashLeaderboard: OriginCashRow[];
  awardLeaderboard: OriginAwardRow[];
  alaskaUpgradeCandidates?: AlaskaUpgradeCandidate[];
  destination: string;
  departDate: string;
  onRowClick: (originIata: string, baselineCashCents: number) => void;
}

function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

interface Row {
  origin: string;
  cash?: OriginCashRow;
  award?: OriginAwardRow;
  isGateway: boolean;
}

function buildRows(cashLeaderboard: OriginCashRow[], awardLeaderboard: OriginAwardRow[]): Row[] {
  const byOrigin = new Map<string, Row>();
  for (const cash of cashLeaderboard) {
    byOrigin.set(cash.origin, { origin: cash.origin, cash, isGateway: false });
  }
  for (const award of awardLeaderboard) {
    const existing = byOrigin.get(award.origin);
    if (existing) {
      existing.award = award;
      existing.isGateway = existing.isGateway || award.isGatewayPlay;
    } else {
      byOrigin.set(award.origin, { origin: award.origin, award, isGateway: award.isGatewayPlay });
    }
  }

  const rows = [...byOrigin.values()];
  rows.sort((a, b) => {
    if (a.isGateway !== b.isGateway) return a.isGateway ? 1 : -1;
    const aPrice = a.cash?.totalAmount ?? Infinity;
    const bPrice = b.cash?.totalAmount ?? Infinity;
    return aPrice - bPrice;
  });
  return rows;
}

export function AirportComparisonTable({
  cashLeaderboard,
  awardLeaderboard,
  alaskaUpgradeCandidates,
  destination,
  departDate,
  onRowClick,
}: AirportComparisonTableProps) {
  if (cashLeaderboard.length === 0 && awardLeaderboard.length === 0) return null;

  const rows = buildRows(cashLeaderboard, awardLeaderboard);
  const alaskaOrigins = new Set((alaskaUpgradeCandidates ?? []).map((c) => c.origin));

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-slate-600/80 bg-[#152238]/60">
      <div className="grid grid-cols-3 gap-2 border-b border-slate-600/60 px-4 py-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Airport</p>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Cash · live</p>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Points · live</p>
      </div>
      <ul>
        {rows.map((row) => {
          const cashBook = row.cash
            ? resolveCashBookUrl({
                origin: row.origin,
                destination,
                departureDate: row.cash.departureDate,
                airline: row.cash.airline,
                offerId: row.cash.offerId,
                quotedPriceUsd: row.cash.totalAmount / 100,
              })
            : null;
          const awardVerifyUrl = row.award
            ? buildSeatsAeroSearchUrl({ origin: row.origin, destination, departureDate: row.award.departureDate })
            : null;
          const baselineCashCents = row.cash?.totalAmount ?? 0;
          const upgradeEligible = alaskaOrigins.has(row.origin);

          return (
            <li
              key={row.origin}
              role="button"
              tabIndex={0}
              onClick={() => onRowClick(row.origin, baselineCashCents)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onRowClick(row.origin, baselineCashCents);
              }}
              className="grid grid-cols-3 items-center gap-2 border-b border-slate-700/60 px-4 py-3 transition-colors last:border-b-0 hover:bg-white/5 cursor-pointer"
            >
              <div className="min-w-0">
                <p className="text-sm font-bold text-white">
                  {row.origin}
                  {row.isGateway ? (
                    <span className="ml-2 rounded-md bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-300">
                      Gateway
                    </span>
                  ) : null}
                </p>
                {upgradeEligible ? (
                  <p className="mt-0.5 text-[10px] font-bold text-amber-300">✓ AS upgrade eligible</p>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                {row.cash ? (
                  <>
                    <span className="text-sm font-black tabular-nums text-slate-100">
                      {formatUsd(row.cash.totalAmount)}
                    </span>
                    {cashBook ? (
                      <a
                        href={cashBook.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="rounded-lg border border-sky-500/40 bg-sky-950/60 px-2 py-0.5 text-[9px] font-bold text-sky-200 hover:bg-sky-900/60"
                      >
                        Book ↗
                      </a>
                    ) : null}
                  </>
                ) : (
                  <span className="text-xs text-slate-500">—</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {row.award ? (
                  <>
                    <span className="text-sm font-black tabular-nums text-slate-100">
                      {row.award.milesCost.toLocaleString()} {labelFor(row.award.program)} mi
                      {row.award.centsPerPoint ? (
                        <span className="ml-1 text-[10px] font-normal text-slate-400">
                          {row.award.centsPerPoint}¢/pt
                        </span>
                      ) : null}
                    </span>
                    {awardVerifyUrl ? (
                      <a
                        href={awardVerifyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="rounded-lg border border-emerald-500/40 bg-emerald-950/60 px-2 py-0.5 text-[9px] font-bold text-emerald-200 hover:bg-emerald-900/60"
                      >
                        Verify ↗
                      </a>
                    ) : null}
                  </>
                ) : (
                  <span className="text-xs text-slate-500">No award space</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
