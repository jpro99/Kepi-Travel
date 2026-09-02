"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type BugCategory = "crash" | "wrong-data" | "missing-feature" | "slow" | "other";

interface BugReportModalProps {
  open: boolean;
  /** Pre-filled category (e.g. from "My app crashed" quick-tap) */
  initialCategory?: BugCategory;
  onClose: () => void;
}

interface SubmitResult {
  ticketId: string;
  message: string;
  issueUrl?: string | null;
  githubIssueCreated?: boolean;
  smsSent?: boolean;
  filingWarnings?: string[];
}

const CATEGORIES: { value: BugCategory; label: string }[] = [
  { value: "crash", label: "App crashed / froze" },
  { value: "wrong-data", label: "Wrong data (flight, hotel, map)" },
  { value: "missing-feature", label: "Something stopped working" },
  { value: "slow", label: "Very slow / loading forever" },
  { value: "other", label: "Other issue" },
];

export function BugReportModal({ open, initialCategory = "crash", onClose }: BugReportModalProps) {
  const [category, setCategory] = useState<BugCategory>(initialCategory);
  const [whatHappened, setWhatHappened] = useState("");
  const [whatExpected, setWhatExpected] = useState("");
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const resetForm = useCallback((): void => {
    setCategory(initialCategory);
    setWhatHappened("");
    setWhatExpected("");
    setScreenshotFile(null);
    setScreenshotPreview(null);
    setBusy(false);
    setResult(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [initialCategory]);

  // Fresh form every time the modal opens (was stuck on "Report received").
  useEffect(() => {
    if (open) {
      resetForm();
    }
  }, [open, resetForm]);

  const handleClose = useCallback((): void => {
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  const handleScreenshot = (file: File): void => {
    if (!file.type.startsWith("image/")) {
      setError("Please attach an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be under 5 MB.");
      return;
    }
    setScreenshotFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setScreenshotPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const submit = useCallback(async (): Promise<void> => {
    if (busy || !whatHappened.trim()) return;
    setBusy(true);
    setError(null);

    try {
      const form = new FormData();
      form.append("category", category);
      form.append("whatHappened", whatHappened.trim());
      form.append("whatExpected", whatExpected.trim());
      form.append("url", typeof window !== "undefined" ? window.location.href : "");
      form.append("userAgent", typeof navigator !== "undefined" ? navigator.userAgent : "");
      if (screenshotFile) {
        form.append("screenshot", screenshotFile);
      }

      const response = await fetch("/api/support/bug-report", {
        method: "POST",
        body: form,
      });
      const payload = (await response.json()) as Partial<SubmitResult> & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? `Submission failed (${response.status})`);
      }
      setResult({
        ticketId: payload.ticketId ?? "BUG",
        message: payload.message ?? "Report received.",
        issueUrl: payload.issueUrl ?? null,
        githubIssueCreated: payload.githubIssueCreated,
        smsSent: payload.smsSent,
        filingWarnings: Array.isArray(payload.filingWarnings)
          ? payload.filingWarnings.filter((entry): entry is string => typeof entry === "string")
          : [],
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not submit report.");
    } finally {
      setBusy(false);
    }
  }, [busy, category, whatHappened, whatExpected, screenshotFile]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100020] flex items-end bg-slate-950/80 sm:items-center sm:justify-center sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        className="flex max-h-[92dvh] w-full flex-col overflow-y-auto border border-slate-700 bg-white p-5 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:max-w-lg sm:rounded-2xl"
      >
        {/* Header */}
        <header className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold">Report a problem</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Tell us what went wrong. We review every report and text you a fix update.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="shrink-0 rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-900"
          >
            Close
          </button>
        </header>

        {result ? (
          /* Success state */
          <div className="mt-6 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5 text-center">
            <p className="text-3xl">✅</p>
            <p className="mt-3 text-base font-bold text-emerald-700 dark:text-emerald-300">Report received</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{result.message}</p>
            <p className="mt-1 text-xs text-slate-500">Ticket #{result.ticketId}</p>
            {result.githubIssueCreated && result.issueUrl ? (
              <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
                GitHub issue filed:{" "}
                <a href={result.issueUrl} target="_blank" rel="noreferrer" className="underline">
                  {result.issueUrl}
                </a>
              </p>
            ) : null}
            {result.filingWarnings && result.filingWarnings.length > 0 ? (
              <ul className="mt-3 space-y-1 text-left text-xs text-amber-700 dark:text-amber-300">
                {result.filingWarnings.map((warning) => (
                  <li key={warning}>• {warning}</li>
                ))}
              </ul>
            ) : null}
            <button
              type="button"
              onClick={handleClose}
              className="mt-5 min-h-[48px] w-full rounded-xl bg-emerald-600 text-sm font-bold text-white hover:bg-emerald-500"
            >
              Done
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="mt-2 min-h-[48px] w-full rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-900"
            >
              Report another problem
            </button>
          </div>
        ) : (
          /* Form */
          <div className="mt-4 space-y-4">
            {/* Category */}
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Type of problem
              </p>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setCategory(value)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      category === value
                        ? "bg-[#007AFF] text-white"
                        : "border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* What happened */}
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                What happened? <span className="text-red-500">*</span>
              </span>
              <textarea
                rows={3}
                value={whatHappened}
                onChange={(e) => setWhatHappened(e.target.value)}
                placeholder="App crashed when I tapped Hotels, pins were in the ocean, loading spinner never stopped…"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
            </label>

            {/* What expected */}
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                What did you expect?
              </span>
              <textarea
                rows={2}
                value={whatExpected}
                onChange={(e) => setWhatExpected(e.target.value)}
                placeholder="Hotel pins should appear in the city, not the ocean…"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
            </label>

            {/* Screenshot */}
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Screenshot (optional)
              </p>
              {screenshotPreview ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={screenshotPreview}
                    alt="Your screenshot"
                    className="max-h-48 w-full rounded-xl object-contain border border-slate-200 dark:border-slate-700"
                  />
                  <button
                    type="button"
                    onClick={() => { setScreenshotFile(null); setScreenshotPreview(null); }}
                    className="absolute right-2 top-2 rounded-full bg-slate-800/80 px-2 py-0.5 text-xs text-white"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-3 py-3 text-sm text-slate-500 hover:border-slate-400 dark:border-slate-600 dark:hover:border-slate-500"
                >
                  <span className="text-lg">📎</span>
                  Attach screenshot
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleScreenshot(file);
                }}
              />
            </div>

            {error ? <p className="text-xs text-red-500">{error}</p> : null}

            <button
              type="button"
              disabled={busy || !whatHappened.trim()}
              onClick={() => void submit()}
              className="min-h-[52px] w-full rounded-xl bg-[#007AFF] text-sm font-bold text-white hover:bg-[#0066DD] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Sending report…" : "Send bug report"}
            </button>
            <p className="text-center text-[11px] text-slate-400">
              We review every report. If it&apos;s a real bug, an AI fix is prepared and you&apos;ll hear from us.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
