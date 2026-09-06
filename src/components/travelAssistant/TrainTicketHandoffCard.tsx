"use client";

import { isOpenableTicketUrl, type TrainTicketHandoffContent } from "@/lib/travelAssistant/trainTicketHandoff";

interface TrainTicketHandoffCardProps {
  content: TrainTicketHandoffContent;
  eyebrow?: string;
}

export function TrainTicketHandoffCard({ content, eyebrow = "Train tickets" }: TrainTicketHandoffCardProps) {
  const primaryUrl = isOpenableTicketUrl(content.primaryActionUrl) ? content.primaryActionUrl : null;
  const external = primaryUrl?.startsWith("http") ?? false;

  return (
    <section className="rounded-2xl bg-white px-4 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6E6E73]">{eyebrow}</p>
      <h3 className="mt-1 text-[17px] font-semibold text-[#1D1D1F]">{content.headline}</h3>
      <p className="mt-1 text-[14px] leading-relaxed text-[#6E6E73]">{content.detail}</p>
      <p className="mt-2 text-[12px] text-[#6E6E73]">{content.honestyNote}</p>
      {primaryUrl ? (
        <a
          href={primaryUrl}
          target={external ? "_blank" : undefined}
          rel={external ? "noopener noreferrer" : undefined}
          className="mt-3 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-[#007AFF] px-4 text-[17px] font-semibold text-white hover:opacity-90"
        >
          {content.primaryActionLabel}
        </a>
      ) : null}
    </section>
  );
}
