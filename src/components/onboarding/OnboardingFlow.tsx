"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  EMPTY_TRIP_SETUP_DRAFT,
  TripSetupForm,
  type TripSetupDraft,
  type TripSetupValidationErrors,
  validateTripSetupDraft,
} from "@/components/onboarding/TripSetupForm";

const TOTAL_STEPS = 5;

type OnboardingResponse = {
  complete: boolean;
  currentStep: number;
  tripDraft: TripSetupDraft;
  referralCode: string;
  referralRedeemedAt: string | null;
};

interface OnboardingFlowProps {
  onCreateFirstTrip: (trip: TripSetupDraft) => void;
}

function clampStep(step: number): number {
  if (!Number.isFinite(step)) return 1;
  return Math.min(TOTAL_STEPS, Math.max(1, Math.floor(step)));
}

function createDefaultResponse(): OnboardingResponse {
  return {
    complete: false,
    currentStep: 1,
    tripDraft: EMPTY_TRIP_SETUP_DRAFT,
    referralCode: "",
    referralRedeemedAt: null,
  };
}

export function OnboardingFlow({ onCreateFirstTrip }: OnboardingFlowProps) {
  const searchParams = useSearchParams();
  const t = useTranslations("OnboardingFlow");
  const tTripSetup = useTranslations("TripSetupForm");
  const [isLoading, setIsLoading] = useState(true);
  const [isVisible, setIsVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [tripDraft, setTripDraft] = useState<TripSetupDraft>(EMPTY_TRIP_SETUP_DRAFT);
  const [tripErrors, setTripErrors] = useState<TripSetupValidationErrors>({});
  const [referralCode, setReferralCode] = useState("");
  const [referralRedeemedAt, setReferralRedeemedAt] = useState<string | null>(null);
  const [referralBusy, setReferralBusy] = useState(false);
  const [referralMessage, setReferralMessage] = useState<string | null>(null);
  const [notificationsMessage, setNotificationsMessage] = useState<string | null>(null);
  const [gmailMessage, setGmailMessage] = useState<string | null>(null);

  const [notificationsBusy, setNotificationsBusy] = useState(false);
  const [gmailBusy, setGmailBusy] = useState(false);
  const referralCodeFromUrl = useMemo(() => {
    const raw = searchParams.get("ref")?.trim().toUpperCase() ?? "";
    return /^[A-Z0-9]{8}$/u.test(raw) ? raw : "";
  }, [searchParams]);

  const localizeTripErrors = useCallback(
    (errors: TripSetupValidationErrors): TripSetupValidationErrors => {
      const localized: TripSetupValidationErrors = {};
      if (errors.tripName) {
        localized.tripName = tTripSetup("errorTripNameRequired");
      }
      if (errors.destination) {
        localized.destination = tTripSetup("errorDestinationRequired");
      }
      if (errors.departureDate) {
        localized.departureDate = tTripSetup("errorDepartureDateRequired");
      }
      return localized;
    },
    [tTripSetup],
  );

  const loadOnboardingState = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/travel-updates/onboarding", {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Onboarding API returned ${response.status}`);
      }
      const payload = (await response.json()) as Partial<OnboardingResponse>;
      const resolved = {
        ...createDefaultResponse(),
        ...payload,
      };
      if (resolved.complete) {
        setIsVisible(false);
        return;
      }
      setCurrentStep(clampStep(resolved.currentStep));
      setTripDraft({
        ...EMPTY_TRIP_SETUP_DRAFT,
        ...(resolved.tripDraft ?? {}),
      });
      const resolvedReferralCode =
        (typeof resolved.referralCode === "string" ? resolved.referralCode.trim().toUpperCase() : "") || referralCodeFromUrl;
      setReferralCode(resolvedReferralCode);
      setReferralRedeemedAt(
        typeof resolved.referralRedeemedAt === "string" && resolved.referralRedeemedAt.length > 0
          ? resolved.referralRedeemedAt
          : null,
      );
      if (resolvedReferralCode && !resolved.referralRedeemedAt) {
        setReferralMessage(t("referralCodePrefilled"));
      } else {
        setReferralMessage(null);
      }
      setIsVisible(true);
    } catch {
      setCurrentStep(1);
      setTripDraft(EMPTY_TRIP_SETUP_DRAFT);
      setReferralCode(referralCodeFromUrl);
      setReferralRedeemedAt(null);
      setReferralMessage(referralCodeFromUrl ? t("referralCodePrefilled") : null);
      setIsVisible(true);
    } finally {
      setIsLoading(false);
    }
  }, [referralCodeFromUrl, t]);

  useEffect(() => {
    let active = true;
    const run = async (): Promise<void> => {
      await loadOnboardingState();
      if (!active) return;
    };
    void run();
    return () => {
      active = false;
    };
  }, [loadOnboardingState]);

  const persistProgress = useCallback(
    async (
      nextStep: number,
      nextTripDraft: TripSetupDraft,
      nextReferralCode: string,
      nextReferralRedeemedAt: string | null,
    ): Promise<void> => {
      setIsSaving(true);
      try {
        await fetch("/api/travel-updates/onboarding", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            currentStep: clampStep(nextStep),
            tripDraft: nextTripDraft,
            referralCode: nextReferralCode.trim().toUpperCase(),
            referralRedeemedAt: nextReferralRedeemedAt,
          }),
        });
      } finally {
        setIsSaving(false);
      }
    },
    [],
  );

  const completeOnboarding = useCallback(async (): Promise<void> => {
    setIsSaving(true);
    try {
      await fetch("/api/travel-updates/onboarding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          complete: true,
        }),
      });
    } finally {
      setIsSaving(false);
      setIsVisible(false);
    }
  }, []);

  const goToStep = useCallback(
    async (nextStep: number): Promise<void> => {
      const clamped = clampStep(nextStep);
      setCurrentStep(clamped);
      await persistProgress(clamped, tripDraft, referralCode, referralRedeemedAt);
    },
    [persistProgress, referralCode, referralRedeemedAt, tripDraft],
  );

  const handleClose = useCallback(async (): Promise<void> => {
    await persistProgress(currentStep, tripDraft, referralCode, referralRedeemedAt);
    setIsVisible(false);
  }, [currentStep, persistProgress, referralCode, referralRedeemedAt, tripDraft]);

  const handleBack = useCallback(async (): Promise<void> => {
    if (currentStep <= 1) {
      return;
    }
    await goToStep(currentStep - 1);
  }, [currentStep, goToStep]);

  const handleNext = useCallback(async (): Promise<void> => {
    if (currentStep === 1 && referralCode.trim() && !referralRedeemedAt) {
      setReferralBusy(true);
      setReferralMessage(null);
      try {
        const response = await fetch("/api/referral/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: referralCode.trim().toUpperCase() }),
        });
        const payload = (await response.json()) as {
          ok?: boolean;
          reason?: string;
          error?: string;
          awarded?: { newUserDays?: number };
        };
        if (!response.ok) {
          if (payload.reason === "already-redeemed") {
            const nowIso = new Date().toISOString();
            setReferralRedeemedAt(nowIso);
            setReferralMessage(t("referralCodeAlreadyRedeemed"));
            await persistProgress(1, tripDraft, referralCode, nowIso);
          } else {
            setReferralMessage(payload.error ?? t("referralCodeInvalid"));
            return;
          }
        } else {
          const redeemedAtIso = new Date().toISOString();
          setReferralRedeemedAt(redeemedAtIso);
          setReferralMessage(
            t("referralCodeRedeemed", { days: payload.awarded?.newUserDays ?? 14 }),
          );
          await persistProgress(1, tripDraft, referralCode, redeemedAtIso);
        }
      } finally {
        setReferralBusy(false);
      }
    }

    if (currentStep === 2) {
      const errors = validateTripSetupDraft(tripDraft);
      setTripErrors(localizeTripErrors(errors));
      if (Object.keys(errors).length > 0) {
        return;
      }
      onCreateFirstTrip(tripDraft);
    }
    if (currentStep >= TOTAL_STEPS) {
      await completeOnboarding();
      return;
    }
    await goToStep(currentStep + 1);
  }, [
    completeOnboarding,
    currentStep,
    goToStep,
    localizeTripErrors,
    onCreateFirstTrip,
    persistProgress,
    referralCode,
    referralRedeemedAt,
    t,
    tripDraft,
  ]);

  const handleSkip = useCallback(async (): Promise<void> => {
    await completeOnboarding();
  }, [completeOnboarding]);

  const handleEnableNotifications = useCallback(async (): Promise<void> => {
    if (notificationsBusy) return;
    setNotificationsBusy(true);
    try {
      if (typeof window === "undefined" || !("Notification" in window)) {
        setNotificationsMessage(t("notificationsUnsupported"));
        return;
      }
      const permission =
        Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (permission === "granted") {
        setNotificationsMessage(t("notificationsEnabled"));
        return;
      }
      if (permission === "denied") {
        setNotificationsMessage(t("notificationsDenied"));
        return;
      }
      setNotificationsMessage(t("notificationsDismissed"));
    } finally {
      setNotificationsBusy(false);
    }
  }, [notificationsBusy, t]);

  const handleConnectGmail = useCallback(async (): Promise<void> => {
    if (gmailBusy) return;
    setGmailBusy(true);
    try {
      const response = await fetch("/api/travel-updates/gmail-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxResults: 1 }),
      });
      if (!response.ok) {
        const fallbackMessage = t("gmailFallbackMessage", { status: response.status });
        setGmailMessage(fallbackMessage);
        return;
      }
      setGmailMessage(t("gmailConnected"));
    } catch {
      setGmailMessage(t("gmailUnavailable"));
    } finally {
      setGmailBusy(false);
    }
  }, [gmailBusy, t]);

  const stepTitle = useMemo(() => {
    if (currentStep === 1) return t("stepWelcome");
    if (currentStep === 2) return t("stepFirstTrip");
    if (currentStep === 3) return t("stepNotifications");
    if (currentStep === 4) return t("stepGmail");
    return t("stepDone");
  }, [currentStep, t]);

  if (isLoading || !isVisible) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/80 sm:items-center sm:justify-center sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        className="flex h-full w-full flex-col border border-slate-700 bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:h-auto sm:max-h-[90vh] sm:max-w-xl sm:rounded-2xl"
      >
        <header className="border-b border-slate-200 p-4 dark:border-slate-800">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-cyan-600 dark:text-cyan-300">
                {t("stepCounter", { currentStep, totalSteps: TOTAL_STEPS })}
              </p>
              <h2 id="onboarding-title" className="mt-1 text-lg font-semibold">
                {stepTitle}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => {
                void handleClose();
              }}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-900"
            >
              {t("close")}
            </button>
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-cyan-500 transition-[width] duration-300"
              style={{ width: `${(currentStep / TOTAL_STEPS) * 100}%` }}
            />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          {currentStep === 1 ? (
            <div className="space-y-3 text-sm">
              <p className="text-slate-700 dark:text-slate-300">
                {t("welcomeDescription")}
              </p>
              <ul className="list-disc space-y-1 pl-5 text-slate-700 dark:text-slate-300">
                <li>{t("welcomeBulletOne")}</li>
                <li>{t("welcomeBulletTwo")}</li>
                <li>{t("welcomeBulletThree")}</li>
              </ul>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t("referralCodeLabel")}
                </span>
                <input
                  value={referralCode}
                  onChange={(event) => {
                    const nextCode = event.target.value.toUpperCase().replace(/[^A-Z0-9]/gu, "").slice(0, 8);
                    const normalizedCurrent = referralCode.trim().toUpperCase();
                    setReferralCode(nextCode);
                    setReferralMessage(null);
                    if (nextCode.length === 0 || nextCode !== normalizedCurrent) {
                      setReferralRedeemedAt(null);
                    }
                  }}
                  placeholder={t("referralCodePlaceholder")}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-cyan-300 transition focus-visible:ring-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("referralCodeHint")}</p>
                {referralMessage ? (
                  <p className="mt-1 text-xs text-cyan-700 dark:text-cyan-300">{referralMessage}</p>
                ) : null}
              </label>
            </div>
          ) : null}

          {currentStep === 2 ? (
            <TripSetupForm
              value={tripDraft}
              errors={tripErrors}
              onChange={(nextDraft) => {
                setTripDraft(nextDraft);
                if (Object.keys(tripErrors).length > 0) {
                  setTripErrors(localizeTripErrors(validateTripSetupDraft(nextDraft)));
                }
              }}
            />
          ) : null}

          {currentStep === 3 ? (
            <div className="space-y-3 text-sm">
              <p className="text-slate-700 dark:text-slate-300">
                {t("notificationsDescription")}
              </p>
              <button
                type="button"
                onClick={() => {
                  void handleEnableNotifications();
                }}
                disabled={notificationsBusy}
                className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {notificationsBusy ? t("requesting") : t("enableNotifications")}
              </button>
              {notificationsMessage ? <p className="text-xs text-slate-600 dark:text-slate-400">{notificationsMessage}</p> : null}
            </div>
          ) : null}

          {currentStep === 4 ? (
            <div className="space-y-3 text-sm">
              <p className="text-slate-700 dark:text-slate-300">
                {t("gmailDescription")}
              </p>
              <button
                type="button"
                onClick={() => {
                  void handleConnectGmail();
                }}
                disabled={gmailBusy}
                className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {gmailBusy ? t("connecting") : t("connectGmail")}
              </button>
              {gmailMessage ? <p className="text-xs text-slate-600 dark:text-slate-400">{gmailMessage}</p> : null}
            </div>
          ) : null}

          {currentStep === 5 ? (
            <div className="space-y-3 text-sm">
              <p className="text-slate-700 dark:text-slate-300">
                {t("doneDescription")}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400">{t("doneHint")}</p>
            </div>
          ) : null}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-slate-200 p-4 dark:border-slate-800">
          <button
            type="button"
            disabled={currentStep === 1 || isSaving || referralBusy}
            onClick={() => {
              void handleBack();
            }}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-900"
          >
            {t("back")}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isSaving || referralBusy}
              onClick={() => {
                void handleSkip();
              }}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-900"
            >
              {t("skip")}
            </button>
            <button
              type="button"
              disabled={isSaving || referralBusy}
              onClick={() => {
                void handleNext();
              }}
              className="rounded-md bg-cyan-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {referralBusy ? t("redeemingReferralCode") : currentStep === TOTAL_STEPS ? t("start") : t("next")}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
