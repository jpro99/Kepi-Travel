"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { openSupportChat } from "@/components/support/SupportChat";
import Link from "next/link";

export default function SupportPage() {
  const t = useTranslations("SupportPage");

  useEffect(() => {
    openSupportChat();
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 px-6 py-12">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t("title")}</h1>
      <p className="text-sm text-slate-600 dark:text-slate-300">{t("subtitle")}</p>
      <p className="text-sm text-slate-500 dark:text-slate-400">{t("chatHint")}</p>
      <Link
        href="/travel-assistant"
        className="inline-flex w-fit rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950"
      >
        {t("backToTrip")}
      </Link>
    </main>
  );
}
