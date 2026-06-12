import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminUserId } from "@/lib/admin/adminAccess";
import { auth } from "@clerk/nextjs/server";
import { createInviteCode, getInviteCodeRecord } from "@/lib/invite/inviteCodeStore";
import { InviteEmail } from "@/lib/email/templates/inviteEmail";
import { getResendClient, getResendFromEmail } from "@/lib/email/resendClient";
import { createElement } from "react";
import { render } from "@react-email/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  email: z.string().email(),
  type: z.enum(["lifetime", "trial-30"]),
  note: z.string().trim().max(200).optional(),
  // If provided, reuse this existing code instead of creating a new one (resend)
  existingCode: z.string().trim().max(60).optional(),
});

async function sendInviteEmail(args: {
  email: string;
  code: string;
  type: "lifetime" | "trial-30";
  redeemUrl: string;
}): Promise<{ emailSent: boolean; warning?: string }> {
  const resend = getResendClient();
  if (!resend) {
    return { emailSent: false, warning: "RESEND_API_KEY not configured — code generated but email not sent." };
  }

  let html: string;
  try {
    html = await render(createElement(InviteEmail, {
      recipientEmail: args.email,
      inviteCode: args.code,
      inviteType: args.type,
      redeemUrl: args.redeemUrl,
    }));
  } catch (err) {
    return { emailSent: false, warning: "Email render failed: " + (err instanceof Error ? err.message : String(err)) };
  }

  try {
    const { error: sendError } = await resend.emails.send({
      from: getResendFromEmail(),
      to: args.email,
      subject: args.type === "lifetime"
        ? "You\'re invited to Kepi — Lifetime Access"
        : "You\'re invited to Kepi — 30-Day Trial",
      html,
    });
    if (sendError) {
      return { emailSent: false, warning: "Email failed: " + sendError.message };
    }
    return { emailSent: true };
  } catch (err) {
    return { emailSent: false, warning: "Email failed: " + (err instanceof Error ? err.message : String(err)) };
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { userId } = await auth();
    if (!userId || !isAdminUserId(userId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try { body = await request.json(); } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request: " + (parsed.error.issues[0]?.message ?? "unknown") }, { status: 400 });
    }

    const { email, type, note, existingCode } = parsed.data;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim() || "https://kepitravel.com";

    // ── RESEND: reuse existing code ──────────────────────────────────────────
    if (existingCode) {
      const record = await getInviteCodeRecord(existingCode);
      if (!record) {
        return NextResponse.json({ error: "Invite code not found: " + existingCode }, { status: 404 });
      }
      if (record.status === "revoked") {
        return NextResponse.json({ error: "Cannot resend a revoked invite code." }, { status: 400 });
      }
      if (record.status === "used") {
        return NextResponse.json({ error: "Cannot resend — this code has already been redeemed." }, { status: 400 });
      }

      const redeemUrl = `${appUrl}/redeem?code=${encodeURIComponent(record.code)}`;
      const { emailSent, warning } = await sendInviteEmail({
        email,
        code: record.code,
        type: record.type,
        redeemUrl,
      });

      return NextResponse.json({
        ok: true,
        code: record.code,
        redeemUrl,
        emailSent,
        warning,
        resent: true,
      });
    }

    // ── NEW: create a fresh code ─────────────────────────────────────────────
    let record: Awaited<ReturnType<typeof createInviteCode>>;
    try {
      record = await createInviteCode({
        type,
        createdBy: userId,
        note: note ?? email,
        intendedEmail: email,
      });
    } catch (err) {
      return NextResponse.json({ error: "Failed to generate invite code: " + (err instanceof Error ? err.message : String(err)) }, { status: 500 });
    }

    const redeemUrl = `${appUrl}/redeem?code=${encodeURIComponent(record.code)}`;
    const { emailSent, warning } = await sendInviteEmail({
      email,
      code: record.code,
      type,
      redeemUrl,
    });

    return NextResponse.json({ ok: true, code: record.code, redeemUrl, emailSent, warning });

  } catch (err) {
    return NextResponse.json({ error: "Unexpected error: " + (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}
