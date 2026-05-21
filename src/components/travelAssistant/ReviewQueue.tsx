"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { GmailImportScopeModal, type GmailImportScope } from "@/components/travelAssistant/GmailImportScopeModal";

type TripStage = "readiness" | "pre-departure" | "airport" | "arrival" | "recovery";
type ReservationType = "flight" | "hotel" | "train" | "ride" | "dinner";
type Confidence = "high" | "medium" | "low";
type ParsingStatus = "auto-parsed" | "needs-review" | "needs-user-input";
type MissingField = "type" | "title" | "provider" | "confirmationCode" | "localTime" | "timezone" | "location";

interface ReservationDraft {
  type: ReservationType;
  title: string;
  provider: string;
  localTime: string;
  timezone: string;
  location: string;
  confirmationCode: string;
  assignedTo: string[];
  stage: TripStage;
  critical: boolean;
  confidence: Confidence;
  notes: string;
}

interface ReviewItem {
  id: string;
  reasons: string[];
  impact: string;
  draft: ReservationDraft;
  sourceEmailSubject: string;
  sourceChannel?: "email-forward" | "gmail-import" | "manual";
  parseConfidenceScore?: number;
  parsingStatus?: ParsingStatus;
  missingFields?: MissingField[];
  originalEmailText?: string;
  hasPdfAttachment?: boolean;
  imageBasedEmail?: boolean;
  reviewStatus?: "pending" | "incomplete";
  parserNotes?: string[];
}

interface ReservationOption {
  id: string;
  title: string;
}

interface GmailImportedReservation {
  messageId: string;
  sender: string;
  subject: string;
  receivedAt: string;
  body: string;
  reservation: {
    type: "flight" | "hotel" | "train" | "ride";
    title: string;
    provider: string;
    localTime: string;
    timezone: string;
    location: string;
    confirmationCode: string;
    confidence: Confidence;
    issues: string[];
  };
}

interface ReviewQueueProps {
  reviewQueue: ReviewItem[];
  reservations: ReservationOption[];
  mergeTargetByReview: Record<string, string>;
  onMergeTargetChange: (reviewId: string, targetReservationId: string) => void;
  onAcceptReview: (reviewId: string) => void;
  onOpenReviewDrawer: (reviewId: string) => void;
  onRejectReview: (reviewId: string) => void;
  onReparseReview: (reviewId: string) => void;
  onMergeReview: (reviewId: string) => void;
  onConfirmIncompleteReview: (reviewId: string, updates: Partial<ReservationDraft>) => void;
  onImportParsedReservations: (reservations: GmailImportedReservation[]) => void;
  canUseGmailImport: boolean;
  onRequestUpgradeForGmailImport: () => void;
}

const MISSING_FIELD_LABELS: Record<MissingField, string> = {
  type: "Type",
  title: "Title",
  provider: "Provider",
  confirmationCode: "Confirmation Code",
  localTime: "Local Time (YYYY-MM-DD HH:MM)",
  timezone: "Timezone",
  location: "Location",
};

function getConfidenceScore(item: ReviewItem): number {
  if (typeof item.parseConfidenceScore === "number" && Number.isFinite(item.parseConfidenceScore)) {
    return item.parseConfidenceScore;
  }
  if (item.draft.confidence === "high") return 85;
  if (item.draft.confidence === "medium") return 55;
  return 25;
}

function getParsingStatus(item: ReviewItem): ParsingStatus {
  if (item.parsingStatus) return item.parsingStatus;
  const score = getConfidenceScore(item);
  if (score >= 70) return "auto-parsed";
  if (score >= 40) return "needs-review";
  return "needs-user-input";
}

function getMissingFields(item: ReviewItem): MissingField[] {
  if (Array.isArray(item.missingFields) && item.missingFields.length > 0) {
    return item.missingFields;
  }
  const missing: MissingField[] = [];
  if (!item.draft.title.trim()) missing.push("title");
  if (!item.draft.provider.trim()) missing.push("provider");
  if (!item.draft.confirmationCode.trim()) missing.push("confirmationCode");
  if (!item.draft.localTime.trim()) missing.push("localTime");
  if (!item.draft.timezone.trim()) missing.push("timezone");
  if (!item.draft.location.trim()) missing.push("location");
  return missing;
}

export function ReviewQueue({
  reviewQueue,
  reservations,
  mergeTargetByReview,
  onMergeTargetChange,
  onAcceptReview,
  onOpenReviewDrawer,
  onRejectReview,
  onReparseReview,
  onMergeReview,
  onConfirmIncompleteReview,
  onImportParsedReservations,
  canUseGmailImport,
  onRequestUpgradeForGmailImport,
}: ReviewQueueProps) {
  const t = useTranslations("ReviewQueue");
  const [importInFlight, setImportInFlight] = useState(false);
  const [importMaxResults, setImportMaxResults] = useState(10);
  const [importError, setImportError] = useState<string | null>(null);
  const [importInfo, setImportInfo] = useState<string | null>(null);
  const [scopeModalOpen, setScopeModalOpen] = useState(false);
  const [scopeModalKey, setScopeModalKey] = useState(0);
  const [expandedOriginalById, setExpandedOriginalById] = useState<Record<string, boolean>>({});
  const [assistDraftById, setAssistDraftById] = useState<Record<string, Partial<ReservationDraft>>>({});

  const reviewStats = useMemo(() => {
    const high = reviewQueue.filter((item) => getParsingStatus(item) === "auto-parsed").length;
    const medium = reviewQueue.filter((item) => getParsingStatus(item) === "needs-review").length;
    const low = reviewQueue.filter((item) => getParsingStatus(item) === "needs-user-input").length;
    return { high, medium, low };
  }, [reviewQueue]);

  const handleGmailImport = async (scope: GmailImportScope): Promise<void> => {
    if (importInFlight) return;
    setImportInFlight(true);
    setImportError(null);
    setImportInfo(null);
    try {
      const response = await fetch("/api/travel-updates/gmail-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxResults: importMaxResults,
          lookbackDays: scope.lookbackDays,
          tripStartDate: scope.tripStartDate,
          tripEndDate: scope.tripEndDate,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        foundCount?: number;
        reservations?: GmailImportedReservation[];
      };
      if (!response.ok) {
        throw new Error(payload.error ?? `Gmail import endpoint returned ${response.status}`);
      }
      const foundCount = payload.foundCount ?? payload.reservations?.length ?? 0;
      setImportInfo(
        foundCount > 0
          ? `Found ${foundCount} matching email${foundCount === 1 ? "" : "s"}. Adding to review queue...`
          : "No matching emails found for this scope.",
      );
      onImportParsedReservations(payload.reservations ?? []);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Unknown Gmail import error");
    } finally {
      setImportInFlight(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 dark:border-slate-700 dark:bg-slate-900/70">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <p className="text-xs text-slate-600 dark:text-slate-400">{t("subtitle")}</p>
      <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-emerald-700 dark:text-emerald-200">
          Auto-parsed: {reviewStats.high}
        </span>
        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-amber-700 dark:text-amber-200">
          Needs review: {reviewStats.medium}
        </span>
        <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-red-700 dark:text-red-200">
          Needs your help: {reviewStats.low}
        </span>
      </div>
      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-100/70 p-3 dark:border-slate-700 dark:bg-slate-950/60">
        <p className="text-sm font-semibold">{t("importTitle")}</p>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
          {t("importSubtitle")}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label htmlFor="gmail-import-max-results" className="text-xs text-slate-700 dark:text-slate-300">
            {t("maxEmails")}
          </label>
          <input
            id="gmail-import-max-results"
            type="number"
            min={1}
            max={50}
            value={importMaxResults}
            onChange={(event) =>
              setImportMaxResults(Math.max(1, Math.min(50, Number(event.target.value) || 1)))
            }
            className="w-24 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
          />
          <button
            type="button"
            onClick={() => {
              if (!canUseGmailImport) {
                onRequestUpgradeForGmailImport();
                return;
              }
              setScopeModalKey((value) => value + 1);
              setScopeModalOpen(true);
            }}
            disabled={importInFlight}
            className="rounded-md bg-cyan-500/90 px-2 py-1 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {importInFlight ? t("importing") : canUseGmailImport ? t("importGmail") : t("upgradeImportGmail")}
          </button>
        </div>
        {!canUseGmailImport ? (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {t("proNote")}
          </p>
        ) : null}
        {importError ? <p className="mt-2 text-xs text-red-200">{t("importFailed", { error: importError })}</p> : null}
        {importInfo ? <p className="mt-2 text-xs text-emerald-200">{importInfo}</p> : null}
      </div>
      <div className="mt-3 space-y-3">
        {reviewQueue.map((item) => {
          const score = getConfidenceScore(item);
          const status = getParsingStatus(item);
          const missingFields = getMissingFields(item);
          const statusClass =
            status === "auto-parsed"
              ? "border-emerald-400/40 bg-emerald-500/10"
              : status === "needs-review"
                ? "border-amber-400/40 bg-amber-500/10"
                : "border-red-500 bg-red-500/10";
          const statusLabel =
            status === "auto-parsed" ? "Auto-parsed" : status === "needs-review" ? "Needs review" : "Needs your help";
          const draftPatch = assistDraftById[item.id] ?? {};
          const showOriginal = expandedOriginalById[item.id] ?? status === "needs-user-input";

          return (
            <div
              key={item.id}
              className={`rounded-xl border bg-slate-50 p-3 dark:bg-slate-950/60 ${statusClass}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">{item.draft.title || "Untitled reservation draft"}</p>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    status === "auto-parsed"
                      ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-200"
                      : status === "needs-review"
                        ? "bg-amber-500/20 text-amber-700 dark:text-amber-200"
                        : "bg-red-500/20 text-red-700 dark:text-red-200"
                  }`}
                >
                  {statusLabel} ({score})
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">{t("source", { subject: item.sourceEmailSubject })}</p>
              <p className="mt-1 text-xs text-slate-700 dark:text-slate-300">{t("impact", { impact: item.impact })}</p>

              {missingFields.length > 0 && status !== "auto-parsed" ? (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-200">
                  Missing fields: {missingFields.map((field) => MISSING_FIELD_LABELS[field]).join(", ")}
                </p>
              ) : null}

              {item.hasPdfAttachment ? (
                <p className="mt-2 rounded-md border border-cyan-400/40 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-700 dark:text-cyan-200">
                  This email has a PDF attachment that may contain your confirmation details. Check the attached PDF for
                  your confirmation code.
                </p>
              ) : null}

              {item.imageBasedEmail ? (
                <p className="mt-2 rounded-md border border-red-500/60 bg-red-500/10 px-2 py-1 text-xs text-red-700 dark:text-red-200">
                  Image-based email — we could not read this one. Please add this reservation manually or forward a text
                  version.
                </p>
              ) : null}

              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-amber-700 dark:text-amber-200">
                {item.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>

              {status === "needs-user-input" ? (
                <div className="mt-3 rounded-lg border border-red-500/70 bg-red-500/10 p-3">
                  <p className="text-xs font-semibold text-red-700 dark:text-red-200">We need your help with this one</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {missingFields.map((field) => {
                      if (field === "type") {
                        return (
                          <label key={`${item.id}-${field}`} className="text-xs text-red-700 dark:text-red-200">
                            {MISSING_FIELD_LABELS[field]}
                            <select
                              className="mt-1 w-full rounded-md border border-red-500/80 bg-white px-2 py-1 text-xs dark:bg-slate-900"
                              value={(draftPatch.type as ReservationType | undefined) ?? item.draft.type}
                              onChange={(event) =>
                                setAssistDraftById((prev) => ({
                                  ...prev,
                                  [item.id]: {
                                    ...(prev[item.id] ?? {}),
                                    type: event.target.value as ReservationType,
                                  },
                                }))
                              }
                            >
                              <option value="flight">Flight</option>
                              <option value="hotel">Hotel</option>
                              <option value="train">Train</option>
                              <option value="ride">Ride</option>
                              <option value="dinner">Dinner</option>
                            </select>
                          </label>
                        );
                      }
                      const currentValue = String((draftPatch[field] as string | undefined) ?? item.draft[field] ?? "");
                      return (
                        <label key={`${item.id}-${field}`} className="text-xs text-red-700 dark:text-red-200">
                          {MISSING_FIELD_LABELS[field]}
                          <input
                            type="text"
                            value={currentValue}
                            onChange={(event) =>
                              setAssistDraftById((prev) => ({
                                ...prev,
                                [item.id]: {
                                  ...(prev[item.id] ?? {}),
                                  [field]: event.target.value,
                                },
                              }))
                            }
                            className="mt-1 w-full rounded-md border border-red-500/80 bg-white px-2 py-1 text-xs dark:bg-slate-900"
                          />
                        </label>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => onConfirmIncompleteReview(item.id, assistDraftById[item.id] ?? {})}
                    className="mt-3 rounded-md bg-red-500 px-3 py-1 text-xs font-semibold text-white hover:bg-red-400"
                  >
                    Confirm
                  </button>
                </div>
              ) : null}

              {item.originalEmailText ? (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedOriginalById((prev) => ({
                        ...prev,
                        [item.id]: !prev[item.id],
                      }))
                    }
                    className="text-xs font-semibold text-cyan-700 underline-offset-2 hover:underline dark:text-cyan-300"
                  >
                    {showOriginal ? "Hide original email" : "View original email"}
                  </button>
                  {showOriginal ? (
                    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-slate-300 bg-white p-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                      {item.originalEmailText}
                    </pre>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {status !== "needs-user-input" ? (
                  <button
                    type="button"
                    onClick={() => onAcceptReview(item.id)}
                    className="rounded-md bg-emerald-500/90 px-2 py-1 font-semibold text-slate-950 hover:bg-emerald-400"
                  >
                    {t("accept")}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => onOpenReviewDrawer(item.id)}
                  className="rounded-md bg-slate-200 px-2 py-1 ring-1 ring-slate-300 hover:bg-slate-300 dark:bg-slate-800 dark:ring-slate-700 dark:hover:bg-slate-700"
                >
                  {t("editAccept")}
                </button>
                <button
                  type="button"
                  onClick={() => onRejectReview(item.id)}
                  className="rounded-md bg-slate-200 px-2 py-1 ring-1 ring-slate-300 hover:bg-slate-300 dark:bg-slate-800 dark:ring-slate-700 dark:hover:bg-slate-700"
                >
                  {t("reject")}
                </button>
                <button
                  type="button"
                  onClick={() => onReparseReview(item.id)}
                  className="rounded-md bg-slate-200 px-2 py-1 ring-1 ring-slate-300 hover:bg-slate-300 dark:bg-slate-800 dark:ring-slate-700 dark:hover:bg-slate-700"
                >
                  {t("reparse")}
                </button>
              </div>
              <div className="mt-2 flex gap-2 text-xs">
                <label htmlFor={`merge-target-${item.id}`} className="sr-only">
                  {t("mergeTargetLabel")}
                </label>
                <select
                  id={`merge-target-${item.id}`}
                  value={mergeTargetByReview[item.id] ?? ""}
                  onChange={(event) => onMergeTargetChange(item.id, event.target.value)}
                  className="flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="">{t("selectMergeTarget")}</option>
                  {reservations.map((reservation) => (
                    <option key={reservation.id} value={reservation.id}>
                      {reservation.title}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => onMergeReview(item.id)}
                  className="rounded-md bg-indigo-500/90 px-2 py-1 font-semibold hover:bg-indigo-400"
                >
                  {t("mergeDuplicate")}
                </button>
              </div>
            </div>
          );
        })}
        {reviewQueue.length === 0 ? (
          <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
            {t("queueClear")}
          </p>
        ) : null}
      </div>
      <GmailImportScopeModal
        key={scopeModalKey}
        open={scopeModalOpen}
        isSubmitting={importInFlight}
        onCancel={() => {
          if (importInFlight) return;
          setScopeModalOpen(false);
        }}
        onConfirm={(scope) => {
          void handleGmailImport(scope).finally(() => {
            setScopeModalOpen(false);
          });
        }}
      />
    </div>
  );
}
