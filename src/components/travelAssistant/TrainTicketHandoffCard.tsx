"use client";

import { isOpenableTicketUrl, type TrainTicketHandoffContent } from "@/lib/travelAssistant/trainTicketHandoff";

interface TrainTicketHandoffCardProps {
  content: TrainTicketHandoffContent;
}

export function TrainTicketHandoffCard({ content }: TrainTicketHandoffCardProps) {
  const primaryUrl = isOpenableTicketUrl(content.primaryActionUrl) ? content.primaryActionUrl : null;
  const external = primaryUrl?.startsWith("http") ?? false;

  return (
    <section className="rounded-2xl border border-teal-500/25 bg-teal-50 px-4 py-3 dark:border-teal-400/30 dark:bg-teal-950/30">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Train today
      </p>
      <h3 className="mt-1 text-base font-bold text-slate-900 dark:text-white">{content.headline}</h3>
      <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{content.detail}</p>
      <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">{content.honestyNote}</p>
      {primaryUrl ? (
        <a
          href={primaryUrl}
          target={external ? "_blank" : undefined}
          rel={external ? "noopener noreferrer" : undefined}
          className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-xl bg-[#007AFF] px-4 text-[17px] font-semibold text-white hover:opacity-90"
        >
          {content.primaryActionLabel}
        </a>
      ) : null}
    </section>
  );
}
