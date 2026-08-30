import "server-only";

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";

const VAULT_STORE_KEY = "vault/private";
const AES_ALGO = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;
const KEY_LENGTH_BYTES = 32;

/**
 * SECURITY RULES (must remain true):
 * 1) Vault data must never appear in console.log.
 * 2) Vault data must never be included in Sentry error reports.
 * 3) Vault data must never be passed to any AI model.
 * 4) Vault data must never appear in any export or share feature.
 */

export interface VaultLoyaltyEntry {
  program: string;
  membershipId: string;
}

export interface VaultCustomField {
  label: string;
  value: string;
}

export interface TravelVaultData {
  tsaPrecheckNumber: string;
  globalEntryNumber: string;
  knownTravelerNumber: string;
  passportNumber: string;
  passportExpiryDate: string;
  frequentFlyerNumbers: VaultLoyaltyEntry[];
  hotelLoyaltyNumbers: VaultLoyaltyEntry[];
  driverLicenseNumber: string;
  travelInsurancePolicyNumber: string;
  travelInsuranceProvider: string;
  travelInsuranceEmergencyPhone: string;
  travelInsuranceValidThrough: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  creditCardTravelBenefitsNotes: string;
  customFields: VaultCustomField[];
  updatedAt: string;
}

interface EncryptedVaultEnvelope {
  version: 1;
  ivBase64: string;
  tagBase64: string;
  ciphertextBase64: string;
  updatedAt: string;
}

function emptyVault(): TravelVaultData {
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
    travelInsuranceProvider: "",
    travelInsuranceEmergencyPhone: "",
    travelInsuranceValidThrough: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    creditCardTravelBenefitsNotes: "",
    customFields: [],
    updatedAt: new Date(0).toISOString(),
  };
}

function deriveEncryptionKey(userId: string): Buffer {
  const secret = process.env.VAULT_ENCRYPTION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("VAULT_ENCRYPTION_SECRET must be configured with at least 32 characters.");
  }
  return scryptSync(`${userId}:${secret}`, "kepi-vault-key-derivation", KEY_LENGTH_BYTES);
}

function sanitizeLoyaltyEntries(raw: unknown): VaultLoyaltyEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const candidate = entry as Partial<VaultLoyaltyEntry>;
      if (typeof candidate.program !== "string" || typeof candidate.membershipId !== "string") {
        return null;
      }
      const program = candidate.program.trim().slice(0, 120);
      const membershipId = candidate.membershipId.trim().slice(0, 160);
      if (!program && !membershipId) return null;
      return { program, membershipId };
    })
    .filter((entry): entry is VaultLoyaltyEntry => entry !== null);
}

function sanitizeCustomFields(raw: unknown): VaultCustomField[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const candidate = entry as Partial<VaultCustomField>;
      if (typeof candidate.label !== "string" || typeof candidate.value !== "string") return null;
      const label = candidate.label.trim().slice(0, 120);
      const value = candidate.value.trim().slice(0, 500);
      if (!label && !value) return null;
      return { label, value };
    })
    .filter((entry): entry is VaultCustomField => entry !== null);
}

function sanitizeVaultData(raw: unknown): TravelVaultData {
  const base = emptyVault();
  if (!raw || typeof raw !== "object") {
    return base;
  }
  const candidate = raw as Partial<TravelVaultData>;
  return {
    tsaPrecheckNumber: typeof candidate.tsaPrecheckNumber === "string" ? candidate.tsaPrecheckNumber.trim().slice(0, 80) : "",
    globalEntryNumber: typeof candidate.globalEntryNumber === "string" ? candidate.globalEntryNumber.trim().slice(0, 80) : "",
    knownTravelerNumber:
      typeof candidate.knownTravelerNumber === "string" ? candidate.knownTravelerNumber.trim().slice(0, 80) : "",
    passportNumber: typeof candidate.passportNumber === "string" ? candidate.passportNumber.trim().slice(0, 80) : "",
    passportExpiryDate:
      typeof candidate.passportExpiryDate === "string" ? candidate.passportExpiryDate.trim().slice(0, 40) : "",
    frequentFlyerNumbers: sanitizeLoyaltyEntries(candidate.frequentFlyerNumbers),
    hotelLoyaltyNumbers: sanitizeLoyaltyEntries(candidate.hotelLoyaltyNumbers),
    driverLicenseNumber:
      typeof candidate.driverLicenseNumber === "string" ? candidate.driverLicenseNumber.trim().slice(0, 120) : "",
    travelInsurancePolicyNumber:
      typeof candidate.travelInsurancePolicyNumber === "string"
        ? candidate.travelInsurancePolicyNumber.trim().slice(0, 120)
        : "",
    travelInsuranceProvider:
      typeof candidate.travelInsuranceProvider === "string"
        ? candidate.travelInsuranceProvider.trim().slice(0, 120)
        : "",
    travelInsuranceEmergencyPhone:
      typeof candidate.travelInsuranceEmergencyPhone === "string"
        ? candidate.travelInsuranceEmergencyPhone.trim().slice(0, 60)
        : "",
    travelInsuranceValidThrough:
      typeof candidate.travelInsuranceValidThrough === "string"
        ? candidate.travelInsuranceValidThrough.trim().slice(0, 40)
        : "",
    emergencyContactName:
      typeof candidate.emergencyContactName === "string" ? candidate.emergencyContactName.trim().slice(0, 120) : "",
    emergencyContactPhone:
      typeof candidate.emergencyContactPhone === "string" ? candidate.emergencyContactPhone.trim().slice(0, 60) : "",
    creditCardTravelBenefitsNotes:
      typeof candidate.creditCardTravelBenefitsNotes === "string"
        ? candidate.creditCardTravelBenefitsNotes.trim().slice(0, 1000)
        : "",
    customFields: sanitizeCustomFields(candidate.customFields),
    updatedAt:
      typeof candidate.updatedAt === "string" && candidate.updatedAt.trim().length > 0
        ? candidate.updatedAt.trim()
        : base.updatedAt,
  };
}

function encryptVaultData(vault: TravelVaultData, key: Buffer): EncryptedVaultEnvelope {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(AES_ALGO, key, iv, { authTagLength: AUTH_TAG_LENGTH_BYTES });
  const plaintext = Buffer.from(JSON.stringify(vault), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    version: 1,
    ivBase64: iv.toString("base64"),
    tagBase64: authTag.toString("base64"),
    ciphertextBase64: ciphertext.toString("base64"),
    updatedAt: vault.updatedAt,
  };
}

function decryptVaultData(encrypted: EncryptedVaultEnvelope, key: Buffer): TravelVaultData {
  const iv = Buffer.from(encrypted.ivBase64, "base64");
  const authTag = Buffer.from(encrypted.tagBase64, "base64");
  const ciphertext = Buffer.from(encrypted.ciphertextBase64, "base64");
  const decipher = createDecipheriv(AES_ALGO, key, iv, { authTagLength: AUTH_TAG_LENGTH_BYTES });
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return sanitizeVaultData(JSON.parse(plaintext.toString("utf8")));
}

function isEncryptedEnvelope(value: unknown): value is EncryptedVaultEnvelope {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<EncryptedVaultEnvelope>;
  return (
    candidate.version === 1 &&
    typeof candidate.ivBase64 === "string" &&
    typeof candidate.tagBase64 === "string" &&
    typeof candidate.ciphertextBase64 === "string" &&
    typeof candidate.updatedAt === "string"
  );
}

export async function getTravelVault(userId: string): Promise<TravelVaultData> {
  const key = deriveEncryptionKey(userId);
  const stored = await kvStoreGet<unknown>(VAULT_STORE_KEY, { userId });
  if (!isEncryptedEnvelope(stored)) {
    return emptyVault();
  }
  try {
    return decryptVaultData(stored, key);
  } catch {
    return emptyVault();
  }
}

export async function saveTravelVault(userId: string, data: TravelVaultData): Promise<TravelVaultData> {
  const key = deriveEncryptionKey(userId);
  const sanitized = sanitizeVaultData({
    ...data,
    updatedAt: new Date().toISOString(),
  });
  const encrypted = encryptVaultData(sanitized, key);
  await kvStoreSet(VAULT_STORE_KEY, encrypted, { userId });
  return sanitized;
}
