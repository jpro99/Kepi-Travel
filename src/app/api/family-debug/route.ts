import "server-only";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { kvStoreGet } from "@/lib/travelAssistant/kvStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FAMILY_GROUPS_KEY = "family:groups:v2";
const FAMILY_MEMBERSHIP_KEY = "family:membership";
const FAMILY_INVITE_INDEX_KEY = (code: string) => `family:invite-index:${code}`;

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  const [myGroups, myMembership] = await Promise.all([
    kvStoreGet(FAMILY_GROUPS_KEY, { userId }),
    kvStoreGet(FAMILY_MEMBERSHIP_KEY, { userId }),
  ]);

  const result: Record<string, unknown> = {
    userId,
    myGroups,
    myMembership,
  };

  if (code) {
    const inviteRaw = await kvStoreGet(FAMILY_INVITE_INDEX_KEY(code.toUpperCase()), { userId: "global" });
    result.inviteCode = code.toUpperCase();
    result.inviteIndexRaw = inviteRaw;
    result.inviteIndexType = typeof inviteRaw;

    if (inviteRaw && typeof inviteRaw === "object" && "ownerId" in (inviteRaw as object)) {
      const owner = inviteRaw as { ownerId: string; groupId?: string };
      const ownerGroups = await kvStoreGet(FAMILY_GROUPS_KEY, { userId: owner.ownerId });
      result.ownerGroups = ownerGroups;
      result.ownerUserId = owner.ownerId;
    }
  }

  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}

// POST: repair a member's membership key so they can see the group
// Usage: POST /api/family-debug { memberId: "...", groupId: "..." }
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { targetUserId?: string; groupId?: string };

  if (!body.targetUserId || !body.groupId) {
    return NextResponse.json({ error: "targetUserId and groupId required" }, { status: 400 });
  }

  // Write the membership key for the target user pointing to this user's group
  const groups = await kvStoreGet(FAMILY_GROUPS_KEY, { userId });
  const groupsArr = Array.isArray(groups) ? groups : [];
  const group = groupsArr.find((g: {id: string}) => g.id === body.groupId);

  if (!group) {
    return NextResponse.json({ error: "Group not found in your account" }, { status: 404 });
  }

  await kvStoreSet(
    FAMILY_MEMBERSHIP_KEY,
    { ownerId: userId, groupId: body.groupId, inviteCode: (group as {inviteCode: string}).inviteCode },
    { userId: body.targetUserId }
  );

  return NextResponse.json({ ok: true, message: `Membership key written for ${body.targetUserId}` });
}
