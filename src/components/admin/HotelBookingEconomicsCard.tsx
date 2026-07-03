"use client";

import { useCallback, useEffect, useState } from "react";

interface HotelBookingSummary {
  bookingCount: number;
  grossGuestUsd: number;
  netWholesaleUsd: number;
  markupUsd: number;
  estimatedStripeFeesUsd: number;
  estimatedKepiMarginUsd: number;
  memberBookings: number;
  freeBookings: number;
}

interface HotelBookingRow {
  id: string;
  hotelName: string;
  city: string;
  checkIn: string;
  checkOut: string;
  netTotalUsd: number;
  guestTotalUsd: number;
  markupUsd: number;
  isMemberRate: boolean;
  estimatedStripeFeeUsd: number;
  estimatedKepiMarginUsd: number;
  bookingReference?: string;
  createdAt: string;
}

function fmtUsd(value: number): string {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function HotelBookingEconomicsCard() {
  const [summary, setSummary] = useState<HotelBookingSummary | null>(null);
  const [recent, setRecent] = useState<HotelBookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/hotel-bookings", { cache: "no-store" });
      const payload = (await response.json()) as {
        summary?: HotelBookingSummary;
        recent?: HotelBookingRow[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
      setSummary(payload.summary ?? null);
      setRecent(Array.isArray(payload.recent) ? payload.recent : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load hotel economics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Hotel booking economics</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Kepi in-app LiteAPI checkout — markup, Stripe fees, and estimated margin.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold dark:border-slate-600"
        >
          Refresh
        </button>
      </div>

      {loading ? <p className="mt-4 text-sm text-slate-500">Loading…</p> : null}
      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      {summary ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Bookings" value={String(summary.bookingCount)} />
          <Metric label="Guest paid" value={fmtUsd(summary.grossGuestUsd)} />
          <Metric label="Wholesale (LiteAPI)" value={fmtUsd(summary.netWholesaleUsd)} />
          <Metric label="Est. Kepi margin" value={fmtUsd(summary.estimatedKepiMarginUsd)} sub={`Markup ${fmtUsd(summary.markupUsd)} · Stripe ~${fmtUsd(summary.estimatedStripeFeesUsd)}`} />
          <Metric label="Free-user bookings" value={String(summary.freeBookings)} />
          <Metric label="Member bookings" value={String(summary.memberBookings)} />
        </div>
      ) : null}

      {recent.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-700">
                <th className="py-2 pr-3">When</th>
                <th className="py-2 pr-3">Hotel</th>
                <th className="py-2 pr-3">Guest</th>
                <th className="py-2 pr-3">Net</th>
                <th className="py-2 pr-3">Margin</th>
                <th className="py-2 pr-3">Plan</th>
              </tr>
            </thead>
            <tbody>
              {recent.slice(0, 12).map((row) => (
                <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-2 pr-3 whitespace-nowrap">{new Date(row.createdAt).toLocaleDateString()}</td>
                  <td className="py-2 pr-3">
                    <p className="font-semibold">{row.hotelName}</p>
                    <p className="text-slate-500">{row.city}</p>
                  </td>
                  <td className="py-2 pr-3">{fmtUsd(row.guestTotalUsd)}</td>
                  <td className="py-2 pr-3">{fmtUsd(row.netTotalUsd)}</td>
                  <td className="py-2 pr-3">{fmtUsd(row.estimatedKepiMarginUsd)}</td>
                  <td className="py-2 pr-3">{row.isMemberRate ? "Member" : "Free + markup"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !loading && !error ? (
        <p className="mt-4 text-sm text-slate-500">No in-app hotel checkouts recorded yet.</p>
      ) : null}
    </section>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-lg font-black">{value}</p>
      {sub ? <p className="text-[10px] text-slate-500">{sub}</p> : null}
    </div>
  );
}
