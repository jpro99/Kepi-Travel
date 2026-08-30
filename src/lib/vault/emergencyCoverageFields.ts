import type { TravelVaultData } from "@/lib/vault/vaultStore";

export interface EmergencyCoverageRecord {
  provider: string;
  policyNumber: string;
  assistancePhone: string;
  validThrough: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
}

export function pickEmergencyCoverage(vault: TravelVaultData): EmergencyCoverageRecord {
  return {
    provider: vault.travelInsuranceProvider,
    policyNumber: vault.travelInsurancePolicyNumber,
    assistancePhone: vault.travelInsuranceEmergencyPhone,
    validThrough: vault.travelInsuranceValidThrough,
    emergencyContactName: vault.emergencyContactName,
    emergencyContactPhone: vault.emergencyContactPhone,
  };
}

export function mergeEmergencyCoverage(
  vault: TravelVaultData,
  record: EmergencyCoverageRecord,
): TravelVaultData {
  return {
    ...vault,
    travelInsuranceProvider: record.provider.trim(),
    travelInsurancePolicyNumber: record.policyNumber.trim(),
    travelInsuranceEmergencyPhone: record.assistancePhone.trim(),
    travelInsuranceValidThrough: record.validThrough.trim(),
    emergencyContactName: record.emergencyContactName.trim(),
    emergencyContactPhone: record.emergencyContactPhone.trim(),
  };
}

export function hasEmergencyCoverage(record: EmergencyCoverageRecord): boolean {
  return Boolean(
    record.provider ||
      record.policyNumber ||
      record.assistancePhone ||
      record.emergencyContactName ||
      record.emergencyContactPhone,
  );
}

export function emergencyCoverageSummary(record: EmergencyCoverageRecord): string {
  if (record.provider && record.policyNumber) {
    return `${record.provider} · ${record.policyNumber}`;
  }
  if (record.provider) return record.provider;
  if (record.policyNumber) return `Policy ${record.policyNumber}`;
  if (record.assistancePhone) return "Assistance line saved";
  if (record.emergencyContactName) return `Contact: ${record.emergencyContactName}`;
  return "Not saved yet";
}
