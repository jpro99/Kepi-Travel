"use client";

import { useMemo, useState } from "react";
import {
  emergencyCoverageSummary,
  hasEmergencyCoverage,
} from "@/lib/vault/emergencyCoverageFields";
import { useEmergencyCoverage } from "@/components/travelAssistant/useEmergencyCoverage";

interface EmergencyCoveragePanelProps {
  /** When true, starts expanded for first-time setup */
  defaultExpanded?: boolean;
}

function phoneHref(value: string): string {
  const digits = value.replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : "";
}

export function EmergencyCoveragePanel({ defaultExpanded = false }: EmergencyCoveragePanelProps) {
  const { record, setRecord, loading, saving, error, notice, save } = useEmergencyCoverage();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [draft, setDraft] = useState<typeof record | null>(null);

  const isEditing = draft !== null;
  const active = isEditing ? draft : record;
  const saved = hasEmergencyCoverage(record);

  const summary = useMemo(() => emergencyCoverageSummary(record), [record]);

  const startEdit = (): void => {
    setDraft({ ...record });
    setExpanded(true);
  };

  const cancelEdit = (): void => {
    setDraft(null);
  };

  const handleSave = async (): Promise<void> => {
    if (!draft) return;
        const ok = await save(draft);
        if (ok) {
          setDraft(null);
          setExpanded(false);
        }
  };

  if (loading) {
    return (
      <section className="rounded-3xl border border-rose-200 bg-rose-50/80 p-5 shadow-sm dark:border-rose-500/30 dark:bg-rose-950/30">
        <p className="text-sm text-rose-900/80 dark:text-rose-100/80">Loading emergency record…</p>
      </section>
    );
  }

  return (
    <section
      id="emergency-coverage-section"
      className="rounded-3xl border border-rose-200 bg-gradient-to-br from-rose-50 via-white to-orange-50 p-5 shadow-sm dark:border-rose-500/35 dark:from-rose-950/50 dark:via-slate-900 dark:to-orange-950/30"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-rose-600 dark:text-rose-300">
            Emergency
          </p>
          <h2 className="mt-1 text-xl font-bold text-slate-950 dark:text-white">
            Trip protection &amp; contacts
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Save the policy you purchased — provider, policy number, and 24/7 assistance — so it&apos;s one tap away in an emergency.
          </p>
        </div>
        <span className="text-3xl shrink-0" aria-hidden>
          🆘
        </span>
      </div>

      {!expanded && saved ? (
        <div className="mt-4 space-y-3">
          <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{summary}</p>
          <div className="flex flex-wrap gap-2">
            {record.assistancePhone ? (
              <a
                href={phoneHref(record.assistancePhone)}
                className="inline-flex min-h-[48px] items-center rounded-2xl bg-rose-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-rose-500"
              >
                Call assistance
              </a>
            ) : null}
            {record.emergencyContactPhone ? (
              <a
                href={phoneHref(record.emergencyContactPhone)}
                className="inline-flex min-h-[48px] items-center rounded-2xl border border-rose-300 bg-white px-4 py-3 text-sm font-bold text-rose-800 transition hover:bg-rose-50 dark:border-rose-500/40 dark:bg-slate-900 dark:text-rose-100 dark:hover:bg-rose-950/40"
              >
                Call {record.emergencyContactName || "emergency contact"}
              </a>
            ) : null}
            <button
              type="button"
              onClick={startEdit}
              className="inline-flex min-h-[48px] items-center rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Edit record
            </button>
          </div>
          {record.validThrough ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Coverage through {record.validThrough}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Provider / company
              </span>
              <input
                value={active.provider}
                onChange={(event) =>
                  isEditing
                    ? setDraft((prev) => (prev ? { ...prev, provider: event.target.value } : prev))
                    : setRecord({ ...record, provider: event.target.value })
                }
                placeholder="Allianz, World Nomads, credit card benefit…"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Policy number
              </span>
              <input
                value={active.policyNumber}
                onChange={(event) =>
                  isEditing
                    ? setDraft((prev) => (prev ? { ...prev, policyNumber: event.target.value } : prev))
                    : setRecord({ ...record, policyNumber: event.target.value })
                }
                placeholder="From your confirmation email"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                24/7 assistance phone
              </span>
              <input
                type="tel"
                value={active.assistancePhone}
                onChange={(event) =>
                  isEditing
                    ? setDraft((prev) => (prev ? { ...prev, assistancePhone: event.target.value } : prev))
                    : setRecord({ ...record, assistancePhone: event.target.value })
                }
                placeholder="+1 800 …"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Coverage valid through (optional)
              </span>
              <input
                type="date"
                value={active.validThrough}
                onChange={(event) =>
                  isEditing
                    ? setDraft((prev) => (prev ? { ...prev, validThrough: event.target.value } : prev))
                    : setRecord({ ...record, validThrough: event.target.value })
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Personal emergency contact
              </span>
              <input
                value={active.emergencyContactName}
                onChange={(event) =>
                  isEditing
                    ? setDraft((prev) =>
                        prev ? { ...prev, emergencyContactName: event.target.value } : prev,
                      )
                    : setRecord({ ...record, emergencyContactName: event.target.value })
                }
                placeholder="Name"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Contact phone
              </span>
              <input
                type="tel"
                value={active.emergencyContactPhone}
                onChange={(event) =>
                  isEditing
                    ? setDraft((prev) =>
                        prev ? { ...prev, emergencyContactPhone: event.target.value } : prev,
                      )
                    : setRecord({ ...record, emergencyContactPhone: event.target.value })
                }
                placeholder="+1 …"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Private and encrypted on your account only — never shared, exported, or sent to AI.
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                if (isEditing) {
                  void handleSave();
                  return;
                }
                void save(record).then((ok) => {
                  if (ok) setExpanded(false);
                });
              }}
              className="min-h-[48px] rounded-2xl bg-rose-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-rose-500 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save emergency record"}
            </button>
            {isEditing ? (
              <button
                type="button"
                onClick={cancelEdit}
                className="min-h-[48px] rounded-2xl border border-slate-300 px-5 py-3 text-sm font-semibold dark:border-slate-600"
              >
                Cancel
              </button>
            ) : saved ? (
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="min-h-[48px] rounded-2xl border border-slate-300 px-5 py-3 text-sm font-semibold dark:border-slate-600"
              >
                Collapse
              </button>
            ) : null}
          </div>
        </div>
      )}

      {error ? (
        <p className="mt-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-100">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mt-3 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
