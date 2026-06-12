import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminUserId } from "@/lib/admin/adminAccess";
import { auth } from "@clerk/nextjs/server";
import { createKepiPass } from "@/lib/kepi-pass/passStore";
import { KepiPassEmail } from "@/lib/email/templates/kepiPassEmail";
import { getResendClient, getResendFromEmail } from "@/lib/email/resendClient";
import { createElement } from "react";
import { render } from "@react-email/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  email: z.string().email(),
  type: z.enum(["GOLDEN", "SILVER"]),
  note: z.string().trim().max(200).optional(),
});

async function sendKepiPassEmail(args: {
  email: string;
  passId: string;
  type: "GOLDEN" | "SILVER";
  redeemUrl: string;
}): Promise<{ emailSent: boolean; warning?: string }> {
  const resend = getResendClient();
  if (!resend) {
    return { emailSent: false, warning: "RESEND_API_KEY not configured. Pass generated but email not sent." };
  }

  const subject = args.type === "GOLDEN"
    ? "A Gift of Lifetime Access to Kepi Travel"
    : "You're Invited to Kepi Travel with a Silver Pass";

  let html: string;
  try {
    html = await render(createElement(KepiPassEmail, {
      recipientEmail: args.email,
      passId: args.passId,
      passType: args.type,
      redeemUrl: args.redeemUrl,
    }));
  } catch (err) {
    return { emailSent: false, warning: `Email render failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  try {
    const { error: sendError } = await resend.emails.send({
      from: getResendFromEmail(),
      to: args.email,
      subject,
      html,
    });
    if (sendError) {
      return { emailSent: false, warning: `Email failed to send: ${sendError.message}` };
    }
    return { emailSent: true };
  } catch (err) {
    return { emailSent: false, warning: `Email dispatch failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { userId } = await auth();
    if (!userId || !isAdminUserId(userId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
    }

    const { email, type, note } = parsed.data;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kepitravel.com";

    const pass = await createKepiPass({
      type,
      createdBy: userId,
      intendedEmail: email,
      note,
    });

    const redeemUrl = `${appUrl}/redeem-pass/${pass.id}`;

    const { emailSent, warning } = await sendKepiPassEmail({
      email,
      passId: pass.id,
      type,
      redeemUrl,
    });

    return NextResponse.json({
      ok: true,
      passId: pass.id,
      redeemUrl,
      emailSent,
      warning,
    });

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[API:admin/kepi-pass] ${errorMessage}`);
    return NextResponse.json({ error: "An unexpected error occurred.", details: errorMessage }, { status: 500 });
  }
}
