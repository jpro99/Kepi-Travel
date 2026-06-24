"use client";

import { useTranslations } from "next-intl";

export interface TripSetupDraft {
  tripName: string;
  destination: string;
  departureDate: string;
  returnDate: string;
}

export type TripSetupValidationErrors = Partial<Record<keyof TripSetupDraft, string>>;

export const EMPTY_TRIP_SETUP_DRAFT: TripSetupDraft = {
  tripName: "",
  destination: "",
  departureDate: "",
  returnDate: "",
};

export function validateTripSetupDraft(draft: TripSetupDraft): TripSetupValidationErrors {
  const errors: TripSetupValidationErrors = {};
  if (!draft.tripName.trim()) {
    errors.tripName = "Trip name is required.";
  }
  if (!draft.destination.trim()) {
    errors.destination = "Destination is required.";
  }
  if (!draft.departureDate.trim()) {
    errors.departureDate = "Departure date is required.";
  }
  if (!draft.returnDate.trim()) {
    errors.returnDate = "Return date is required.";
  } else if (draft.departureDate && draft.returnDate < draft.departureDate) {
    errors.returnDate = "Return must be on or after departure.";
  }
  return errors;
}

interface TripSetupFormProps {
  value: TripSetupDraft;
  errors?: TripSetupValidationErrors;
  onChange: (nextValue: TripSetupDraft) => void;
}

export function TripSetupForm({ value, errors, onChange }: TripSetupFormProps) {
  const t = useTranslations("TripSetupForm");

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {t("tripName")}
        </span>
        <input
          value={value.tripName}
          onChange={(event) => onChange({ ...value, tripName: event.target.value })}
          placeholder={t("tripNamePlaceholder")}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-cyan-300 transition focus-visible:ring-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        {errors?.tripName ? <p className="mt-1 text-xs text-red-500">{errors.tripName}</p> : null}
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {t("destination")}
        </span>
        <input
          value={value.destination}
          onChange={(event) => onChange({ ...value, destination: event.target.value })}
          placeholder={t("destinationPlaceholder")}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-cyan-300 transition focus-visible:ring-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        {errors?.destination ? <p className="mt-1 text-xs text-red-500">{errors.destination}</p> : null}
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {t("departureDate")}
        </span>
        <input
          type="date"
          value={value.departureDate}
          onChange={(event) => onChange({ ...value, departureDate: event.target.value })}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-cyan-300 transition focus-visible:ring-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        {errors?.departureDate ? <p className="mt-1 text-xs text-red-500">{errors.departureDate}</p> : null}
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Return date
        </span>
        <input
          type="date"
          value={value.returnDate}
          onChange={(event) => onChange({ ...value, returnDate: event.target.value })}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-cyan-300 transition focus-visible:ring-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        {errors?.returnDate ? <p className="mt-1 text-xs text-red-500">{errors.returnDate}</p> : null}
      </label>
    </div>
  );
}
