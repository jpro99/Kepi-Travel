import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminUserId } from "@/lib/admin/adminAccess";
import { auth } from "@clerk/nextjs/server";
import { createInviteCode } from "@/lib/invite/inviteCodeStore";
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
});

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

    const { email, type, note } = parsed.data;

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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://kepi-search.vercel.app";
    const redeemUrl = `${appUrl}/redeem?code=${encodeURIComponent(record.code)}`;

    const resend = getResendClient();
    if (!resend) {
      return NextResponse.json({
        ok: true, code: record.code, redeemUrl, emailSent: false,
        warning: "RESEND_API_KEY not configured — code generated but email not sent.",
      });
    }

    let html: string;
    try {
      html = await render(createElement(InviteEmail, {
        recipientEmail: email,
        inviteCode: record.code,
        inviteType: type,
        redeemUrl,
      }));
    } catch (err) {
      return NextResponse.json({ error: "Failed to render email: " + (err instanceof Error ? err.message : String(err)) }, { status: 500 });
    }

    let emailSent = false;
    let warning: string | undefined;

    try {
      const { error: sendError } = await resend.emails.send({
        from: getResendFromEmail(),
        to: email,
        subject: type === "lifetime"
          ? "You\'re invited to Kepi — Lifetime Access"
          : "You\'re invited to Kepi — 30-Day Trial",
        html,
      });
      if (sendError) {
        warning = "Email failed: " + sendError.message;
      } else {
        emailSent = true;
      }
    } catch (err) {
      warning = "Email failed: " + (err instanceof Error ? err.message : String(err));
    }

    return NextResponse.json({ ok: true, code: record.code, redeemUrl, emailSent, warning });

  } catch (err) {
    return NextResponse.json({ error: "Unexpected error: " + (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}
