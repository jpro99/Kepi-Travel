import { NextResponse } from "next/server";
import { z } from "zod";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getResendClient, getResendFromEmail, isResendConfigured } from "@/lib/email/resendClient";
import { enforceRateLimit } from "@/lib/rateLimit";
import { getTrip } from "@/lib/travelAssistant/tripStore";
import {
  createTripInvite,
  listPendingTripInvitesForTrip,
  listTripCollaborators,
  removeTripCollaborator,
  revokeTripInvite,
  type TripCollaboratorRole,
} from "@/lib/travelAssistant/tripCollaborationStore";

export const dynamic = "force-dynamic";

const CreateInviteSchema = z.object({
  tripId: z.string().trim().min(1),
  role: z.enum(["viewer", "editor"]),
  email: z.string().email().optional(),
});

const RevokeInviteSchema = z.object({
  code: z.string().trim().min(1),
});

const RemoveMemberSchema = z.object({
  tripId: z.string().trim().min(1),
  memberUserId: z.string().trim().min(1),
});

function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://kepitravel.com";
}

async function sendTripInviteEmail(args: {
  toEmail: string;
  fromName: string;
  tripName: string;
  role: TripCollaboratorRole;
  inviteLink: string;
  inviteCode: string;
}): Promise<boolean> {
  if (!isResendConfigured()) return false;
  const resend = getResendClient();
  if (!resend) return false;

  const roleLabel = args.role === "editor" ? "edit" : "view";
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#f9fafb;">
      <div style="background:#fff;border-radius:16px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <div style="font-size:32px;margin-bottom:16px;">✈️</div>
        <h1 style="font-size:22px;font-weight:700;color:#0f172a;margin:0 0 8px;">${args.fromName} shared a trip with you</h1>
        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px;">
          You can <strong>${roleLabel}</strong> <em>${args.tripName}</em> in Kepi.
          Open the trip to see flights, hotels, and the live itinerary.
        </p>
        <a href="${args.inviteLink}" style="display:inline-block;background:#007AFF;color:#fff;font-weight:700;font-size:15px;padding:14px 28px;border-radius:12px;text-decoration:none;">
          Open trip →
        </a>
        <p style="color:#94a3b8;font-size:12px;margin:24px 0 0;">
          Invite code: <code style="font-family:monospace;background:#f1f5f9;padding:2px 6px;border-radius:4px;">${args.inviteCode}</code>
        </p>
      </div>
    </div>
  `;

  try {
    const { error } = await resend.emails.send({
      from: getResendFromEmail(),
      to: args.toEmail,
      subject: `${args.fromName} invited you to ${args.tripName} on Kepi`,
      html,
    });
    return !error;
  } catch {
    return false;
  }
}

export async function GET(req: Request): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tripId = new URL(req.url).searchParams.get("tripId")?.trim() ?? "";
  if (!tripId) {
    return NextResponse.json({ error: "tripId required" }, { status: 400 });
  }

  const trip = await getTrip(tripId, userId);
  if (!trip) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  }

  const [members, pendingInvites] = await Promise.all([
    listTripCollaborators(userId, tripId),
    listPendingTripInvitesForTrip(userId, tripId),
  ]);

  return NextResponse.json({ members, pendingInvites });
}

export async function POST(req: Request): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await enforceRateLimit({
    policyName: "trips-authenticated",
    identifier: userId,
    route: "/api/trips/collaborate",
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many invite requests. Please retry shortly." },
      { status: 429, headers: rateLimit.headers },
    );
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = CreateInviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 422 });
  }

  const trip = await getTrip(parsed.data.tripId, userId);
  if (!trip) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  }

  const invite = await createTripInvite({
    ownerUserId: userId,
    tripId: parsed.data.tripId,
    role: parsed.data.role,
    intendedEmail: parsed.data.email ?? null,
  });

  const inviteLink = `${appBaseUrl()}/join-trip?code=${encodeURIComponent(invite.code)}`;
  let emailSent = false;
  if (parsed.data.email) {
    const user = await currentUser();
    const fromName =
      [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() ||
      user?.username ||
      "A Kepi traveler";
    emailSent = await sendTripInviteEmail({
      toEmail: parsed.data.email,
      fromName,
      tripName: trip.name,
      role: parsed.data.role,
      inviteLink,
      inviteCode: invite.code,
    });
  }

  return NextResponse.json(
    {
      invite,
      inviteLink,
      emailSent,
    },
    { headers: rateLimit.headers },
  );
}

export async function DELETE(req: Request): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const revokeParsed = RevokeInviteSchema.safeParse(body);
  if (revokeParsed.success) {
    const revoked = await revokeTripInvite(revokeParsed.data.code, userId);
    return NextResponse.json({ ok: revoked });
  }

  const removeParsed = RemoveMemberSchema.safeParse(body);
  if (removeParsed.success) {
    const removed = await removeTripCollaborator(
      userId,
      removeParsed.data.tripId,
      removeParsed.data.memberUserId,
    );
    return NextResponse.json({ ok: removed });
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 422 });
}
