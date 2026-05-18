"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type DocumentType =
  | "passport"
  | "visa"
  | "boarding pass"
  | "hotel confirmation"
  | "travel insurance waiver"
  | "car rental agreement"
  | "travel authorization";

interface TravelDocument {
  id: string;
  type: DocumentType;
  name: string;
  tripId: string;
  reservationId?: string;
  uploadedAt: string;
  expiresAt?: string;
  notes: string;
  externalUrl?: string;
}

interface DocumentVaultProps {
  activeTripId: string | null;
}

const DOCUMENT_TYPES: DocumentType[] = [
  "passport",
  "visa",
  "boarding pass",
  "hotel confirmation",
  "travel insurance waiver",
  "car rental agreement",
  "travel authorization",
];

const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  passport: "Passport",
  visa: "Visa",
  "boarding pass": "Boarding pass",
  "hotel confirmation": "Hotel confirmation",
  "travel insurance waiver": "Travel insurance waiver",
  "car rental agreement": "Car rental agreement",
  "travel authorization": "Travel authorization",
};

function expiryState(expiresAt: string | undefined, nowMs: number): {
  tone: "neutral" | "warning" | "critical";
  label: string;
} {
  if (!expiresAt) {
    return { tone: "neutral", label: "No expiration date" };
  }
  const expiresAtMs = Date.parse(expiresAt);
  if (Number.isNaN(expiresAtMs)) {
    return { tone: "warning", label: "Expiration date format is invalid" };
  }
  const diffDays = Math.ceil((expiresAtMs - nowMs) / (24 * 60 * 60 * 1000));
  if (diffDays < 0) {
    return { tone: "critical", label: `Expired ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? "" : "s"} ago` };
  }
  if (diffDays <= 30) {
    return { tone: "warning", label: `Expires in ${diffDays} day${diffDays === 1 ? "" : "s"}` };
  }
  return { tone: "neutral", label: `Expires in ${diffDays} days` };
}

function formatDate(value: string | undefined): string {
  if (!value) return "N/A";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString();
}

export function DocumentVault({ activeTripId }: DocumentVaultProps) {
  const [documents, setDocuments] = useState<TravelDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<DocumentType>("passport");
  const [formName, setFormName] = useState("");
  const [formReservationId, setFormReservationId] = useState("");
  const [formExpiresAt, setFormExpiresAt] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formExternalUrl, setFormExternalUrl] = useState("");

  const loadDocuments = useCallback(async (): Promise<void> => {
    if (!activeTripId) {
      setDocuments([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/documents?tripId=${encodeURIComponent(activeTripId)}`, {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Documents API returned ${response.status}`);
      }
      const payload = (await response.json()) as { documents?: TravelDocument[] };
      setDocuments(Array.isArray(payload.documents) ? payload.documents : []);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Unable to load documents.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [activeTripId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadDocuments();
    }, 0);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [loadDocuments]);

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const groupedDocuments = useMemo(() => {
    const groups = new Map<DocumentType, TravelDocument[]>();
    for (const type of DOCUMENT_TYPES) {
      groups.set(type, []);
    }
    for (const document of documents) {
      const existing = groups.get(document.type);
      if (existing) {
        existing.push(document);
      }
    }
    return groups;
  }, [documents]);

  const quickAccessDocuments = useMemo(
    () => documents.filter((document) => document.type === "passport" || document.type === "boarding pass").slice(0, 4),
    [documents],
  );

  const resetForm = (): void => {
    setFormType("passport");
    setFormName("");
    setFormReservationId("");
    setFormExpiresAt("");
    setFormNotes("");
    setFormExternalUrl("");
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!activeTripId) {
      setError("Select an active trip before adding documents.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: formType,
          name: formName.trim(),
          tripId: activeTripId,
          reservationId: formReservationId.trim() || undefined,
          expiresAt: formExpiresAt.trim() || undefined,
          notes: formNotes.trim() || undefined,
          externalUrl: formExternalUrl.trim() || undefined,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || `Failed to add document (${response.status})`);
      }
      resetForm();
      setShowForm(false);
      await loadDocuments();
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Unable to add document.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (documentId: string): Promise<void> => {
    setError(null);
    try {
      const response = await fetch("/api/documents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: documentId }),
      });
      if (!response.ok) {
        throw new Error(`Failed to delete document (${response.status})`);
      }
      await loadDocuments();
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Unable to delete document.";
      setError(message);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Document vault</h2>
          <p className="text-xs text-slate-400">Store critical travel document metadata and expiration reminders.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((value) => !value)}
          className="rounded-lg bg-cyan-500/90 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-cyan-400"
        >
          {showForm ? "Close form" : "Add document"}
        </button>
      </div>

      {showForm ? (
        <form onSubmit={handleSubmit} className="grid gap-3 rounded-xl border border-slate-700 bg-slate-950/60 p-3 md:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-slate-300">Type</span>
            <select
              value={formType}
              onChange={(event) => setFormType(event.target.value as DocumentType)}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5"
            >
              {DOCUMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {DOCUMENT_TYPE_LABEL[type]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-slate-300">Name</span>
            <input
              required
              value={formName}
              onChange={(event) => setFormName(event.target.value)}
              placeholder="Passport card, Delta boarding pass..."
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-slate-300">Reservation ID (optional)</span>
            <input
              value={formReservationId}
              onChange={(event) => setFormReservationId(event.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-slate-300">Expiration date (optional)</span>
            <input
              type="date"
              value={formExpiresAt}
              onChange={(event) => setFormExpiresAt(event.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5"
            />
          </label>
          <label className="text-sm md:col-span-2">
            <span className="mb-1 block text-xs text-slate-300">External doc link (optional)</span>
            <input
              type="url"
              value={formExternalUrl}
              onChange={(event) => setFormExternalUrl(event.target.value)}
              placeholder="https://drive.google.com/..."
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5"
            />
          </label>
          <label className="text-sm md:col-span-2">
            <span className="mb-1 block text-xs text-slate-300">Notes</span>
            <textarea
              rows={3}
              value={formNotes}
              onChange={(event) => setFormNotes(event.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5"
            />
          </label>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-emerald-500/90 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
            >
              {isSubmitting ? "Saving..." : "Save document"}
            </button>
          </div>
        </form>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</p>
      ) : null}

      <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
        <h3 className="text-sm font-semibold text-slate-100">Quick access</h3>
        {quickAccessDocuments.length === 0 ? (
          <p className="mt-2 text-xs text-slate-400">No passport or boarding pass docs added yet.</p>
        ) : (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {quickAccessDocuments.map((document) => {
              const state = expiryState(document.expiresAt, nowMs);
              return (
                <div
                  key={document.id}
                  className={`rounded-lg border px-3 py-2 text-xs ${
                    state.tone === "critical"
                      ? "border-red-400/70 bg-red-500/15 text-red-100"
                      : state.tone === "warning"
                        ? "border-amber-400/70 bg-amber-500/15 text-amber-100"
                        : "border-slate-700 bg-slate-900 text-slate-300"
                  }`}
                >
                  <p className="font-semibold">{document.name}</p>
                  <p>{DOCUMENT_TYPE_LABEL[document.type]}</p>
                  <p>{state.label}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {isLoading ? <p className="text-sm text-slate-400">Loading documents...</p> : null}
      {!isLoading && documents.length === 0 ? (
        <p className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-400">
          No documents added for this trip yet.
        </p>
      ) : null}

      {!isLoading
        ? DOCUMENT_TYPES.map((type) => {
            const docs = groupedDocuments.get(type) ?? [];
            if (docs.length === 0) {
              return null;
            }
            return (
              <article key={type} className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                <h3 className="text-sm font-semibold text-slate-100">{DOCUMENT_TYPE_LABEL[type]}</h3>
                <ul className="mt-2 space-y-2">
                  {docs.map((document) => {
                    const state = expiryState(document.expiresAt, nowMs);
                    return (
                      <li
                        key={document.id}
                        className={`rounded-lg border px-3 py-2 text-sm ${
                          state.tone === "critical"
                            ? "border-red-400/70 bg-red-500/15 text-red-100"
                            : state.tone === "warning"
                              ? "border-amber-400/70 bg-amber-500/15 text-amber-100"
                              : "border-slate-700 bg-slate-900 text-slate-200"
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="space-y-1">
                            <p className="font-semibold">{document.name}</p>
                            <p className="text-xs opacity-90">Uploaded {formatDate(document.uploadedAt)}</p>
                            <p className="text-xs opacity-90">{state.label}</p>
                            {document.notes ? <p className="text-xs opacity-90">{document.notes}</p> : null}
                            {document.externalUrl ? (
                              <a
                                href={document.externalUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex text-xs font-semibold text-cyan-200 underline"
                              >
                                Open linked document
                              </a>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              void handleDelete(document.id);
                            }}
                            className="rounded-md bg-slate-800 px-2 py-1 text-xs ring-1 ring-slate-700 hover:bg-slate-700"
                          >
                            Remove
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </article>
            );
          })
        : null}
    </section>
  );
}
