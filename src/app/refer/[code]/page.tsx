import Link from "next/link";
import { getTranslations } from "next-intl/server";

type PageProps = {
  params: Promise<{ code: string }>;
};

function normalizeReferralCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/gu, "").slice(0, 8);
}

export default async function ReferralLandingPage({ params }: PageProps) {
  const t = await getTranslations("ReferralLandingPage");
  const { code } = await params;
  const normalizedCode = normalizeReferralCode(code);
  const travelAssistantPath = `/travel-assistant?ref=${encodeURIComponent(normalizedCode)}`;
  const signUpHref = `/sign-up?redirect_url=${encodeURIComponent(travelAssistantPath)}`;

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <section className="mx-auto w-full max-w-4xl rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900/80 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700 dark:text-cyan-300">
          {t("badge")}
        </p>
        <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">{t("title")}</h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-600 dark:text-slate-300 sm:text-base">
          {t("subtitle")}
        </p>

        <div className="mt-5 inline-flex rounded-full border border-cyan-400/50 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-800 dark:text-cyan-200">
          {t("codeApplied", { code: normalizedCode || "--------" })}
        </div>

        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          <li className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-950/70">
            {t("featureOne")}
          </li>
          <li className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-950/70">
            {t("featureTwo")}
          </li>
          <li className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-950/70">
            {t("featureThree")}
          </li>
          <li className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-950/70">
            {t("featureFour")}
          </li>
        </ul>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link
            href={signUpHref}
            className="inline-flex items-center justify-center rounded-xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            {t("cta")}
          </Link>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("ctaHint")}</p>
        </div>
      </section>
    </main>
  );
}
