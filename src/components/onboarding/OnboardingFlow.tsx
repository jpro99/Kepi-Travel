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
import { Logo } from "@/components/ui/Logo";

const TOTAL_STEPS = 5;

type OnboardingResponse = {
  complete: boolean;
  notificationsSeen?: boolean;
  currentStep: number;
  tripDraft: TripSetupDraft;
  inviteCode: string;
  inviteRedeemedAt: string | null;
  referralCode: string;
  referralRedeemedAt: string | null;
};

type EmailForwardSetupStatus = {
  forwardAddress: string | null;
  handle?: string | null;
  canChangeHandle?: boolean;
  nextHandleChangeAt?: string | null;
  gmailConnected: boolean;
};

interface OnboardingFlowProps {
  onCreateFirstTrip: (trip: TripSetupDraft) => void;
}

const NOTIFICATIONS_SEEN_COOKIE_NAME = "kepi-onboarding-notifications-seen";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function readCookieValue(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const parts = document.cookie.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [rawName, ...rawValueParts] = trimmed.split("=");
    if (rawName !== name) continue;
    return decodeURIComponent(rawValueParts.join("="));
  }
  return null;
}

function notificationsSeenCookiePresent(): boolean {
  return readCookieValue(NOTIFICATIONS_SEEN_COOKIE_NAME) === "1";
}

function setNotificationsSeenCookie(): void {
  if (typeof document === "undefined") {
    return;
  }
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${NOTIFICATIONS_SEEN_COOKIE_NAME}=1; Max-Age=${ONE_YEAR_SECONDS}; Path=/; SameSite=Lax${secure}`;
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
    inviteCode: "",
    inviteRedeemedAt: null,
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
  const [inviteCode, setInviteCode] = useState("");
  const [inviteRedeemedAt, setInviteRedeemedAt] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState("");
  const [referralRedeemedAt, setReferralRedeemedAt] = useState<string | null>(null);
  const [referralBusy, setReferralBusy] = useState(false);
  const [referralMessage, setReferralMessage] = useState<string | null>(null);
  const [notificationsMessage, setNotificationsMessage] = useState<string | null>(null);
  const [gmailMessage, setGmailMessage] = useState<string | null>(null);

  const [notificationsBusy, setNotificationsBusy] = useState(false);
  const [notificationsPromptSeen, setNotificationsPromptSeen] = useState<boolean>(() => notificationsSeenCookiePresent());
  const [gmailBusy, setGmailBusy] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [forwardAddress, setForwardAddress] = useState<string | null>(null);
  const [forwardHandle, setForwardHandle] = useState<string | null>(null);
  const [canChangeForwardHandle, setCanChangeForwardHandle] = useState(true);
  const [nextForwardHandleChangeAt, setNextForwardHandleChangeAt] = useState<string | null>(null);
  const [forwardHandleEditing, setForwardHandleEditing] = useState(false);
  const [forwardHandleInput, setForwardHandleInput] = useState("");
  const referralCodeFromUrl = useMemo(() => {
    const raw = searchParams.get("ref")?.trim().toUpperCase() ?? "";
    return /^[A-Z0-9-]{1,50}$/u.test(raw) ? raw : "";
  }, [searchParams]);

  const inviteCodeFromUrl = useMemo(() => {
    // Support ?redeem=CODE (from /redeem page) and ?code=CODE (from landing page)
    const raw = (searchParams.get("redeem") ?? searchParams.get("code") ?? "").trim().toUpperCase();
    return /^[A-Z0-9-]{1,50}$/u.test(raw) ? raw : "";
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

  const refreshEmailForwardSetupStatus = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch("/api/email-forward/setup", {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Email forward setup API returned ${response.status}`);
      }
      const payload = (await response.json()) as Partial<EmailForwardSetupStatus>;
      const normalizedAddress =
        typeof payload.forwardAddress === "string" && payload.forwardAddress.trim().length > 0
          ? payload.forwardAddress.trim()
          : null;
      const normalizedHandle =
        typeof payload.handle === "string" && payload.handle.trim().length > 0 ? payload.handle.trim().toLowerCase() : null;
      setForwardAddress(normalizedAddress);
      setForwardHandle(normalizedHandle);
      setForwardHandleInput(normalizedHandle ?? "");
      setCanChangeForwardHandle(payload.canChangeHandle !== false);
      setNextForwardHandleChangeAt(
        typeof payload.nextHandleChangeAt === "string" && payload.nextHandleChangeAt.trim().length > 0
          ? payload.nextHandleChangeAt
          : null,
      );
      setGmailConnected(Boolean(payload.gmailConnected));
    } catch {
      setForwardAddress(null);
      setForwardHandle(null);
      setForwardHandleInput("");
      setCanChangeForwardHandle(true);
      setNextForwardHandleChangeAt(null);
      setGmailConnected(false);
    }
  }, []);

  const markNotificationsPromptSeen = useCallback(async (): Promise<void> => {
    setNotificationsPromptSeen(true);
    setNotificationsSeenCookie();
    try {
      await fetch("/api/travel-updates/onboarding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notificationsSeen: true,
        }),
      });
    } catch {
      // Cookie fallback persists even if network/KV is delayed.
    }
  }, []);

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
      const notificationsSeen = Boolean(resolved.notificationsSeen) || notificationsSeenCookiePresent();
      if (notificationsSeen) {
        setNotificationsSeenCookie();
      }
      setNotificationsPromptSeen(notificationsSeen);
      const resolvedStep = clampStep(resolved.currentStep);
      setCurrentStep(notificationsSeen && resolvedStep === 3 ? 4 : resolvedStep);
      setTripDraft({
        ...EMPTY_TRIP_SETUP_DRAFT,
        ...(resolved.tripDraft ?? {}),
      });
      const resolvedInviteCode = (
        typeof resolved.inviteCode === "string" && resolved.inviteCode.trim()
          ? resolved.inviteCode.trim().toUpperCase()
          : inviteCodeFromUrl
      );
      setInviteCode(resolvedInviteCode);
      setInviteRedeemedAt(
        typeof resolved.inviteRedeemedAt === "string" && resolved.inviteRedeemedAt.length > 0
          ? resolved.inviteRedeemedAt
          : null,
      );
      setInviteMessage(resolvedInviteCode && !resolved.inviteRedeemedAt ? "Invite Code entered and ready to redeem." : null);
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
      setNotificationsPromptSeen(notificationsSeenCookiePresent());
      setCurrentStep(1);
      setTripDraft(EMPTY_TRIP_SETUP_DRAFT);
      setInviteCode("");
      setInviteRedeemedAt(null);
      setInviteMessage(null);
      setReferralCode(referralCodeFromUrl);
      setReferralRedeemedAt(null);
      setReferralMessage(referralCodeFromUrl ? t("referralCodePrefilled") : null);
      setIsVisible(true);
    } finally {
      setIsLoading(false);
    }
  }, [inviteCodeFromUrl, referralCodeFromUrl, t]);

  useEffect(() => {
    let active = true;
    const run = async (): Promise<void> => {
      await Promise.all([loadOnboardingState(), refreshEmailForwardSetupStatus()]);
      if (!active) return;
    };
    void run();
    return () => {
      active = false;
    };
  }, [loadOnboardingState, refreshEmailForwardSetupStatus]);

  const persistProgress = useCallback(
    async (
      nextStep: number,
      nextTripDraft: TripSetupDraft,
      nextInviteCode: string,
      nextInviteRedeemedAt: string | null,
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
            inviteCode: nextInviteCode.trim().toUpperCase(),
            inviteRedeemedAt: nextInviteRedeemedAt,
            referralCode: nextReferralCode.trim().toUpperCase(),
            referralRedeemedAt: nextReferralRedeemedAt,
            notificationsSeen: notificationsPromptSeen,
          }),
        });
      } finally {
        setIsSaving(false);
      }
    },
    [notificationsPromptSeen],
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
      await persistProgress(clamped, tripDraft, inviteCode, inviteRedeemedAt, referralCode, referralRedeemedAt);
    },
    [inviteCode, inviteRedeemedAt, persistProgress, referralCode, referralRedeemedAt, tripDraft],
  );

  const handleClose = useCallback(async (): Promise<void> => {
    if (currentStep === 3 && !notificationsPromptSeen) {
      await markNotificationsPromptSeen();
    }
    await persistProgress(currentStep, tripDraft, inviteCode, inviteRedeemedAt, referralCode, referralRedeemedAt);
    setIsVisible(false);
  }, [
    currentStep,
    inviteCode,
    inviteRedeemedAt,
    markNotificationsPromptSeen,
    notificationsPromptSeen,
    persistProgress,
    referralCode,
    referralRedeemedAt,
    tripDraft,
  ]);

  const handleBack = useCallback(async (): Promise<void> => {
    if (currentStep <= 1) {
      return;
    }
    await goToStep(currentStep - 1);
  }, [currentStep, goToStep]);

  const handleNext = useCallback(async (): Promise<void> => {
    let nextInviteRedeemedAt = inviteRedeemedAt;
    let nextReferralRedeemedAt = referralRedeemedAt;

    if (currentStep === 1 && inviteCode.trim() && !inviteRedeemedAt) {
      setInviteBusy(true);
      setInviteMessage(null);
      try {
        const response = await fetch("/api/invite/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: inviteCode.trim().toUpperCase() }),
        });
        const payload = (await response.json()) as {
          ok?: boolean;
          reason?: string;
          error?: string;
          plan?: "lifetime" | "trial";
          trialExpiresAt?: string | null;
        };
        if (!response.ok) {
          if (payload.reason === "already-redeemed") {
            const nowIso = new Date().toISOString();
            setInviteRedeemedAt(nowIso);
            nextInviteRedeemedAt = nowIso;
            setInviteMessage("Invite Code already redeemed for this account.");
            await persistProgress(1, tripDraft, inviteCode, nowIso, referralCode, nextReferralRedeemedAt);
          } else {
            setInviteMessage(payload.error ?? "Invite Code is invalid.");
            return;
          }
        } else {
          const redeemedAtIso = new Date().toISOString();
          setInviteRedeemedAt(redeemedAtIso);
          nextInviteRedeemedAt = redeemedAtIso;
          setInviteMessage(
            payload.plan === "lifetime"
              ? "Invite Code redeemed. Lifetime Pro access activated."
              : `Invite Code redeemed. 30-day free trial active${payload.trialExpiresAt ? ` through ${new Date(payload.trialExpiresAt).toLocaleDateString()}` : ""}.`,
          );
          await persistProgress(1, tripDraft, inviteCode, redeemedAtIso, referralCode, nextReferralRedeemedAt);
        }
      } finally {
        setInviteBusy(false);
      }
    }

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
            nextReferralRedeemedAt = nowIso;
            setReferralMessage(t("referralCodeAlreadyRedeemed"));
            await persistProgress(1, tripDraft, inviteCode, nextInviteRedeemedAt, referralCode, nowIso);
          } else {
            setReferralMessage(payload.error ?? t("referralCodeInvalid"));
            return;
          }
        } else {
          const redeemedAtIso = new Date().toISOString();
          setReferralRedeemedAt(redeemedAtIso);
          nextReferralRedeemedAt = redeemedAtIso;
          setReferralMessage(t("referralCodeRedeemed", { days: payload.awarded?.newUserDays ?? 30 }));
          await persistProgress(1, tripDraft, inviteCode, nextInviteRedeemedAt, referralCode, redeemedAtIso);
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
    if (currentStep === 3 && !notificationsPromptSeen) {
      await markNotificationsPromptSeen();
    }
    if (currentStep >= TOTAL_STEPS) {
      await completeOnboarding();
      return;
    }
    const nextStep = currentStep + 1;
    setCurrentStep(nextStep);
    await persistProgress(nextStep, tripDraft, inviteCode, nextInviteRedeemedAt, referralCode, nextReferralRedeemedAt);
  }, [
    completeOnboarding,
    currentStep,
    localizeTripErrors,
    onCreateFirstTrip,
    inviteCode,
    inviteRedeemedAt,
    persistProgress,
    referralCode,
    referralRedeemedAt,
    t,
    tripDraft,
    markNotificationsPromptSeen,
    notificationsPromptSeen,
  ]);

  const handleSkip = useCallback(async (): Promise<void> => {
    if (currentStep === 3 && !notificationsPromptSeen) {
      await markNotificationsPromptSeen();
    }
    await completeOnboarding();
  }, [completeOnboarding, currentStep, markNotificationsPromptSeen, notificationsPromptSeen]);

  const handleEnableNotifications = useCallback(async (): Promise<void> => {
    if (notificationsBusy) return;
    setNotificationsBusy(true);
    try {
      if (typeof window === "undefined" || !("Notification" in window)) {
        setNotificationsMessage(t("notificationsUnsupported"));
        await markNotificationsPromptSeen();
        return;
      }
      const permission =
        Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (permission === "granted") {
        setNotificationsMessage(t("notificationsEnabled"));
        await markNotificationsPromptSeen();
        return;
      }
      if (permission === "denied") {
        setNotificationsMessage(t("notificationsDenied"));
        await markNotificationsPromptSeen();
        return;
      }
      setNotificationsMessage(t("notificationsDismissed"));
      await markNotificationsPromptSeen();
    } finally {
      setNotificationsBusy(false);
    }
  }, [markNotificationsPromptSeen, notificationsBusy, t]);

  const handleCopyForwardAddress = useCallback(async (): Promise<void> => {
    if (!forwardAddress) return;
    try {
      await navigator.clipboard.writeText(forwardAddress);
      setGmailMessage("Forwarding address copied.");
    } catch {
      setGmailMessage("Clipboard unavailable.");
    }
  }, [forwardAddress]);

  const handleSaveForwardHandle = useCallback(async (): Promise<void> => {
    if (gmailBusy) return;
    const normalizedHandle = forwardHandleInput.trim().toLowerCase();
    if (!normalizedHandle) {
      setGmailMessage("Enter a forwarding handle first.");
      return;
    }
    setGmailBusy(true);
    try {
      const response = await fetch("/api/email-forward/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "change-forward-handle", customHandle: normalizedHandle }),
      });
      const payload = (await response.json()) as {
        error?: string;
        forwardAddress?: string;
        handle?: string;
        canChangeHandle?: boolean;
        nextHandleChangeAt?: string | null;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? `Forward handle update failed (${response.status})`);
      }
      const nextAddress =
        typeof payload.forwardAddress === "string" && payload.forwardAddress.trim().length > 0
          ? payload.forwardAddress.trim()
          : null;
      const nextHandle =
        typeof payload.handle === "string" && payload.handle.trim().length > 0 ? payload.handle.trim().toLowerCase() : null;
      setForwardAddress(nextAddress);
      setForwardHandle(nextHandle);
      setForwardHandleInput(nextHandle ?? "");
      setCanChangeForwardHandle(payload.canChangeHandle !== false);
      setNextForwardHandleChangeAt(
        typeof payload.nextHandleChangeAt === "string" && payload.nextHandleChangeAt.trim().length > 0
          ? payload.nextHandleChangeAt
          : null,
      );
      setForwardHandleEditing(false);
      setGmailMessage(nextAddress ? `Forwarding address updated: ${nextAddress}` : "Forwarding address updated.");
    } catch (error) {
      setGmailMessage(error instanceof Error ? error.message : "Could not update forwarding handle.");
    } finally {
      setGmailBusy(false);
    }
  }, [forwardHandleInput, gmailBusy]);

  const stepTitle = useMemo(() => {
    if (currentStep === 1) return t("stepWelcome");
    if (currentStep === 2) return t("stepFirstTrip");
    if (currentStep === 3) return t("stepNotifications");
    if (currentStep === 4) return "Email forwarding";
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
                {currentStep === 1 ? (
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <Logo size="sm" />
                    <span>Welcome</span>
                  </span>
                ) : (
                  stepTitle
                )}
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
                  Have an invite code?
                </span>
                <input
                  value={inviteCode}
                  onChange={(event) => {
                    const nextCode = event.target.value.toUpperCase().replace(/[^A-Z0-9-]/gu, "").slice(0, 50);
                    const normalizedCurrent = inviteCode.trim().toUpperCase();
                    setInviteCode(nextCode);
                    setInviteMessage(null);
                    if (nextCode.length === 0 || nextCode !== normalizedCurrent) {
                      setInviteRedeemedAt(null);
                    }
                  }}
                  placeholder="KEPI-FRIEND-ABC123"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-cyan-300 transition focus-visible:ring-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Enter a code from a friend or family member</p>
                {inviteMessage ? (
                  <p className="mt-1 text-xs text-cyan-700 dark:text-cyan-300">{inviteMessage}</p>
                ) : null}
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Have a referral code?
                </span>
                <input
                  value={referralCode}
                  onChange={(event) => {
                    const nextCode = event.target.value.toUpperCase().replace(/[^A-Z0-9-]/gu, "").slice(0, 50);
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
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Enter a referral code to get 30 free days</p>
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
              {notificationsPromptSeen ? (
                <p className="text-slate-700 dark:text-slate-300">
                  Notification preference already saved. You can manage alerts any time from settings.
                </p>
              ) : (
                <>
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
                </>
              )}
              {notificationsMessage ? <p className="text-xs text-slate-600 dark:text-slate-400">{notificationsMessage}</p> : null}
            </div>
          ) : null}

          {currentStep === 4 ? (
            <div className="space-y-3 text-sm">
              {forwardAddress ? (
                <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3 dark:border-cyan-500/30 dark:bg-cyan-500/10">
                  <p className="text-slate-700 dark:text-slate-300">
                    Your forward address is <span className="font-semibold break-all">{forwardAddress}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      void handleCopyForwardAddress();
                    }}
                    className="mt-3 w-full rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
                  >
                    Copy forward address
                  </button>
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                    Forward any flight, hotel, or booking confirmation from any email app to this address.
                  </p>
                  {!forwardHandleEditing ? (
                    <button
                      type="button"
                      onClick={() => {
                        setForwardHandleEditing(true);
                        setGmailMessage(null);
                      }}
                      disabled={!canChangeForwardHandle}
                      className="mt-2 text-xs font-semibold text-cyan-700 underline underline-offset-4 disabled:cursor-not-allowed disabled:opacity-60 dark:text-cyan-300"
                    >
                      Change address
                    </button>
                  ) : (
                    <div className="mt-3 rounded-lg border border-cyan-300 bg-white p-3 dark:border-cyan-500/40 dark:bg-slate-900">
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Custom handle
                      </label>
                      <input
                        value={forwardHandleInput}
                        onChange={(event) => {
                          const normalized = event.target.value.toLowerCase().replace(/[^a-z0-9-]/gu, "").slice(0, 20);
                          setForwardHandleInput(normalized);
                        }}
                        placeholder={forwardHandle ?? "yourname"}
                        className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-cyan-300 transition focus-visible:ring-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            void handleSaveForwardHandle();
                          }}
                          disabled={gmailBusy}
                          className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {gmailBusy ? "Saving..." : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setForwardHandleEditing(false);
                            setForwardHandleInput(forwardHandle ?? "");
                          }}
                          disabled={gmailBusy}
                          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-900"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                  {!canChangeForwardHandle && nextForwardHandleChangeAt ? (
                    <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                      You can change this again on {new Date(nextForwardHandleChangeAt).toLocaleDateString()}.
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-slate-700 dark:text-slate-300">Assigning your forwarding address...</p>
              )}
              <p className="text-slate-700 dark:text-slate-300">
                {gmailConnected
                  ? "Email import account connected."
                  : "Email import account connection can be completed later from the More tab."}
              </p>
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
            disabled={currentStep === 1 || isSaving || inviteBusy || referralBusy}
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
              disabled={isSaving || inviteBusy || referralBusy}
              onClick={() => {
                void handleSkip();
              }}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-900"
            >
              {t("skip")}
            </button>
            <button
              type="button"
              disabled={isSaving || inviteBusy || referralBusy}
              onClick={() => {
                void handleNext();
              }}
              className="rounded-md bg-cyan-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {inviteBusy || referralBusy ? "Applying code..." : currentStep === TOTAL_STEPS ? t("start") : t("next")}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
