"use client";

import {
  buildReservationQuickLinks,
  buildSourceEmailViewPath,
  reservationHasSourceEmail,
  type ReservationLinkInput,
} from "@/lib/travelAssistant/reservationLinks";

interface ReservationQuickLinksProps {
  reservation: ReservationLinkInput & { id: string };
  tripId?: string | null;
  compact?: boolean;
}

export function ReservationQuickLinks({ reservation, tripId, compact = false }: ReservationQuickLinksProps) {
  const links = buildReservationQuickLinks(reservation);
  const showEmail = reservationHasSourceEmail(reservation) && tripId;
  const emailHref = showEmail ? buildSourceEmailViewPath(tripId, reservation.id) : null;

  if (links.length === 0 && !emailHref) return null;

  const chipClass = compact
    ? "rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
    : "rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";

  return (
    <div
      className={`flex flex-wrap gap-2 ${compact ? "mt-2" : "mt-3"}`}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {emailHref ? (
        <a
          href={emailHref}
          target="_blank"
          rel="noopener noreferrer"
          className={`${chipClass} border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-200`}
        >
          {reservation.hasPdfAttachment ? "Original email + PDF" : "Original email"}
        </a>
      ) : null}
      {links.map((link) => (
        <a
          key={`${link.kind}-${link.url}`}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className={chipClass}
        >
          {link.label} ↗
        </a>
      ))}
    </div>
  );
}
