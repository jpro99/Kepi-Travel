"use client";

import type { ReactNode } from "react";

export interface FlightCardProps {
  airline: string;
  flightNumber: string;
  departure: string;
  arrival: string;
  departureTime: string;
  arrivalTime: string;
  price?: string;
  addMiles?: boolean;
  className?: string;
  onClick?: () => void;
  badge?: ReactNode;
  gateLine?: string;
  children?: ReactNode;
  /** Stacked layout for mobile app — no stretched airport columns */
  mobile?: boolean;
}

export function FlightCard({
  airline,
  flightNumber,
  departure,
  arrival,
  departureTime,
  arrivalTime,
  price,
  addMiles = false,
  className = "",
  onClick,
  badge,
  gateLine,
  children,
  mobile = false,
}: FlightCardProps) {
  const shell = `apple-card overflow-hidden ${className}`.trim();
  const pad = mobile ? "p-5" : "p-5";

  const header = mobile ? (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[20px] font-bold leading-snug text-[var(--apple-text)]">{airline}</p>
          <p className="mt-1.5 text-[17px] leading-snug text-[var(--apple-text-secondary)]">
            {flightNumber || `${departure} → ${arrival}`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {badge ?? (price ? <p className="text-[20px] font-bold text-[var(--apple-text)]">{price}</p> : null)}
        </div>
      </div>

      <p className="mt-4 text-[19px] font-semibold leading-snug text-[var(--apple-text)]">
        {departureTime}
        {arrivalTime && arrivalTime !== "—" ? (
          <span className="font-normal text-[var(--apple-text-secondary)]"> → {arrivalTime}</span>
        ) : null}
      </p>

      {gateLine ? <p className="mt-2 text-[17px] font-semibold text-[var(--apple-accent)]">{gateLine}</p> : null}

      {addMiles ? (
        <span className="mt-3 inline-block rounded-full bg-[var(--bg-grouped)] px-3.5 py-2 text-[15px] font-bold text-[var(--apple-accent)]">
          Add Miles / Cash
        </span>
      ) : null}
    </>
  ) : (
    <>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[17px] font-semibold text-[var(--apple-text)]">{airline}</p>
          <p className="mt-0.5 text-sm text-[var(--apple-text-secondary)]">{flightNumber}</p>
        </div>

        {badge ?? (price ? <p className="text-[17px] font-semibold text-[var(--apple-text)]">{price}</p> : null)}
      </div>

      <div className="mt-5 flex items-center gap-4">
        <div className="flex-1">
          <p className="text-2xl font-semibold tracking-tight text-[var(--apple-text)]">{departure}</p>
          <p className="text-sm text-[var(--apple-text-secondary)]">{departureTime}</p>
        </div>

        <div className="flex flex-col items-center px-1">
          <div className="relative h-px w-6 bg-[var(--apple-border)]">
            <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-xs text-[var(--apple-text-secondary)]">
              →
            </span>
          </div>
        </div>

        <div className="flex-1 text-right">
          <p className="text-2xl font-semibold tracking-tight text-[var(--apple-text)]">{arrival}</p>
          <p className="text-sm text-[var(--apple-text-secondary)]">{arrivalTime}</p>
        </div>
      </div>

      {gateLine ? <p className="mt-3 text-[15px] text-[var(--apple-accent)]">{gateLine}</p> : null}

      {addMiles ? (
        <span className="mt-4 inline-block rounded-full bg-[var(--bg-grouped)] px-3 py-1 text-xs font-medium text-[var(--apple-accent)]">
          Add Miles / Cash
        </span>
      ) : null}
    </>
  );

  return (
    <div className={shell}>
      {onClick ? (
        <button type="button" onClick={onClick} className={`w-full ${pad} text-left touch-manipulation`}>
          {header}
        </button>
      ) : (
        <div className={pad}>{header}</div>
      )}
      {children}
    </div>
  );
}
