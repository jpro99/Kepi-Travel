"use client";

import { useCallback, useEffect, useState } from "react";
import type { TravelVaultData } from "@/lib/vault/vaultStore";
import {
  type EmergencyCoverageRecord,
  mergeEmergencyCoverage,
  pickEmergencyCoverage,
} from "@/lib/vault/emergencyCoverageFields";

interface VaultResponse {
  vault?: TravelVaultData;
  error?: string;
}

function createEmptyRecord(): EmergencyCoverageRecord {
  return {
    provider: "",
    policyNumber: "",
    assistancePhone: "",
    validThrough: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
  };
}

/**
 * SECURITY: Vault data must never be logged, sent to AI, or exported.
 */
export function useEmergencyCoverage() {
  const [vault, setVault] = useState<TravelVaultData | null>(null);
  const [record, setRecord] = useState<EmergencyCoverageRecord>(createEmptyRecord);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/vault", { method: "GET", cache: "no-store" });
      const payload = (await response.json()) as VaultResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? `Unable to load coverage record (${response.status})`);
      }
      const nextVault = payload.vault ?? null;
      setVault(nextVault);
      setRecord(nextVault ? pickEmergencyCoverage(nextVault) : createEmptyRecord());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load coverage record.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (nextRecord: EmergencyCoverageRecord): Promise<boolean> => {
      if (!vault) {
        setError("Vault not loaded yet. Try again in a moment.");
        return false;
      }
      setSaving(true);
      setError(null);
      setNotice(null);
      try {
        const response = await fetch("/api/vault", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vault: mergeEmergencyCoverage(vault, nextRecord),
          }),
        });
        const payload = (await response.json()) as VaultResponse;
        if (!response.ok) {
          throw new Error(payload.error ?? `Save failed (${response.status})`);
        }
        if (payload.vault) {
          setVault(payload.vault);
          setRecord(pickEmergencyCoverage(payload.vault));
        } else {
          setRecord(nextRecord);
        }
        setNotice("Emergency record saved.");
        return true;
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : "Unable to save coverage record.");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [vault],
  );

  return {
    record,
    setRecord,
    loading,
    saving,
    error,
    notice,
    setNotice,
    setError,
    save,
    reload: load,
  };
}
