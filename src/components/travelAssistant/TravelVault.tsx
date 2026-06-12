"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface VaultLoyaltyEntry {
  program: string;
  membershipId: string;
}

interface VaultCustomField {
  label: string;
  value: string;
}

interface TravelVaultData {
  tsaPrecheckNumber: string;
  globalEntryNumber: string;
  knownTravelerNumber: string;
  passportNumber: string;
  passportExpiryDate: string;
  frequentFlyerNumbers: VaultLoyaltyEntry[];
  hotelLoyaltyNumbers: VaultLoyaltyEntry[];
  driverLicenseNumber: string;
  travelInsurancePolicyNumber: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  creditCardTravelBenefitsNotes: string;
  customFields: VaultCustomField[];
  updatedAt: string;
}

interface VaultPayload {
  vault?: TravelVaultData;
  error?: string;
}

const REVEAL_CONFIRM_MESSAGE =
  "Are you sure you want to reveal this? Make sure no one is looking at your screen";

/**
 * SECURITY RULES (must remain true):
 * - Vault data must never appear in console.log.
 * - Vault data must never be included in Sentry error reports.
 * - Vault data must never be passed to any AI model.
 * - Vault data must never appear in any export or share feature.
 */

function createEmptyVault(): TravelVaultData {
  return {
    tsaPrecheckNumber: "",
    globalEntryNumber: "",
    knownTravelerNumber: "",
    passportNumber: "",
    passportExpiryDate: "",
    frequentFlyerNumbers: [],
    hotelLoyaltyNumbers: [],
    driverLicenseNumber: "",
    travelInsurancePolicyNumber: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    creditCardTravelBenefitsNotes: "",
    customFields: [],
    updatedAt: new Date(0).toISOString(),
  };
}

function maskValue(value: string): string {
  if (!value) return "Not set";
  return "•".repeat(Math.min(16, Math.max(8, value.length)));
}

interface SecretRowProps {
  rowId: string;
  label: string;
  value: string;
  revealed: boolean;
  editing: boolean;
  editValue: string;
  onRequestReveal: (rowId: string) => void;
  onCopy: (label: string, value: string) => Promise<void>;
  onStartEdit: (rowId: string, value: string) => void;
  onEditValueChange: (rowId: string, nextValue: string) => void;
  onSaveEdit: (rowId: string) => void;
  onCancelEdit: (rowId: string) => void;
  inputType?: "text" | "date";
  multiline?: boolean;
}

function SecretRow({
  rowId,
  label,
  value,
  revealed,
  editing,
  editValue,
  onRequestReveal,
  onCopy,
  onStartEdit,
  onEditValueChange,
  onSaveEdit,
  onCancelEdit,
  inputType = "text",
  multiline = false,
}: SecretRowProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      {editing ? (
        <div className="mt-2 space-y-2">
          {multiline ? (
            <textarea
              rows={3}
              value={editValue}
              onChange={(event) => onEditValueChange(rowId, event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          ) : (
            <input
              type={inputType}
              value={editValue}
              onChange={(event) => onEditValueChange(rowId, event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onSaveEdit(rowId)}
              className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-400"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => onCancelEdit(rowId)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold dark:border-slate-700"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-2 break-all text-sm text-slate-800 dark:text-slate-100">{revealed ? value || "Not set" : maskValue(value)}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onRequestReveal(rowId)}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold dark:border-slate-700"
            >
              {revealed ? "🙈 Hide" : "👁 Reveal"}
            </button>
            <button
              type="button"
              onClick={() => {
                void onCopy(label, value);
              }}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold dark:border-slate-700"
            >
              ⧉ Copy
            </button>
            <button
              type="button"
              onClick={() => onStartEdit(rowId, value)}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold dark:border-slate-700"
            >
              ✎ Edit
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function TravelVault() {
  const [vault, setVault] = useState<TravelVaultData>(createEmptyVault);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [newFrequentFlyerProgram, setNewFrequentFlyerProgram] = useState("");
  const [newFrequentFlyerId, setNewFrequentFlyerId] = useState("");
  const [newHotelProgram, setNewHotelProgram] = useState("");
  const [newHotelId, setNewHotelId] = useState("");
  const [newCustomLabel, setNewCustomLabel] = useState("");
  const [newCustomValue, setNewCustomValue] = useState("");

  const loadVault = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/vault", { method: "GET", cache: "no-store" });
      const payload = (await response.json()) as VaultPayload;
      if (!response.ok) {
        throw new Error(payload.error ?? `Vault API returned ${response.status}`);
      }
      setVault(payload.vault ?? createEmptyVault());
      setDirty(false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load vault.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadVault();
    }, 0);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [loadVault]);

  const requestReveal = useCallback((rowId: string): void => {
    setRevealed((prev) => {
      if (prev[rowId]) {
        return { ...prev, [rowId]: false };
      }
      if (!window.confirm(REVEAL_CONFIRM_MESSAGE)) {
        return prev;
      }
      return { ...prev, [rowId]: true };
    });
  }, []);

  const copyValue = useCallback(async (label: string, value: string): Promise<void> => {
    if (!value) {
      setNotice(`No value set for ${label}.`);
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied to clipboard.`);
    } catch {
      setError("Clipboard unavailable.");
    }
  }, []);

  const saveVault = useCallback(async (): Promise<void> => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vault }),
      });
      const payload = (await response.json()) as VaultPayload;
      if (!response.ok) {
        throw new Error(payload.error ?? `Vault save failed with ${response.status}`);
      }
      if (payload.vault) {
        setVault(payload.vault);
      }
      setDirty(false);
      setNotice("Vault saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save vault.");
    } finally {
      setSaving(false);
    }
  }, [vault]);

  const scalarRows = useMemo(
    () =>
      [
        { key: "tsaPrecheckNumber", label: "TSA PreCheck number", value: vault.tsaPrecheckNumber },
        { key: "globalEntryNumber", label: "Global Entry number", value: vault.globalEntryNumber },
        { key: "knownTravelerNumber", label: "Known Traveler Number (KTN)", value: vault.knownTravelerNumber },
        { key: "passportNumber", label: "Passport number", value: vault.passportNumber },
        { key: "passportExpiryDate", label: "Passport expiry date", value: vault.passportExpiryDate, inputType: "date" as const },
        { key: "driverLicenseNumber", label: "Driver license number", value: vault.driverLicenseNumber },
        { key: "travelInsurancePolicyNumber", label: "Travel insurance policy number", value: vault.travelInsurancePolicyNumber },
        { key: "emergencyContactName", label: "Emergency contact name", value: vault.emergencyContactName },
        { key: "emergencyContactPhone", label: "Emergency contact phone", value: vault.emergencyContactPhone },
        {
          key: "creditCardTravelBenefitsNotes",
          label: "Credit card travel benefits notes",
          value: vault.creditCardTravelBenefitsNotes,
          multiline: true,
        },
      ] as const,
    [vault],
  );

  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm text-slate-600 dark:text-slate-300">Loading your private vault...</p>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">My Travel Vault — Private</h2>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            This information is private and encrypted. It is never shared, exported, or visible to anyone else
          </p>
        </div>
        <button
          type="button"
          onClick={() => void saveVault()}
          disabled={saving || !dirty}
          className="rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save vault"}
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200">
          {notice}
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {scalarRows.map((row) => (
          <SecretRow
            key={row.key}
            rowId={row.key}
            label={row.label}
            value={row.value}
            revealed={Boolean(revealed[row.key])}
            editing={Object.prototype.hasOwnProperty.call(editing, row.key)}
            editValue={editing[row.key] ?? row.value}
            onRequestReveal={requestReveal}
            onCopy={copyValue}
            onStartEdit={(rowId, value) => setEditing((prev) => ({ ...prev, [rowId]: value }))}
            onEditValueChange={(rowId, nextValue) => setEditing((prev) => ({ ...prev, [rowId]: nextValue }))}
            onSaveEdit={(rowId) => {
              const nextValue = (editing[rowId] ?? "").trim();
              setVault((prev) => ({ ...prev, [rowId]: nextValue } as TravelVaultData));
              setEditing((prev) => {
                const clone = { ...prev };
                delete clone[rowId];
                return clone;
              });
              setDirty(true);
            }}
            onCancelEdit={(rowId) =>
              setEditing((prev) => {
                const clone = { ...prev };
                delete clone[rowId];
                return clone;
              })
            }
            inputType={"inputType" in row ? row.inputType : undefined}
            multiline={"multiline" in row ? row.multiline : undefined}
          />
        ))}
      </div>

      <article className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
        <h3 className="text-sm font-semibold">Frequent flyer numbers</h3>
        <div className="mt-2 space-y-2">
          {vault.frequentFlyerNumbers.map((entry, index) => {
            const rowId = `ff-${index}`;
            return (
              <div key={rowId} className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                <p className="text-xs text-slate-500 dark:text-slate-400">{entry.program || "Airline"}</p>
                <SecretRow
                  rowId={rowId}
                  label="Membership ID"
                  value={entry.membershipId}
                  revealed={Boolean(revealed[rowId])}
                  editing={Object.prototype.hasOwnProperty.call(editing, rowId)}
                  editValue={editing[rowId] ?? entry.membershipId}
                  onRequestReveal={requestReveal}
                  onCopy={copyValue}
                  onStartEdit={(_id, value) => setEditing((prev) => ({ ...prev, [rowId]: value }))}
                  onEditValueChange={(_id, nextValue) => setEditing((prev) => ({ ...prev, [rowId]: nextValue }))}
                  onSaveEdit={() => {
                    const nextMembershipId = (editing[rowId] ?? "").trim();
                    setVault((prev) => {
                      const next = [...prev.frequentFlyerNumbers];
                      if (!next[index]) return prev;
                      next[index] = { ...next[index], membershipId: nextMembershipId };
                      return { ...prev, frequentFlyerNumbers: next };
                    });
                    setEditing((prev) => {
                      const clone = { ...prev };
                      delete clone[rowId];
                      return clone;
                    });
                    setDirty(true);
                  }}
                  onCancelEdit={() =>
                    setEditing((prev) => {
                      const clone = { ...prev };
                      delete clone[rowId];
                      return clone;
                    })
                  }
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                  onClick={() => {
                    setVault((prev) => {
                      const next = [...prev.frequentFlyerNumbers];
                      next.splice(index, 1);
                      return { ...prev, frequentFlyerNumbers: next };
                    });
                    setDirty(true);
                  }}
                    className="rounded-md border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 dark:border-red-500/40 dark:text-red-200"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <input
            value={newFrequentFlyerProgram}
            onChange={(event) => setNewFrequentFlyerProgram(event.target.value)}
            placeholder="Airline"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
          <input
            value={newFrequentFlyerId}
            onChange={(event) => setNewFrequentFlyerId(event.target.value)}
            placeholder="Membership number"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
          <button
            type="button"
            onClick={() => {
              const program = newFrequentFlyerProgram.trim();
              const membershipId = newFrequentFlyerId.trim();
              if (!program && !membershipId) return;
              setVault((prev) => ({
                ...prev,
                frequentFlyerNumbers: [...prev.frequentFlyerNumbers, { program, membershipId }],
              }));
              setNewFrequentFlyerProgram("");
              setNewFrequentFlyerId("");
              setDirty(true);
            }}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
          >
            Add airline
          </button>
        </div>
      </article>

      <article className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
        <h3 className="text-sm font-semibold">Hotel loyalty numbers</h3>
        <div className="mt-2 space-y-2">
          {vault.hotelLoyaltyNumbers.map((entry, index) => (
            <div key={`hotel-${index}`} className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
              {(() => {
                const rowId = `hotel-${index}`;
                const isRevealed = Boolean(revealed[rowId]);
                return (
                  <>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{entry.program || "Hotel chain"}</p>
                    <p className="mt-1 text-sm">{isRevealed ? entry.membershipId || "Not set" : maskValue(entry.membershipId)}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => requestReveal(rowId)}
                        className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold dark:border-slate-700"
                      >
                        {isRevealed ? "🙈 Hide" : "👁 Reveal"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void copyValue("Hotel loyalty number", entry.membershipId);
                        }}
                        className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold dark:border-slate-700"
                      >
                        ⧉ Copy
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const nextValue = window.prompt("Update hotel loyalty number", entry.membershipId);
                          if (nextValue === null) return;
                          setVault((prev) => {
                            const next = [...prev.hotelLoyaltyNumbers];
                            if (!next[index]) return prev;
                            next[index] = { ...next[index], membershipId: nextValue.trim() };
                            return { ...prev, hotelLoyaltyNumbers: next };
                          });
                          setDirty(true);
                        }}
                        className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold dark:border-slate-700"
                      >
                        ✎ Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setVault((prev) => {
                            const next = [...prev.hotelLoyaltyNumbers];
                            next.splice(index, 1);
                            return { ...prev, hotelLoyaltyNumbers: next };
                          });
                          setDirty(true);
                        }}
                        className="rounded-md border border-red-300 px-2.5 py-1.5 text-xs font-semibold text-red-700 dark:border-red-500/40 dark:text-red-200"
                      >
                        Remove
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          ))}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <input
            value={newHotelProgram}
            onChange={(event) => setNewHotelProgram(event.target.value)}
            placeholder="Hotel chain"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
          <input
            value={newHotelId}
            onChange={(event) => setNewHotelId(event.target.value)}
            placeholder="Membership number"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
          <button
            type="button"
            onClick={() => {
              const program = newHotelProgram.trim();
              const membershipId = newHotelId.trim();
              if (!program && !membershipId) return;
              setVault((prev) => ({
                ...prev,
                hotelLoyaltyNumbers: [...prev.hotelLoyaltyNumbers, { program, membershipId }],
              }));
              setNewHotelProgram("");
              setNewHotelId("");
              setDirty(true);
            }}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
          >
            Add hotel
          </button>
        </div>
      </article>

      <article className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
        <h3 className="text-sm font-semibold">Custom fields</h3>
        <div className="mt-2 space-y-2">
          {vault.customFields.map((entry, index) => (
            <div key={`custom-${index}`} className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
              {(() => {
                const rowId = `custom-${index}`;
                const isRevealed = Boolean(revealed[rowId]);
                return (
                  <>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{entry.label || "Custom field"}</p>
                    <p className="mt-1 text-sm">{isRevealed ? entry.value || "Not set" : maskValue(entry.value)}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => requestReveal(rowId)}
                        className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold dark:border-slate-700"
                      >
                        {isRevealed ? "🙈 Hide" : "👁 Reveal"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void copyValue(entry.label || "Custom field", entry.value);
                        }}
                        className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold dark:border-slate-700"
                      >
                        ⧉ Copy
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const nextValue = window.prompt(`Update ${entry.label || "custom value"}`, entry.value);
                          if (nextValue === null) return;
                          setVault((prev) => {
                            const next = [...prev.customFields];
                            if (!next[index]) return prev;
                            next[index] = { ...next[index], value: nextValue.trim() };
                            return { ...prev, customFields: next };
                          });
                          setDirty(true);
                        }}
                        className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold dark:border-slate-700"
                      >
                        ✎ Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setVault((prev) => {
                            const next = [...prev.customFields];
                            next.splice(index, 1);
                            return { ...prev, customFields: next };
                          });
                          setDirty(true);
                        }}
                        className="rounded-md border border-red-300 px-2.5 py-1.5 text-xs font-semibold text-red-700 dark:border-red-500/40 dark:text-red-200"
                      >
                        Remove
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          ))}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <input
            value={newCustomLabel}
            onChange={(event) => setNewCustomLabel(event.target.value)}
            placeholder="Field label"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
          <input
            value={newCustomValue}
            onChange={(event) => setNewCustomValue(event.target.value)}
            placeholder="Field value"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
          <button
            type="button"
            onClick={() => {
              const label = newCustomLabel.trim();
              const value = newCustomValue.trim();
              if (!label && !value) return;
              setVault((prev) => ({
                ...prev,
                customFields: [...prev.customFields, { label, value }],
              }));
              setNewCustomLabel("");
              setNewCustomValue("");
              setDirty(true);
            }}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
          >
            Add custom field
          </button>
        </div>
      </article>
    </section>
  );
}
