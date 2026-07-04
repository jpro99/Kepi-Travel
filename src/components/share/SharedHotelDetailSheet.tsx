"use client";

import type { SharedHotelContact } from "@/lib/travelAssistant/sharedHotelInfo";

interface SharedHotelDetailSheetProps {
  contact: SharedHotelContact;
  onClose: () => void;
}

export function SharedHotelDetailSheet({ contact, onClose }: SharedHotelDetailSheetProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-3 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close hotel details"
        className="absolute inset-0"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="shared-hotel-detail-title"
        className="relative z-10 w-full max-w-md rounded-2xl border border-slate-700 bg-[#161b22] p-5 text-[#e6edf3] shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-300">Hotel · Emergency info</p>
            <h2 id="shared-hotel-detail-title" className="mt-1 text-xl font-black leading-tight">
              {contact.hotelName}
            </h2>
            {contact.provider && contact.provider !== contact.hotelName ? (
              <p className="mt-0.5 text-sm text-slate-400">{contact.provider}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-slate-600 px-2.5 py-1 text-xs font-semibold text-slate-300"
          >
            Close
          </button>
        </div>

        <div className="space-y-3 text-sm">
          <div className="rounded-xl border border-slate-700 bg-[#0d1117] p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Address</p>
            {contact.address ? (
              <p className="mt-1 leading-relaxed text-slate-200">{contact.address}</p>
            ) : (
              <p className="mt-1 text-slate-500">Address not on file — use Open in Maps below.</p>
            )}
          </div>

          <div className="rounded-xl border border-slate-700 bg-[#0d1117] p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Phone</p>
            {contact.phone ? (
              <a
                href={contact.phoneTelHref ?? undefined}
                className="mt-1 inline-flex min-h-[44px] items-center text-lg font-bold text-[#007AFF] hover:underline"
              >
                📞 {contact.phone}
              </a>
            ) : (
              <p className="mt-1 text-slate-500">Phone not on file — call the front desk via the hotel chain or Open in Maps.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-slate-700 bg-[#0d1117] p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Check-in</p>
              <p className="mt-1 font-semibold">{contact.checkInLabel}</p>
              {contact.checkInTimeLabel ? (
                <p className="text-xs text-slate-400">{contact.checkInTimeLabel}</p>
              ) : null}
            </div>
            <div className="rounded-xl border border-slate-700 bg-[#0d1117] p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Check-out</p>
              <p className="mt-1 font-semibold">{contact.checkOutLabel}</p>
            </div>
          </div>

          {contact.roomType ? (
            <div className="rounded-xl border border-slate-700 bg-[#0d1117] p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Room</p>
              <p className="mt-1">{contact.roomType}</p>
            </div>
          ) : null}

          {contact.confirmationCode ? (
            <div className="rounded-xl border border-slate-700 bg-[#0d1117] p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Confirmation</p>
              <p className="mt-1 font-mono font-semibold tracking-wide">{contact.confirmationCode}</p>
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex flex-col gap-2">
          {contact.phoneTelHref ? (
            <a
              href={contact.phoneTelHref}
              className="flex min-h-[52px] items-center justify-center rounded-xl bg-[#007AFF] text-base font-bold text-white hover:bg-[#0066DD]"
            >
              Call hotel
            </a>
          ) : null}
          <a
            href={contact.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-[52px] items-center justify-center rounded-xl border border-slate-600 bg-[#0d1117] text-base font-bold text-sky-300 hover:bg-slate-900"
          >
            Open in Maps
          </a>
        </div>
      </section>
    </div>
  );
}
