import Link from "next/link";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { detectLocaleFromAcceptLanguage } from "@/i18n/locales";
import { getSharedTrip } from "@/lib/travelAssistant/tripShareStore";

type PageProps = {
  params: Promise<{ token: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const shared = await getSharedTrip(token);
  if (shared.status !== "ok") {
    return {
      title: "Shared Itinerary",
    };
  }
  return {
    title: `${shared.trip.name} — Shared Itinerary`,
    description: `Shared trip to ${shared.trip.destination} from ${shared.trip.startDate} to ${shared.trip.endDate}.`,
  };
}

function FriendlyError({
  title,
  message,
  ctaLabel,
}: {
  title: string;
  message: string;
  ctaLabel: string;
}) {
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <section className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white/90 p-6 dark:border-slate-700 dark:bg-slate-900/70">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{message}</p>
        <div className="mt-5">
          <Link
            href="/"
            className="inline-flex items-center rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
          >
            {ctaLabel}
          </Link>
        </div>
      </section>
    </main>
  );
}

export default async function SharedTripPage({ params }: PageProps) {
  const headerStore = await headers();
  const locale = detectLocaleFromAcceptLanguage(headerStore.get("accept-language"));
  const t = await getTranslations({ locale, namespace: "SharePage" });
  const { token } = await params;
  const shared = await getSharedTrip(token);

  if (shared.status === "invalid" || shared.status === "missing-trip") {
    return (
      <FriendlyError
        title={t("invalidTitle")}
        message={t("invalidMessage")}
        ctaLabel={t("friendlyErrorCta")}
      />
    );
  }

  if (shared.status === "expired") {
    return (
      <FriendlyError
        title={t("expiredTitle")}
        message={t("expiredMessage")}
        ctaLabel={t("friendlyErrorCta")}
      />
    );
  }

  if (shared.status === "revoked") {
    return (
      <FriendlyError
        title={t("revokedTitle")}
        message={t("revokedMessage")}
        ctaLabel={t("friendlyErrorCta")}
      />
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <section className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
        <p className="text-xs font-semibold uppercase tracking-wide text-cyan-600 dark:text-cyan-300">
          {t("sharedItineraryBadge")}
        </p>
        <h1 className="mt-2 text-2xl font-semibold">{shared.trip.name}</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {shared.trip.destination} • {shared.trip.startDate} - {shared.trip.endDate}
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {t("accessExpires", { date: new Date(shared.expiresAt).toLocaleString() })}
        </p>

        <div className="mt-5 space-y-3">
          {shared.trip.reservations.length > 0 ? (
            shared.trip.reservations.map((reservation) => (
              <article
                key={reservation.id}
                className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/70"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {reservation.type} • {reservation.provider}
                    </p>
                    <h2 className="text-sm font-semibold">{reservation.title}</h2>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      reservation.critical
                        ? "bg-red-500/20 text-red-200"
                        : reservation.confidence === "high"
                          ? "bg-emerald-500/20 text-emerald-200"
                          : reservation.confidence === "medium"
                            ? "bg-amber-500/20 text-amber-200"
                            : "bg-red-500/20 text-red-200"
                    }`}
                  >
                    {reservation.critical ? t("critical") : reservation.confidence}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-700 dark:text-slate-300">
                  {reservation.localTime} ({reservation.timezone})
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400">{reservation.location}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {t("confirmation", { code: reservation.confirmationCode })}
                </p>
                {shared.options.showPersonalNotes && reservation.notes ? (
                  <p className="mt-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                    {t("notes", { notes: reservation.notes })}
                  </p>
                ) : null}
              </article>
            ))
          ) : (
            <p className="rounded-xl border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
              {t("noReservations")}
            </p>
          )}
        </div>

        <div className="mt-8 rounded-xl border border-cyan-400/30 bg-cyan-500/10 p-4">
          <h3 className="text-sm font-semibold text-cyan-900 dark:text-cyan-100">{t("ctaTitle")}</h3>
          <p className="mt-1 text-xs text-cyan-800 dark:text-cyan-200/90">
            {t("ctaSubtitle")}
          </p>
          <Link
            href="/"
            className="mt-3 inline-flex items-center rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
          >
            {t("ctaButton")}
          </Link>
        </div>
      </section>
    </main>
  );
}
