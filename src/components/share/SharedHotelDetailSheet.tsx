"use client";

import type { SharedHotelContact } from "@/lib/travelAssistant/sharedHotelInfo";
import {
  appleBtnPrimary,
  appleBtnSecondary,
  appleCaption,
  appleCard,
  appleCardTitle,
  appleLabel,
  appleMetadata,
} from "@/lib/ui/appleDesign";

interface SharedHotelDetailSheetProps {
  contact: SharedHotelContact;
  onClose: () => void;
}

export function SharedHotelDetailSheet({ contact, onClose }: SharedHotelDetailSheetProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-3 backdrop-blur-sm">
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
        className={`relative z-10 w-full max-w-md p-5 shadow-2xl ${appleCard}`}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={appleLabel}>Hotel</p>
            <h2 id="shared-hotel-detail-title" className={`${appleCardTitle} mt-1 text-[22px] leading-tight`}>
              {contact.hotelName}
            </h2>
            {contact.provider && contact.provider !== contact.hotelName ? (
              <p className={`${appleMetadata} mt-0.5`}>{contact.provider}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] shrink-0 rounded-[10px] px-3 text-[15px] font-semibold text-[#007AFF]"
          >
            Close
          </button>
        </div>

        <div className="space-y-3 text-[15px]">
          <div className="rounded-[14px] bg-[#F5F5F7] p-3">
            <p className={appleLabel}>Address</p>
            {contact.address ? (
              <p className="mt-1 leading-relaxed text-[#1D1D1F]">{contact.address}</p>
            ) : (
              <p className={`${appleCaption} mt-1`}>Address not on file — use Open in Maps below.</p>
            )}
          </div>

          <div className="rounded-[14px] bg-[#F5F5F7] p-3">
            <p className={appleLabel}>Phone</p>
            {contact.phone ? (
              <a
                href={contact.phoneTelHref ?? undefined}
                className="mt-1 inline-flex min-h-[48px] items-center text-[17px] font-semibold text-[#007AFF]"
              >
                {contact.phone}
              </a>
            ) : (
              <p className={`${appleCaption} mt-1`}>Phone not on file — call the front desk via the hotel chain or Open in Maps.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-[14px] bg-[#F5F5F7] p-3">
              <p className={appleLabel}>Check-in</p>
              <p className="mt-1 font-semibold text-[#1D1D1F]">{contact.checkInLabel}</p>
              {contact.checkInTimeLabel ? (
                <p className={appleCaption}>{contact.checkInTimeLabel}</p>
              ) : null}
            </div>
            <div className="rounded-[14px] bg-[#F5F5F7] p-3">
              <p className={appleLabel}>Check-out</p>
              <p className="mt-1 font-semibold text-[#1D1D1F]">{contact.checkOutLabel}</p>
            </div>
          </div>

          {contact.roomType ? (
            <div className="rounded-[14px] bg-[#F5F5F7] p-3">
              <p className={appleLabel}>Room</p>
              <p className="mt-1 text-[#1D1D1F]">{contact.roomType}</p>
            </div>
          ) : null}

          {contact.confirmationCode ? (
            <div className="rounded-[14px] bg-[#F5F5F7] p-3">
              <p className={appleLabel}>Confirmation</p>
              <p className="mt-1 font-mono font-semibold tracking-wide text-[#1D1D1F]">{contact.confirmationCode}</p>
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex flex-col gap-2">
          {contact.phoneTelHref ? (
            <a
              href={contact.phoneTelHref}
              className={`flex min-h-[52px] items-center justify-center ${appleBtnPrimary}`}
            >
              Call hotel
            </a>
          ) : null}
          <a
            href={contact.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex min-h-[52px] items-center justify-center ${appleBtnSecondary}`}
          >
            Open in Maps
          </a>
        </div>
      </section>
    </div>
  );
}
