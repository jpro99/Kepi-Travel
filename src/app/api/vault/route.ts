import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { enforceRateLimit } from "@/lib/rateLimit";
import { getTravelVault, saveTravelVault } from "@/lib/vault/vaultStore";
import { generateId } from "@/lib/utils/generateId";

const LoyaltyEntrySchema = z.object({
  program: z.string().trim().max(120),
  membershipId: z.string().trim().max(160),
});

const CustomFieldSchema = z.object({
  label: z.string().trim().max(120),
  value: z.string().trim().max(500),
});

const VaultPayloadSchema = z.object({
  tsaPrecheckNumber: z.string().trim().max(80),
  globalEntryNumber: z.string().trim().max(80),
  knownTravelerNumber: z.string().trim().max(80),
  passportNumber: z.string().trim().max(80),
  passportExpiryDate: z.string().trim().max(40),
  frequentFlyerNumbers: z.array(LoyaltyEntrySchema).max(40),
  hotelLoyaltyNumbers: z.array(LoyaltyEntrySchema).max(40),
  driverLicenseNumber: z.string().trim().max(120),
  travelInsurancePolicyNumber: z.string().trim().max(120),
  travelInsuranceProvider: z.string().trim().max(120),
  travelInsuranceEmergencyPhone: z.string().trim().max(60),
  travelInsuranceValidThrough: z.string().trim().max(40),
  emergencyContactName: z.string().trim().max(120),
  emergencyContactPhone: z.string().trim().max(60),
  creditCardTravelBenefitsNotes: z.string().trim().max(1000),
  customFields: z.array(CustomFieldSchema).max(60),
});

const PostBodySchema = z.object({
  userId: z.string().trim().min(1).optional(),
  vault: VaultPayloadSchema,
});

/**
 * SECURITY RULES (must remain true):
 * - Vault data must never appear in console.log.
 * - Vault data must never be included in Sentry error reports.
 * - Vault data must never be passed to any AI model.
 * - Vault data must never appear in any export or share feature.
 */

async function authorize(req: Request): Promise<
  | { ok: true; userId: string; headers: Headers; requestId: string }
  | { ok: false; response: NextResponse }
> {
  const requestId = req.headers.get("x-request-id")?.trim() || generateId();
  const userId = await resolveAuthenticatedUserId();
  if (!userId) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const rateLimit = await enforceRateLimit({
    policyName: "travel-updates-general",
    identifier: userId,
    route: "/api/vault",
    requestId,
  });
  if (!rateLimit.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Too many vault requests. Please retry shortly." },
        { status: 429, headers: rateLimit.headers },
      ),
    };
  }
  return { ok: true, userId, headers: rateLimit.headers, requestId };
}

export async function GET(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) return auth.response;

  // Vault access is restricted to the currently authenticated owner only.
  const vault = await getTravelVault(auth.userId);
  return NextResponse.json({ vault }, { headers: auth.headers });
}

export async function POST(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) return auth.response;

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = PostBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422, headers: auth.headers },
    );
  }

  // Reject any attempt to save a vault for a different owner.
  if (parsed.data.userId && parsed.data.userId !== auth.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: auth.headers });
  }

  const vault = await saveTravelVault(auth.userId, {
    ...parsed.data.vault,
    updatedAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, vault }, { headers: auth.headers });
}
