import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { enforceRateLimit } from "@/lib/rateLimit";
import {
  changeForwardHandle,
  getEmailForwardSetupStatus,
  markGmailPromptSeen,
} from "@/lib/travelAssistant/emailForwardSetupStore";
import { getGmailConnectionStatus } from "@/lib/travelAssistant/gmailOAuthService";

const BodySchema = z.object({
  action: z.enum(["create-forward-address", "dismiss-gmail-prompt", "mark-gmail-prompt-seen", "change-forward-handle"]),
  customHandle: z.string().trim().max(40).optional(),
});

async function authorize(req: Request): Promise<
  | { ok: true; userId: string; headers: Headers }
  | { ok: false; response: NextResponse }
> {
  const requestId = req.headers.get("x-request-id")?.trim() || randomUUID();
  const userId = await resolveAuthenticatedUserId();
  if (!userId) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const rateLimit = await enforceRateLimit({
    policyName: "travel-updates-general",
    identifier: userId,
    route: "/api/email-forward/setup",
    requestId,
  });
  if (!rateLimit.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Too many email setup requests. Please retry shortly." },
        { status: 429, headers: rateLimit.headers },
      ),
    };
  }
  return { ok: true, userId, headers: rateLimit.headers };
}

export async function GET(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) return auth.response;
  const [setupStatus, gmailStatus] = await Promise.all([
    getEmailForwardSetupStatus(auth.userId),
    getGmailConnectionStatus(auth.userId),
  ]);
  return NextResponse.json(
    {
      ...setupStatus,
      gmailConnected: gmailStatus.connected,
    },
    { headers: auth.headers },
  );
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
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422, headers: auth.headers },
    );
  }

  if (parsed.data.action === "create-forward-address") {
    const setupStatus = await getEmailForwardSetupStatus(auth.userId);
    await markGmailPromptSeen(auth.userId);
    const gmailStatus = await getGmailConnectionStatus(auth.userId);
    return NextResponse.json(
      {
        ok: true,
        ...setupStatus,
        gmailPromptSeen: true,
        gmailConnected: gmailStatus.connected,
      },
      { headers: auth.headers },
    );
  }

  if (parsed.data.action === "change-forward-handle") {
    const customHandle = parsed.data.customHandle?.trim() ?? "";
    if (!customHandle) {
      return NextResponse.json(
        { error: "Custom handle is required." },
        { status: 422, headers: auth.headers },
      );
    }
    try {
      const [setupStatus, gmailStatus] = await Promise.all([
        changeForwardHandle(auth.userId, customHandle),
        getGmailConnectionStatus(auth.userId),
      ]);
      await markGmailPromptSeen(auth.userId);
      return NextResponse.json(
        {
          ok: true,
          ...setupStatus,
          gmailPromptSeen: true,
          gmailConnected: gmailStatus.connected,
        },
        { headers: auth.headers },
      );
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Could not update forwarding handle." },
        { status: 400, headers: auth.headers },
      );
    }
  }

  await markGmailPromptSeen(auth.userId);
  const [setupStatus, gmailStatus] = await Promise.all([getEmailForwardSetupStatus(auth.userId), getGmailConnectionStatus(auth.userId)]);
  return NextResponse.json(
    {
      ok: true,
      ...setupStatus,
      gmailPromptSeen: true,
      gmailConnected: gmailStatus.connected,
    },
    { headers: auth.headers },
  );
}
