"use client";

import type { ConsumerTab } from "@/lib/travelAssistant/consumerTabs";
import { orientationTabToConsumerTab } from "@/lib/travelAssistant/consumerTabs";

type OrientationTab = ConsumerTab | "reservations" | "packing" | "family";

interface TripOrientationCardProps {
  travelerName: string;
  destination: string;
  tripDaysAway: number | null;
  statusTitle: string;
  statusDetail: string;
  weatherLabel?: string;
  nextActionLabel: string;
  onNextAction?: () => void;
  actionTargetTab?: OrientationTab;
  onSwitchTab?: (tab: ConsumerTab) => void;
  statusToneClassName: string;
}

export function TripOrientationCard({
  travelerName,
  destination,
  tripDaysAway,
  statusTitle,
  statusDetail,
  weatherLabel,
  nextActionLabel,
  onNextAction,
  actionTargetTab,
  onSwitchTab,
  statusToneClassName,
}: TripOrientationCardProps) {
  const canRunNextAction = Boolean(onNextAction || (actionTargetTab && onSwitchTab));

  return (
    <section data-testid="trip-orientation-card" className={`rounded-3xl border p-5 shadow-sm ${statusToneClassName}`}>
      <p className="text-sm font-semibold opacity-80">Good morning {travelerName}!</p>
      <h1 className="mt-2 text-3xl font-bold leading-tight">{statusTitle}</h1>
      <p className="mt-3 text-base">
        {tripDaysAway !== null
          ? `Your flight to ${destination} is in ${tripDaysAway === 1 ? "1 day" : `${tripDaysAway} days`}.`
          : `Your trip to ${destination} is taking shape.`}
      </p>
      {weatherLabel ? <p className="mt-2 text-base">{weatherLabel}</p> : null}
      <p className="mt-4 rounded-2xl bg-white/60 p-3 text-sm font-medium text-slate-900 dark:bg-slate-950/40 dark:text-slate-100">
        {statusDetail}
      </p>
      {canRunNextAction ? (
        <button
          type="button"
          onClick={() => {
            if (actionTargetTab && onSwitchTab) {
              onSwitchTab(orientationTabToConsumerTab(actionTargetTab));
            }
            onNextAction?.();
          }}
          className="mt-4 w-full rounded-2xl bg-slate-950 px-4 py-3 text-base font-semibold text-white shadow-sm hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 sm:w-auto"
        >
          {nextActionLabel}
        </button>
      ) : null}
    </section>
  );
}
