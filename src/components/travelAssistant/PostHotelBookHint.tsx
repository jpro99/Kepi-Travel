"use client";

import { useTranslations } from "next-intl";
import { buildForwardAfterBookHint } from "@/lib/travelAssistant/tripFirstMessaging";

interface PostHotelBookHintProps {
  hotelCity?: string | null;
  className?: string;
}

export function PostHotelBookHint({ hotelCity, className = "" }: PostHotelBookHintProps) {
  const t = useTranslations("BookTab");

  return (
    <section
      className={`rounded-2xl border border-sky-200 bg-sky-50/90 px-4 py-3 dark:border-sky-800 dark:bg-sky-950/30 ${className}`}
    >
      <p className="text-sm font-bold text-sky-900 dark:text-sky-100">{t("postHotelTitle")}</p>
      <p className="mt-1 text-xs leading-relaxed text-sky-800 dark:text-sky-200">
        {hotelCity
          ? t("postHotelBodyWithCity", { city: hotelCity })
          : t("postHotelBody")}
      </p>
      <p className="mt-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
        {buildForwardAfterBookHint()}
      </p>
    </section>
  );
}
