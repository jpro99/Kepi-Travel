import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminUserId } from "@/lib/admin/adminAccess";
import { auth } from "@clerk/nextjs/server";
import { createInviteCode } from "@/lib/invite/inviteCodeStore";
import { InviteEmail } from "@/lib/email/templates/inviteEmail";
import { getResendClient, getResendFromEmail } from "@/lib/email/resendClient";
import { createElement } from "react";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  email: z.string().email(),
  type: z.enum(["lifetime", "trial-30"]),
  note: z.string().trim().max(200).optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
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
    return NextResponse.json({ error: "Invalid request: " + parsed.error.issues[0]?.message }, { status: 400 });
  }

  const { email, type, note } = parsed.data;

  const record = await createInviteCode({
    type,
    createdBy: userId,
    note: note ?? email,
    intendedEmail: email,
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://kepi-search.vercel.app";
  const redeemUrl = `${appUrl}/redeem?code=${encodeURIComponent(record.code)}`;

  const resend = getResendClient();
  if (!resend) {
    return NextResponse.json({
      ok: true, code: record.code, redeemUrl, emailSent: false,
      warning: "RESEND_API_KEY not configured — code generated but email not sent.",
    });
  }

  const { error: sendError } = await resend.emails.send({
    from: getResendFromEmail(),
    to: email,
    subject: type === "lifetime"
      ? "You're invited to Kepi — Lifetime Access"
      : "You're invited to Kepi — 30-Day Trial",
    react: createElement(InviteEmail, {
      recipientEmail: email,
      inviteCode: record.code,
      inviteType: type,
      redeemUrl,
    }),
  });

  if (sendError) {
    return NextResponse.json({
      ok: true, code: record.code, redeemUrl, emailSent: false,
      warning: `Code generated but email failed: ${sendError.message}`,
    });
  }

  return NextResponse.json({ ok: true, code: record.code, redeemUrl, emailSent: true });
}
