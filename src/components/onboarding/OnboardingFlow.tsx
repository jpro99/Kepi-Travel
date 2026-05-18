"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  };
}

export function OnboardingFlow({ onCreateFirstTrip }: OnboardingFlowProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isVisible, setIsVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [tripDraft, setTripDraft] = useState<TripSetupDraft>(EMPTY_TRIP_SETUP_DRAFT);
  const [tripErrors, setTripErrors] = useState<TripSetupValidationErrors>({});
  const [notificationsMessage, setNotificationsMessage] = useState<string | null>(null);
  const [gmailMessage, setGmailMessage] = useState<string | null>(null);

  const [notificationsBusy, setNotificationsBusy] = useState(false);
  const [gmailBusy, setGmailBusy] = useState(false);

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
      setIsVisible(true);
    } catch {
      setCurrentStep(1);
      setTripDraft(EMPTY_TRIP_SETUP_DRAFT);
      setIsVisible(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

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
    async (nextStep: number, nextTripDraft: TripSetupDraft): Promise<void> => {
      setIsSaving(true);
      try {
        await fetch("/api/travel-updates/onboarding", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            currentStep: clampStep(nextStep),
            tripDraft: nextTripDraft,
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
      await persistProgress(clamped, tripDraft);
    },
    [persistProgress, tripDraft],
  );

  const handleClose = useCallback(async (): Promise<void> => {
    await persistProgress(currentStep, tripDraft);
    setIsVisible(false);
  }, [currentStep, persistProgress, tripDraft]);

  const handleBack = useCallback(async (): Promise<void> => {
    if (currentStep <= 1) {
      return;
    }
    await goToStep(currentStep - 1);
  }, [currentStep, goToStep]);

  const handleNext = useCallback(async (): Promise<void> => {
    if (currentStep === 2) {
      const errors = validateTripSetupDraft(tripDraft);
      setTripErrors(errors);
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
  }, [completeOnboarding, currentStep, goToStep, onCreateFirstTrip, tripDraft]);

  const handleSkip = useCallback(async (): Promise<void> => {
    await completeOnboarding();
  }, [completeOnboarding]);

  const handleEnableNotifications = useCallback(async (): Promise<void> => {
    if (notificationsBusy) return;
    setNotificationsBusy(true);
    try {
      if (typeof window === "undefined" || !("Notification" in window)) {
        setNotificationsMessage("Notifications are not supported in this browser.");
        return;
      }
      const permission =
        Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (permission === "granted") {
        setNotificationsMessage("Notifications enabled. You will receive delay and gate alerts.");
        return;
      }
      if (permission === "denied") {
        setNotificationsMessage("Notification permission denied. You can enable it later in browser settings.");
        return;
      }
      setNotificationsMessage("Notification permission dismissed. You can retry any time.");
    } finally {
      setNotificationsBusy(false);
    }
  }, [notificationsBusy]);

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
        const fallbackMessage = `Gmail connection is not fully configured yet (${response.status}).`;
        setGmailMessage(fallbackMessage);
        return;
      }
      setGmailMessage("Gmail connected. Reservation import is available.");
    } catch {
      setGmailMessage("Could not reach Gmail import service right now. You can connect later.");
    } finally {
      setGmailBusy(false);
    }
  }, [gmailBusy]);

  const stepTitle = useMemo(() => {
    if (currentStep === 1) return "Welcome to Kepi";
    if (currentStep === 2) return "Add your first trip";
    if (currentStep === 3) return "Enable notifications";
    if (currentStep === 4) return "Connect Gmail";
    return "You're all set";
  }, [currentStep]);

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
                Step {currentStep} of {TOTAL_STEPS}
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
              Close
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
                Kepi helps you execute trips from readiness to recovery with anti-miss safeguards, adaptive stage views,
                and low-friction travel updates.
              </p>
              <ul className="list-disc space-y-1 pl-5 text-slate-700 dark:text-slate-300">
                <li>Stage-aware controls for readiness, airport, arrival, and disruptions.</li>
                <li>Live transport updates and guided recovery playbooks.</li>
                <li>Fast input with email import, voice capture, and one-tap actions.</li>
              </ul>
            </div>
          ) : null}

          {currentStep === 2 ? (
            <TripSetupForm
              value={tripDraft}
              errors={tripErrors}
              onChange={(nextDraft) => {
                setTripDraft(nextDraft);
                if (Object.keys(tripErrors).length > 0) {
                  setTripErrors(validateTripSetupDraft(nextDraft));
                }
              }}
            />
          ) : null}

          {currentStep === 3 ? (
            <div className="space-y-3 text-sm">
              <p className="text-slate-700 dark:text-slate-300">
                Get gate change and delay alerts so you can react before schedules slip.
              </p>
              <button
                type="button"
                onClick={() => {
                  void handleEnableNotifications();
                }}
                disabled={notificationsBusy}
                className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {notificationsBusy ? "Requesting..." : "Enable notifications"}
              </button>
              {notificationsMessage ? <p className="text-xs text-slate-600 dark:text-slate-400">{notificationsMessage}</p> : null}
            </div>
          ) : null}

          {currentStep === 4 ? (
            <div className="space-y-3 text-sm">
              <p className="text-slate-700 dark:text-slate-300">
                Import reservations automatically from Gmail to reduce manual entry.
              </p>
              <button
                type="button"
                onClick={() => {
                  void handleConnectGmail();
                }}
                disabled={gmailBusy}
                className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {gmailBusy ? "Connecting..." : "Connect Gmail"}
              </button>
              {gmailMessage ? <p className="text-xs text-slate-600 dark:text-slate-400">{gmailMessage}</p> : null}
            </div>
          ) : null}

          {currentStep === 5 ? (
            <div className="space-y-3 text-sm">
              <p className="text-slate-700 dark:text-slate-300">
                You&apos;re all set. Kepi is ready to help you stay ahead of travel changes and execute each stage with
                confidence.
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400">Press Start to begin using your travel assistant.</p>
            </div>
          ) : null}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-slate-200 p-4 dark:border-slate-800">
          <button
            type="button"
            disabled={currentStep === 1 || isSaving}
            onClick={() => {
              void handleBack();
            }}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-900"
          >
            Back
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isSaving}
              onClick={() => {
                void handleSkip();
              }}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-900"
            >
              Skip
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => {
                void handleNext();
              }}
              className="rounded-md bg-cyan-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {currentStep === TOTAL_STEPS ? "Start" : "Next"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
