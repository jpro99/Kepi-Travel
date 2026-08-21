"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { openSupportChat } from "@/components/support/SupportChat";
import Link from "next/link";

const SUPPORT_EMAIL = "support@kepitravel.com";

export default function SupportPage() {
  const t = useTranslations("SupportPage");
  const { isSignedIn } = useAuth();

  useEffect(() => {
    if (isSignedIn) {
      openSupportChat();
    }
  }, [isSignedIn]);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 px-6 py-12">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t("title")}</h1>
      <p className="text-sm text-slate-600 dark:text-slate-300">{t("subtitle")}</p>
      {isSignedIn ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">{t("chatHint")}</p>
      ) : (
        <>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("chatHintSignedOut")}</p>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="inline-flex w-fit rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-900 dark:border-slate-600 dark:text-white"
          >
            {t("emailSupport")}
          </a>
          <Link
            href={`/sign-in?redirect_url=${encodeURIComponent("/support")}`}
            className="inline-flex w-fit rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950"
          >
            {t("signInToChat")}
          </Link>
        </>
      )}
      <Link
        href="/travel-assistant"
        className="inline-flex w-fit rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950"
      >
        {t("backToTrip")}
      </Link>
    </main>
  );
}
