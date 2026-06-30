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
}: FlightCardProps) {
  const header = (
    <>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[17px] font-semibold text-apple-text">{airline}</p>
          <p className="mt-0.5 text-sm text-apple-text-secondary">{flightNumber}</p>
        </div>

        {badge ?? (price ? <p className="text-[17px] font-semibold text-apple-text">{price}</p> : null)}
      </div>

      <div className="mt-5 flex items-center gap-4">
        <div className="flex-1">
          <p className="text-2xl font-semibold tracking-tight text-apple-text">{departure}</p>
          <p className="text-sm text-apple-text-secondary">{departureTime}</p>
        </div>

        <div className="flex flex-col items-center px-1">
          <div className="relative h-px w-6 bg-[var(--apple-border)]">
            <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-xs text-apple-text-secondary">
              →
            </span>
          </div>
        </div>

        <div className="flex-1 text-right">
          <p className="text-2xl font-semibold tracking-tight text-apple-text">{arrival}</p>
          <p className="text-sm text-apple-text-secondary">{arrivalTime}</p>
        </div>
      </div>

      {gateLine ? <p className="mt-3 text-[15px] apple-accent">{gateLine}</p> : null}

      {addMiles ? (
        <span className="mt-4 inline-block rounded-full bg-[var(--bg-grouped)] px-3 py-1 text-xs font-medium apple-accent">
          Add Miles / Cash
        </span>
      ) : null}
    </>
  );

  return (
    <div className={`apple-card overflow-hidden ${className}`.trim()}>
      {onClick ? (
        <button type="button" onClick={onClick} className="w-full p-5 text-left">
          {header}
        </button>
      ) : (
        <div className="p-5">{header}</div>
      )}
      {children}
    </div>
  );
}
