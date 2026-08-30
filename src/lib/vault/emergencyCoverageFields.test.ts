import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  emergencyCoverageSummary,
  hasEmergencyCoverage,
  mergeEmergencyCoverage,
  pickEmergencyCoverage,
} from "@/lib/vault/emergencyCoverageFields";
import type { TravelVaultData } from "@/lib/vault/vaultStore";

function sampleVault(overrides: Partial<TravelVaultData> = {}): TravelVaultData {
  return {
    tsaPrecheckNumber: "",
    globalEntryNumber: "",
    knownTravelerNumber: "",
    passportNumber: "",
    passportExpiryDate: "",
    frequentFlyerNumbers: [],
    hotelLoyaltyNumbers: [],
    driverLicenseNumber: "",
    travelInsurancePolicyNumber: "POL-123",
    travelInsuranceProvider: "Allianz",
    travelInsuranceEmergencyPhone: "+1 800 555 0100",
    travelInsuranceValidThrough: "2026-12-31",
    emergencyContactName: "Alex",
    emergencyContactPhone: "+1 555 010 9999",
    creditCardTravelBenefitsNotes: "",
    customFields: [],
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

describe("emergencyCoverageFields", () => {
  test("pick and merge round-trip coverage fields on vault", () => {
    const vault = sampleVault();
    const record = pickEmergencyCoverage(vault);
    assert.equal(record.provider, "Allianz");
    assert.equal(record.policyNumber, "POL-123");
    assert.equal(record.assistancePhone, "+1 800 555 0100");

    const merged = mergeEmergencyCoverage(vault, {
      ...record,
      provider: "World Nomads",
    });
    assert.equal(merged.travelInsuranceProvider, "World Nomads");
    assert.equal(merged.travelInsurancePolicyNumber, "POL-123");
  });

  test("hasEmergencyCoverage detects any saved field", () => {
    assert.equal(hasEmergencyCoverage(pickEmergencyCoverage(sampleVault())), true);
    assert.equal(
      hasEmergencyCoverage(
        pickEmergencyCoverage(
          sampleVault({
            travelInsuranceProvider: "",
            travelInsurancePolicyNumber: "",
            travelInsuranceEmergencyPhone: "",
            emergencyContactName: "",
            emergencyContactPhone: "",
          }),
        ),
      ),
      false,
    );
  });

  test("emergencyCoverageSummary prefers provider and policy number", () => {
    assert.equal(emergencyCoverageSummary(pickEmergencyCoverage(sampleVault())), "Allianz · POL-123");
  });
});
