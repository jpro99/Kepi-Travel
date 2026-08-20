"use client";

import { useEffect, useMemo, useState } from "react";
import type { LifetimeAccountingSummary, TripAccountingRow } from "@/lib/travelAssistant/tripAccounting";
import { buildTripLedgerCsv, groupLedgerLineItems } from "@/lib/travelAssistant/tripAccounting";
import type { TripSpendLineItem, TripSpendSummary } from "@/lib/travelAssistant/tripSpendSummary";
import {
  formatTripCashTotal,
  formatTripPointsTotal,
} from "@/lib/travelAssistant/tripSpendSummary";
import { ImportConfirmationDropzone } from "@/components/travelAssistant/ImportConfirmationDropzone";

type LedgerView = "this-trip" | "all-trips";

interface TripLedgerSheetProps {
  open: boolean;
  activeTripId: string | null;
  activeTripLabel: string;
  summary: TripSpendSummary;
  lineItems: TripSpendLineItem[];
  lifetimeAccounting: LifetimeAccountingSummary;
  onClose: () => void;
  onOpenReservation?: (id: string, tripId?: string) => void;
  onSelectTrip?: (tripId: string) => void;
  /** Drop a receipt right where the missing prices are (G42). */
  onImportConfirmation?: (file: File) => void;
  importBusy?: boolean;
}

function lineLabel(item: TripSpendLineItem): string {
  return item.label?.trim() || item.title;
}

function PriceCell({ item }: { item: TripSpendLineItem }) {
  if (item.needsPrice) {
    return <span className="shrink-0 text-[13px] font-semibold text-[#C93400]">Add price</span>;
  }
  return (
    <span className="shrink-0 text-right text-[14px] font-semibold tabular-nums text-[#1D1D1F]">
      {item.cashUsd != null ? formatTripCashTotal(item.cashUsd) : null}
      {item.cashUsd != null && item.points != null ? " · " : null}
      {item.points != null ? formatTripPointsTotal(item.points) : null}
      {item.cashUsd == null && item.points == null ? "—" : null}
    </span>
  );
}

function LedgerRow({
  item,
  onTap,
}: {
  item: TripSpendLineItem;
  onTap: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onTap}
        className={`flex min-h-[52px] w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left ${
          item.needsPrice ? "bg-[#FFF4E5]" : "bg-[#F5F5F7]"
        }`}
      >
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-[#1D1D1F]">{lineLabel(item)}</p>
          {item.confirmationCode ? (
            <p className="text-[12px] text-[#6E6E73]">
              {item.confirmationCode}
              {item.groupSize != null && item.groupSize > 1
                ? ` · ${item.groupSize} flights`
                : ""}
            </p>
          ) : item.groupSize != null && item.groupSize > 1 ? (
            <p className="text-[12px] text-[#6E6E73]">{item.groupSize} flights</p>
          ) : null}
        </div>
        <PriceCell item={item} />
      </button>
    </li>
  );
}

function TripLineItemsPanel({
  trip,
  onOpenReservation,
  onBack,
}: {
  trip: TripAccountingRow;
  onOpenReservation?: (id: string, tripId: string) => void;
  onBack?: () => void;
}) {
  const groups = useMemo(() => groupLedgerLineItems(trip.lineItems), [trip.lineItems]);
  const missing = trip.summary.missingPriceCount;

  return (
    <>
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="mb-3 text-[15px] font-semibold text-[#007AFF]"
        >
          ← All trips
        </button>
      ) : null}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6E6E73]">{trip.tripDates}</p>
        <h4 className="mt-1 text-[20px] font-semibold text-[#1D1D1F]">{trip.tripLabel}</h4>
        <p className="mt-1 text-[15px] text-[#6E6E73]">
          {formatTripCashTotal(trip.summary.cashTotalUsd)}
          {trip.summary.pointsTotal > 0 ? ` · ${formatTripPointsTotal(trip.summary.pointsTotal)}` : ""}
          {missing > 0 ? ` · ${missing} need pricing` : ""}
        </p>
      </div>
      {groups.map((group) => (
        <section key={group.type} className="mt-5">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-[#6E6E73]">{group.label}</p>
          <ul className="mt-2 space-y-2">
            {group.items.map((item) => (
              <LedgerRow
                key={item.id}
                item={item}
                onTap={() => onOpenReservation?.(item.id, trip.tripId)}
              />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

export function TripLedgerSheet({
  open,
  activeTripId,
  activeTripLabel,
  summary,
  lineItems,
  lifetimeAccounting,
  onClose,
  onOpenReservation,
  onSelectTrip,
  onImportConfirmation,
  importBusy = false,
}: TripLedgerSheetProps) {
  const [view, setView] = useState<LedgerView>("this-trip");
  const [drillTripId, setDrillTripId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setView("this-trip");
      setDrillTripId(null);
    }
  }, [open]);

  const activeTripRow = useMemo(
    () => lifetimeAccounting.trips.find((t) => t.tripId === activeTripId) ?? null,
    [lifetimeAccounting.trips, activeTripId],
  );

  const displayLineItems = activeTripRow?.lineItems ?? lineItems;
  const displaySummary = activeTripRow?.summary ?? summary;
  const drillTrip = drillTripId
    ? lifetimeAccounting.trips.find((t) => t.tripId === drillTripId) ?? null
    : null;

  const groupedThisTrip = useMemo(
    () => groupLedgerLineItems(displayLineItems),
    [displayLineItems],
  );

  if (!open) return null;

  const handleExportCsv = (): void => {
    const csv = buildTripLedgerCsv(lifetimeAccounting);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `kepi-trip-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-[140] flex items-end bg-black/40 sm:items-center sm:justify-center sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white sm:max-w-lg sm:rounded-3xl"
        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="trip-ledger-title"
      >
        <header className="shrink-0 border-b border-[#E5E5EA] px-5 pb-4 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6E6E73]">
                Trip accounting
              </p>
              <h3 id="trip-ledger-title" className="mt-1 text-[22px] font-semibold text-[#1D1D1F]">
                {view === "all-trips" && !drillTrip
                  ? formatTripCashTotal(lifetimeAccounting.cashTotalUsd)
                  : formatTripCashTotal(displaySummary.cashTotalUsd)}
              </h3>
              <p className="mt-1 text-[15px] text-[#6E6E73]">
                {view === "all-trips" && !drillTrip ? (
                  <>
                    {lifetimeAccounting.tripCount} trip{lifetimeAccounting.tripCount === 1 ? "" : "s"} ·{" "}
                    {lifetimeAccounting.pointsTotal > 0
                      ? `${formatTripPointsTotal(lifetimeAccounting.pointsTotal)} lifetime`
                      : "cash logged"}
                    {lifetimeAccounting.missingPriceCount > 0
                      ? ` · ${lifetimeAccounting.missingPriceCount} need pricing`
                      : ""}
                  </>
                ) : displaySummary.missingPriceCount > 0 ? (
                  `${displaySummary.missingPriceCount} still need cash or miles logged.`
                ) : (
                  "Every tracked booking has a price."
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] shrink-0 rounded-full px-3 text-[15px] font-semibold text-[#007AFF]"
            >
              Close
            </button>
          </div>

          {!drillTrip ? (
            <div className="mt-4 flex rounded-xl bg-[#F5F5F7] p-1">
              {(
                [
                  ["this-trip", "This trip"],
                  ["all-trips", "All trips"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setView(id)}
                  className={`flex-1 rounded-lg py-2 text-[13px] font-semibold ${
                    view === id ? "bg-white text-[#1D1D1F] shadow-sm" : "text-[#6E6E73]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4" style={{ WebkitOverflowScrolling: "touch" }}>
          {drillTrip ? (
            <TripLineItemsPanel
              trip={drillTrip}
              onBack={() => setDrillTripId(null)}
              onOpenReservation={(id, tripId) => {
                onClose();
                if (tripId !== activeTripId) {
                  onSelectTrip?.(tripId);
                }
                onOpenReservation?.(id, tripId);
              }}
            />
          ) : view === "this-trip" ? (
            <>
              <p className="text-[15px] font-medium text-[#1D1D1F]">{activeTripLabel}</p>
              {onImportConfirmation && displaySummary.missingPriceCount > 0 ? (
                <div className="mt-3 rounded-2xl bg-[#F5F5F7] p-3">
                  <p className="mb-2 text-[13px] text-[#6E6E73]">
                    Drop the airline receipt (PDF, screenshot, or email) and Kepi prices every flight
                    on that confirmation.
                  </p>
                  <ImportConfirmationDropzone
                    compact
                    busy={importBusy}
                    onFile={onImportConfirmation}
                  />
                </div>
              ) : null}
              {groupedThisTrip.map((group) => (
                <section key={group.type} className="mt-5">
                  <p className="text-[13px] font-semibold uppercase tracking-wide text-[#6E6E73]">
                    {group.label}
                  </p>
                  <ul className="mt-2 space-y-2">
                    {group.items.map((item) => (
                      <LedgerRow
                        key={item.id}
                        item={item}
                        onTap={() => {
                          onClose();
                          onOpenReservation?.(item.id, activeTripId ?? undefined);
                        }}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-[13px] text-[#6E6E73]">
                  Running total across all trips — for family records and taxes.
                </p>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="shrink-0 rounded-full bg-[#007AFF] px-4 py-2 text-[13px] font-semibold text-white"
                >
                  Export CSV
                </button>
              </div>
              <ul className="space-y-2">
                {lifetimeAccounting.trips.map((trip) => (
                  <li key={trip.tripId}>
                    <button
                      type="button"
                      onClick={() => setDrillTripId(trip.tripId)}
                      className="flex min-h-[56px] w-full items-center justify-between gap-3 rounded-2xl bg-[#F5F5F7] px-4 py-3 text-left"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-semibold text-[#1D1D1F]">
                          {trip.tripLabel}
                          {trip.isActive ? (
                            <span className="ml-2 text-[11px] font-bold uppercase text-[#007AFF]">Active</span>
                          ) : trip.isPast ? (
                            <span className="ml-2 text-[11px] font-bold uppercase text-[#6E6E73]">Past</span>
                          ) : null}
                        </p>
                        <p className="text-[12px] text-[#6E6E73]">{trip.tripDates}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[14px] font-semibold tabular-nums text-[#1D1D1F]">
                          {formatTripCashTotal(trip.summary.cashTotalUsd)}
                        </p>
                        {trip.summary.pointsTotal > 0 ? (
                          <p className="text-[11px] text-[#007AFF]">
                            {formatTripPointsTotal(trip.summary.pointsTotal)}
                          </p>
                        ) : null}
                        {trip.summary.missingPriceCount > 0 ? (
                          <p className="text-[11px] font-semibold text-[#C93400]">
                            {trip.summary.missingPriceCount} need price
                          </p>
                        ) : null}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}