"use client";

import { useState, useMemo } from "react";

interface Reservation {
  id: string;
  type: string;
  title: string;
  provider: string;
  localTime: string;
  location: string;
  confirmationCode?: string;
  roomType?: string;
  checkOutDate?: string;
  notes?: string;
}

interface HotelsTabProps {
  reservations: Reservation[];
  onReservationTap: (id: string) => void;
  onCheckStatus: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}

function fmtDate(localTime: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(localTime ?? "");
  if (!m) return "—";
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[+m[2]-1]} ${+m[3]}, ${m[1]}`;
}

function nightsCount(checkIn: string, checkOut: string): number {
  const a = Date.parse(checkIn.slice(0, 10));
  const b = Date.parse(checkOut.slice(0, 10));
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.round((b - a) / 86400_000);
}

function isPastCheckout(checkOut: string): boolean {
  const ms = Date.parse(checkOut?.slice(0, 10) ?? "");
  return !isNaN(ms) && Date.now() > ms + 86400_000;
}

// City emoji lookup
function cityEmoji(location: string): string {
  const l = location.toLowerCase();
  if (l.includes("tokyo") || l.includes("japan")) return "🗼";
  if (l.includes("paris") || l.includes("france")) return "🗼";
  if (l.includes("london")) return "🎡";
  if (l.includes("new york") || l.includes("nyc")) return "🗽";
  if (l.includes("los angeles") || l.includes("la ")) return "🌴";
  if (l.includes("hawaii") || l.includes("honolulu")) return "🌺";
  if (l.includes("dubai")) return "🏙";
  if (l.includes("singapore")) return "🦁";
  if (l.includes("sydney") || l.includes("australia")) return "🦘";
  if (l.includes("rome") || l.includes("italy")) return "🏛";
  if (l.includes("bangkok") || l.includes("thailand")) return "🐘";
  return "🏨";
}

export function HotelsTab({ reservations, onReservationTap, onCheckStatus, onDelete, onAdd }: HotelsTabProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);

  const { upcoming, past } = useMemo(() => ({
    upcoming: reservations.filter(r => !isPastCheckout(r.checkOutDate ?? r.localTime ?? "")),
    past: reservations.filter(r => isPastCheckout(r.checkOutDate ?? r.localTime ?? "")),
  }), [reservations]);

  const shown = showPast ? [...upcoming, ...past] : upcoming;

  return (
    <section className="space-y-4 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Hotels</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {upcoming.length} upcoming{past.length > 0 ? ` · ${past.length} past` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1.5 rounded-full bg-[#007AFF] px-4 py-2 text-sm font-semibold text-white shadow-sm active:opacity-80 transition-opacity"
        >
          <span className="text-base leading-none">+</span> Add
        </button>
      </div>

      {/* Empty state */}
      {shown.length === 0 && (
        <div className="rounded-3xl border border-dashed border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-10 text-center">
          <p className="text-4xl mb-3">🏨</p>
          <p className="font-semibold text-slate-900 dark:text-white">No hotels yet</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-4">
            Forward a hotel confirmation email or add manually
          </p>
          <button
            type="button"
            onClick={onAdd}
            className="rounded-full bg-[#007AFF] px-6 py-2.5 text-sm font-semibold text-white"
          >
            Add hotel
          </button>
        </div>
      )}

      {/* Hotel cards */}
      <div className="space-y-3">
        {shown.map(r => {
          const checkIn = r.localTime ?? "";
          const checkOut = r.checkOutDate ?? "";
          const nights = nightsCount(checkIn, checkOut);
          const past = isPastCheckout(checkOut);
          const isOpen = expanded === r.id;
          const emoji = cityEmoji(r.location ?? "");

          return (
            <div
              key={r.id}
              className={`overflow-hidden rounded-3xl bg-white dark:bg-slate-900 shadow-sm ring-1 transition-all ${
                past ? "ring-slate-100 dark:ring-slate-800 opacity-60" : "ring-black/[0.06] dark:ring-white/[0.08]"
              }`}
            >
              {/* Card tap area */}
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : r.id)}
                className="w-full text-left"
              >
                <div className="flex items-start gap-4 p-5">
                  {/* Emoji icon */}
                  <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-2xl shrink-0 shadow-sm">
                    {emoji}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 dark:text-white text-base leading-snug truncate">{r.title}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 truncate mt-0.5">{r.location}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <div className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Check-in</p>
                        <p className="text-xs font-bold text-slate-900 dark:text-white">{fmtDate(checkIn)}</p>
                      </div>
                      {checkOut && (
                        <div className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Check-out</p>
                          <p className="text-xs font-bold text-slate-900 dark:text-white">{fmtDate(checkOut)}</p>
                        </div>
                      )}
                      {nights > 0 && (
                        <div className="rounded-lg bg-indigo-50 dark:bg-indigo-500/20 px-2.5 py-1">
                          <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300">{nights}N</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <span className="text-slate-300 dark:text-slate-600 text-sm shrink-0 mt-1">{isOpen ? "▲" : "▼"}</span>
                </div>
              </button>

              {/* Confirmation + room */}
              <div className="flex items-center gap-4 px-5 pb-4">
                {r.confirmationCode && (
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Confirmation</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">{r.confirmationCode}</p>
                  </div>
                )}
                {r.roomType && r.roomType !== "Not set" && (
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Room type</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">{r.roomType}</p>
                  </div>
                )}
              </div>

              {/* Expanded actions */}
              {isOpen && (
                <div className="border-t border-slate-100 dark:border-slate-800 px-5 py-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onReservationTap(r.id)}
                    className="flex-1 rounded-xl bg-slate-100 dark:bg-slate-800 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 active:opacity-70"
                  >
                    View details
                  </button>
                  <button
                    type="button"
                    onClick={() => onCheckStatus(r.id)}
                    className="flex-1 rounded-xl bg-[#007AFF]/10 dark:bg-[#0A84FF]/20 py-2 text-sm font-semibold text-[#007AFF] dark:text-[#0A84FF] active:opacity-70"
                  >
                    Check status
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (window.confirm("Delete this hotel?")) onDelete(r.id); }}
                    className="rounded-xl bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-600 dark:text-red-400 active:opacity-70"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Past toggle */}
      {past.length > 0 && (
        <button
          type="button"
          onClick={() => setShowPast(v => !v)}
          className="w-full text-center text-sm font-semibold text-[#007AFF] dark:text-[#0A84FF] py-2"
        >
          {showPast ? "Hide past stays" : `Show ${past.length} past stay${past.length > 1 ? "s" : ""}`}
        </button>
      )}
    </section>
  );
}
