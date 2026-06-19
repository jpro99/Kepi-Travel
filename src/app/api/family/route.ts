import "server-only";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";
import { logger } from "@/lib/logger";
import { generateId } from "@/lib/utils/generateId";
import { getResendClient, getResendFromEmail, isResendConfigured } from "@/lib/email/resendClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Key helpers ───────────────────────────────────────────────────────────────
// v2: multi-group support — groups stored as an array
const FAMILY_GROUPS_KEY = "family:groups:v2";
const FAMILY_GROUPS_KEY_LEGACY = "family:group"; // migrate from v1
const FAMILY_LOCATION_KEY = (memberId: string) => `family:location:${memberId}`;
const FAMILY_INVITE_INDEX_KEY = (code: string) => `family:invite-index:${code}`;
const FAMILY_MEMBERSHIP_KEY = "family:membership"; // { ownerId, groupId, inviteCode }

// ── Schemas ───────────────────────────────────────────────────────────────────
const MemberSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(80),
  email: z.string().email().optional().nullable(),
  role: z.enum(["organizer", "adult", "teen", "child"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  sharingEnabled: z.boolean().default(true),
  visibility: z.enum(["all-members", "organizer-only"]).default("all-members"),
  joinedAt: z.string(),
  imageUrl: z.string().url().optional().nullable(),
});

const GroupSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(80),
  ownerId: z.string(),
  members: z.array(MemberSchema),
  inviteCode: z.string(),
  createdAt: z.string(),
});

type Group = z.infer<typeof GroupSchema>;
type Member = z.infer<typeof MemberSchema>;

const LocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  accuracy: z.number().optional(),
  updatedAt: z.string(),
  memberId: z.string(),
  label: z.string().optional(),
});

const MEMBER_COLORS = [
  "#0ea5e9","#10b981","#f59e0b","#ef4444",
  "#8b5cf6","#ec4899","#14b8a6","#f97316",
  "#06b6d4","#84cc16","#a855f7","#f43f5e",
];

function nextColor(members: Member[]): string {
  const used = new Set(members.map(m => m.color));
  return MEMBER_COLORS.find(c => !used.has(c)) ?? MEMBER_COLORS[members.length % MEMBER_COLORS.length];
}

// ── Load/save multiple groups ─────────────────────────────────────────────────
async function loadGroups(userId: string): Promise<Group[]> {
  const groups = await kvStoreGet<Group[]>(FAMILY_GROUPS_KEY, { userId });
  if (groups && groups.length > 0) return groups;
  // Migrate from v1 single group
  const legacy = await kvStoreGet<Group>(FAMILY_GROUPS_KEY_LEGACY, { userId });
  if (legacy) {
    const migrated = [legacy];
    await kvStoreSet(FAMILY_GROUPS_KEY, migrated, { userId });
    return migrated;
  }
  return [];
}

async function saveGroups(userId: string, groups: Group[]): Promise<void> {
  await kvStoreSet(FAMILY_GROUPS_KEY, groups, { userId });
}

function createDefaultGroup(userId: string, name = "My Family", organizerName = "Me"): Group {
  return {
    id: generateId(),
    name,
    ownerId: userId,
    members: [{
      id: userId,
      name: organizerName,
      email: null,
      role: "organizer",
      color: MEMBER_COLORS[0],
      sharingEnabled: true,
      visibility: "all-members",
      joinedAt: new Date().toISOString(),
      imageUrl: null,
    }],
    inviteCode: generateId().slice(0, 8).toUpperCase(),
    createdAt: new Date().toISOString(),
  };
}

// ── Send invite email ─────────────────────────────────────────────────────────
async function sendInviteEmail(opts: {
  toEmail: string;
  toName: string;
  fromName: string;
  groupName: string;
  inviteLink: string;
}): Promise<boolean> {
  if (!isResendConfigured()) return false;
  const resend = getResendClient();
  if (!resend) return false;
  try {
    await resend.emails.send({
      from: getResendFromEmail(),
      to: opts.toEmail,
      subject: `${opts.fromName} invited you to join their Kepi family group`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#f9fafb;">
          <div style="background:#fff;border-radius:16px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
            <div style="font-size:32px;margin-bottom:16px;">✈️</div>
            <h1 style="font-size:22px;font-weight:700;color:#0f172a;margin:0 0 8px;">${opts.fromName} invited you to ${opts.groupName}</h1>
            <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px;">
              ${opts.fromName} wants to share live locations with you during your trip using Kepi.
              Tap the button below to join — you'll be able to see each other on the map in real time.
            </p>
            <a href="${opts.inviteLink}" style="display:inline-block;background:#007AFF;color:#fff;font-weight:700;font-size:15px;padding:14px 28px;border-radius:12px;text-decoration:none;">
              Join ${opts.groupName} →
            </a>
            <p style="color:#94a3b8;font-size:12px;margin:24px 0 0;">
              This invite link takes you to Kepi Travel. If you don't have an account, you can create one for free.
              <br>Your invite code: <code style="font-family:monospace;background:#f1f5f9;padding:2px 6px;border-radius:4px;">${opts.inviteLink.split("code=")[1] ?? ""}</code>
            </p>
          </div>
        </div>
      `,
    });
    return true;
  } catch (err) {
    logger.warn("Family invite email failed.", { error: err instanceof Error ? err.message : "unknown" });
    return false;
  }
}

// ── Get real name from Clerk ──────────────────────────────────────────────────
async function getClerkDisplayName(userId: string): Promise<string | null> {
  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim()
      || user.username
      || user.emailAddresses[0]?.emailAddress?.split("@")[0]
      || null;
    return name || null;
  } catch (e) {
    logger.warn("getClerkDisplayName failed", { userId, error: e instanceof Error ? e.message : "unknown" });
    return null;
  }
}

// ── Resolve membership record, handling all corrupted formats ────────────────
function resolveMembership(raw: unknown, selfUserId: string): { ownerId: string; groupId: string; inviteCode: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  // Unwrap double-nested ownerId: { "ownerId": { "ownerId": "...", "groupId": "..." }, "groupId": "..." }
  let ownerId = r.ownerId;
  let groupId = r.groupId as string ?? "";
  const inviteCode = r.inviteCode as string ?? "";

  // If ownerId is itself an object (corrupted double-nest), extract from it
  if (ownerId && typeof ownerId === "object" && "ownerId" in (ownerId as object)) {
    const nested = ownerId as Record<string, unknown>;
    ownerId = nested.ownerId;
    // Use the nested groupId (which should be the OWNER's group, not ours)
    if (nested.groupId && typeof nested.groupId === "string") {
      groupId = nested.groupId as string;
    }
  }

  if (typeof ownerId !== "string" || !ownerId || ownerId === selfUserId) return null;
  return { ownerId, groupId, inviteCode };
}

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const requestedGroupId = url.searchParams.get("groupId");

  // Read and self-heal membership record
  const rawMembership = await kvStoreGet<unknown>(FAMILY_MEMBERSHIP_KEY, { userId });
  const membership = resolveMembership(rawMembership, userId);

  if (membership) {
    // If membership was corrupted, rewrite it correctly
    if (JSON.stringify(rawMembership) !== JSON.stringify(membership)) {
      await kvStoreSet(FAMILY_MEMBERSHIP_KEY, membership, { userId });
    }

    const ownerGroups = await loadGroups(membership.ownerId);
    // Find the right group: prefer groupId match, fall back to any group containing this user
    const memberGroup =
      ownerGroups.find(g => g.id === membership.groupId && g.members.some(m => m.id === userId)) ??
      ownerGroups.find(g => g.members.some(m => m.id === userId)) ??
      (membership.groupId ? ownerGroups.find(g => g.id === membership.groupId) : null) ??
      ownerGroups[0];

    if (memberGroup) {
      // Fix groupId in membership if it was pointing to wrong group
      if (membership.groupId !== memberGroup.id) {
        await kvStoreSet(FAMILY_MEMBERSHIP_KEY,
          { ownerId: membership.ownerId, groupId: memberGroup.id, inviteCode: membership.inviteCode || memberGroup.inviteCode },
          { userId });
      }
      const locs = Object.fromEntries(
        (await Promise.all(memberGroup.members.map(async m => {
          const loc = await kvStoreGet<z.infer<typeof LocationSchema>>(FAMILY_LOCATION_KEY(m.id), { userId: membership.ownerId });
          return [m.id, loc] as const;
        }))).filter(([, v]) => v !== null)
      );
      return NextResponse.json({ group: memberGroup, groups: [memberGroup], locations: locs, role: "member", myMemberId: userId });
    }
    // Membership pointed to a group that no longer exists — clear it and fall through to own groups
    await kvStoreSet(FAMILY_MEMBERSHIP_KEY, null, { userId });
  }

  // Load own groups
  let groups = await loadGroups(userId);
  if (groups.length === 0) {
    const realName = await getClerkDisplayName(userId);
    const def = createDefaultGroup(userId, "My Family", realName ?? "Me");
    groups = [def];
    await saveGroups(userId, groups);
    await kvStoreSet(FAMILY_INVITE_INDEX_KEY(def.inviteCode), { ownerId: userId, groupId: def.id }, { userId: "global" });
  }

  // Re-register all invite codes (self-heal) — store as objects not strings
  for (const g of groups) {
    await kvStoreSet(FAMILY_INVITE_INDEX_KEY(g.inviteCode), { ownerId: userId, groupId: g.id }, { userId: "global" });
  }

  // Auto-fix "Me" → real Clerk display name for the organizer member
  const organizerMember = groups[0]?.members.find(m => m.id === userId);
  if (organizerMember && (organizerMember.name === "Me" || organizerMember.name === "")) {
    const realName = await getClerkDisplayName(userId);
    if (realName) {
      let changed = false;
      const fixedGroups = groups.map(g => ({
        ...g,
        members: g.members.map(m => {
          if (m.id === userId && (m.name === "Me" || m.name === "")) {
            changed = true;
            return { ...m, name: realName };
          }
          return m;
        }),
      }));
      if (changed) {
        groups = fixedGroups;
        await saveGroups(userId, groups);
      }
    }
  }

  const activeGroup = requestedGroupId ? groups.find(g => g.id === requestedGroupId) ?? groups[0] : groups[0];

  const locs = Object.fromEntries(
    (await Promise.all(activeGroup.members.map(async m => {
      const loc = await kvStoreGet<z.infer<typeof LocationSchema>>(FAMILY_LOCATION_KEY(m.id), { userId });
      return [m.id, loc] as const;
    }))).filter(([, v]) => v !== null)
  );

  return NextResponse.json({ group: activeGroup, groups, locations: locs, role: "owner", myMemberId: userId });
}

// ── POST ──────────────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const parsed = z.object({
    action: z.enum([
      "update-location","add-member","remove-member","update-member",
      "update-group","join-group","leave-group","create-group","send-invite",
    ]),
    groupId: z.string().optional(),
    lat: z.number().optional(),
    lon: z.number().optional(),
    accuracy: z.number().optional(),
    label: z.string().max(60).optional(),
    memberId: z.string().optional(),
    name: z.string().max(80).optional(),
    email: z.string().email().nullable().optional(),
    role: z.enum(["organizer","adult","teen","child"]).optional(),
    sharingEnabled: z.boolean().optional(),
    visibility: z.enum(["all-members","organizer-only"]).optional(),
    groupName: z.string().max(80).optional(),
    imageUrl: z.string().url().nullable().optional(),
    inviteCode: z.string().optional(),
    inviteLink: z.string().url().optional(),
    senderName: z.string().max(60).optional(),
  }).safeParse(body);

  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const d = parsed.data;

  // ── update-location ───────────────────────────────────────────────────────
  if (d.action === "update-location") {
    if (d.lat === undefined || d.lon === undefined) return NextResponse.json({ error: "lat and lon required" }, { status: 400 });
    const loc: z.infer<typeof LocationSchema> = {
      lat: d.lat, lon: d.lon,
      accuracy: d.accuracy,
      updatedAt: new Date().toISOString(),
      memberId: userId,
      label: d.label,
    };
    let ns = userId;
    const rawMem = await kvStoreGet<unknown>(FAMILY_MEMBERSHIP_KEY, { userId });
    const mem = resolveMembership(rawMem, userId);
    if (mem) ns = mem.ownerId;
    await kvStoreSet(FAMILY_LOCATION_KEY(userId), loc, { userId: ns });
    return NextResponse.json({ ok: true, location: loc });
  }

  const groups = await loadGroups(userId);

  // ── create-group ──────────────────────────────────────────────────────────
  if (d.action === "create-group") {
    if (groups.length >= 10) return NextResponse.json({ error: "Max 10 groups" }, { status: 400 });
    const g = createDefaultGroup(userId, d.groupName ?? "New Group");
    groups.push(g);
    await saveGroups(userId, groups);
    await kvStoreSet(FAMILY_INVITE_INDEX_KEY(g.inviteCode), { ownerId: userId, groupId: g.id }, { userId: "global" });
    return NextResponse.json({ ok: true, group: g, groups });
  }

  const group = groups.find(g => g.id === d.groupId) ?? groups[0];
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });
  const gIdx = groups.findIndex(g => g.id === group.id);

  // ── add-member ────────────────────────────────────────────────────────────
  if (d.action === "add-member") {
    if (!d.name) return NextResponse.json({ error: "name required" }, { status: 400 });
    const newMember: Member = {
      id: generateId(),
      name: d.name,
      email: d.email ?? null,
      role: d.role ?? "adult",
      color: nextColor(group.members),
      sharingEnabled: true,
      visibility: "all-members",
      joinedAt: new Date().toISOString(),
    };
    group.members.push(newMember);
    groups[gIdx] = group;
    await saveGroups(userId, groups);

    // If email provided, send invite automatically
    let emailSent = false;
    if (d.email && d.inviteLink) {
      emailSent = await sendInviteEmail({
        toEmail: d.email,
        toName: d.name,
        fromName: d.senderName ?? "Your travel companion",
        groupName: group.name,
        inviteLink: d.inviteLink,
      });
    }

    return NextResponse.json({ ok: true, member: newMember, group, groups, emailSent });
  }

  // ── send-invite ───────────────────────────────────────────────────────────
  if (d.action === "send-invite") {
    if (!d.email || !d.inviteLink) return NextResponse.json({ error: "email and inviteLink required" }, { status: 400 });
    const sent = await sendInviteEmail({
      toEmail: d.email,
      toName: d.name ?? "Family Member",
      fromName: d.senderName ?? "Your travel companion",
      groupName: group.name,
      inviteLink: d.inviteLink,
    });
    return NextResponse.json({ ok: true, emailSent: sent });
  }

  // ── remove-member ─────────────────────────────────────────────────────────
  if (d.action === "remove-member") {
    if (!d.memberId || d.memberId === userId) return NextResponse.json({ error: "Cannot remove yourself" }, { status: 400 });
    group.members = group.members.filter(m => m.id !== d.memberId);
    groups[gIdx] = group;
    await saveGroups(userId, groups);
    return NextResponse.json({ ok: true, group, groups });
  }

  // ── update-member ─────────────────────────────────────────────────────────
  if (d.action === "update-member") {
    if (!d.memberId) return NextResponse.json({ error: "memberId required" }, { status: 400 });
    group.members = group.members.map(m => m.id !== d.memberId ? m : {
      ...m,
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.sharingEnabled !== undefined ? { sharingEnabled: d.sharingEnabled } : {}),
      ...(d.visibility !== undefined ? { visibility: d.visibility } : {}),
    });
    groups[gIdx] = group;
    await saveGroups(userId, groups);
    return NextResponse.json({ ok: true, group, groups });
  }

  // ── update-group ──────────────────────────────────────────────────────────
  if (d.action === "update-group") {
    if (d.groupName) group.name = d.groupName;
    groups[gIdx] = group;
    await saveGroups(userId, groups);
    return NextResponse.json({ ok: true, group, groups });
  }

  // ── join-group ────────────────────────────────────────────────────────────
  if (d.action === "join-group") {
    if (!d.inviteCode) return NextResponse.json({ error: "inviteCode required" }, { status: 400 });

    // Read invite index — stored as { ownerId, groupId } object
    // Legacy format was JSON.stringify({ ownerId, groupId }) string, or plain userId string
    const raw = await kvStoreGet<unknown>(FAMILY_INVITE_INDEX_KEY(d.inviteCode.toUpperCase()), { userId: "global" });
    if (!raw) {
      return NextResponse.json({ error: "Invite code not found. Ask the organizer to open their Family panel to refresh the code, then share the link again." }, { status: 404 });
    }

    let ownerUserId: string;
    let groupId: string;

    if (typeof raw === "object" && raw !== null && "ownerId" in raw) {
      // Current format: { ownerId: string, groupId: string }
      ownerUserId = (raw as { ownerId: string; groupId: string }).ownerId;
      groupId = (raw as { ownerId: string; groupId: string }).groupId ?? "";
    } else if (typeof raw === "string") {
      // Try parsing as JSON string (old double-encoded format)
      try {
        const parsed2 = JSON.parse(raw) as { ownerId: string; groupId?: string };
        ownerUserId = parsed2.ownerId;
        groupId = parsed2.groupId ?? "";
      } catch {
        // Oldest format — plain userId string
        ownerUserId = raw;
        groupId = "";
      }
    } else {
      return NextResponse.json({ error: "Invalid invite code format. Please ask the organizer to share a new link." }, { status: 400 });
    }

    if (!ownerUserId || ownerUserId === userId) {
      return NextResponse.json({ error: "You created this group — you're already in it as the organizer." }, { status: 400 });
    }

    const ownerGroups = await loadGroups(ownerUserId);
    const ownerGroup = (groupId ? ownerGroups.find(g => g.id === groupId) : null) ?? ownerGroups[0];
    if (!ownerGroup) {
      return NextResponse.json({ error: "Group not found. The organizer may have deleted it." }, { status: 404 });
    }

    if (ownerGroup.members.some(m => m.id === userId)) {
      // Already a member (by Clerk userId) — just refresh the membership key
      await kvStoreSet(FAMILY_MEMBERSHIP_KEY, { ownerId: ownerUserId, groupId: ownerGroup.id, inviteCode: d.inviteCode.toUpperCase() }, { userId });
      return NextResponse.json({ ok: true, group: ownerGroup, alreadyMember: true });
    }

    // Check if there's a placeholder member with the same email (added via "Add member" form)
    // If so, replace the placeholder with the real Clerk userId so they're one entry
    const joiningEmail = d.email?.toLowerCase().trim();
    const placeholderIdx = joiningEmail
      ? ownerGroup.members.findIndex(m => m.email?.toLowerCase().trim() === joiningEmail && m.id !== ownerUserId)
      : -1;

    if (placeholderIdx >= 0) {
      // Replace placeholder with real user account
      const placeholder = ownerGroup.members[placeholderIdx]!;
      ownerGroup.members[placeholderIdx] = {
        ...placeholder,
        id: userId, // replace generated UUID with real Clerk userId
        name: d.name ?? placeholder.name,
        imageUrl: d.imageUrl ?? null,
        joinedAt: new Date().toISOString(),
      };
    } else {
      // New member — add fresh entry
      ownerGroup.members.push({
        id: userId,
        name: d.name ?? "Family Member",
        email: joiningEmail ?? null,
        role: "adult",
        color: nextColor(ownerGroup.members),
        sharingEnabled: true,
        visibility: "all-members",
        joinedAt: new Date().toISOString(),
        imageUrl: d.imageUrl ?? null,
      });
    }
    const ownerGIdx = ownerGroups.findIndex(g => g.id === ownerGroup.id);
    ownerGroups[ownerGIdx] = ownerGroup;
    await saveGroups(ownerUserId, ownerGroups);
    await kvStoreSet(FAMILY_MEMBERSHIP_KEY, { ownerId: ownerUserId, groupId: ownerGroup.id, inviteCode: d.inviteCode.toUpperCase() }, { userId });
    logger.info("User joined family group.", { userId, ownerId: ownerUserId, groupId: ownerGroup.id });
    return NextResponse.json({ ok: true, group: ownerGroup, joined: true });
  }

  // ── leave-group ───────────────────────────────────────────────────────────
  if (d.action === "leave-group") {
    const mem = await kvStoreGet<{ ownerId: string; groupId: string }>(FAMILY_MEMBERSHIP_KEY, { userId });
    if (!mem) return NextResponse.json({ error: "Not in a group." }, { status: 400 });
    const ownerGroups = await loadGroups(mem.ownerId);
    const og = ownerGroups.find(g => g.id === mem.groupId);
    if (og) {
      og.members = og.members.filter(m => m.id !== userId);
      const idx = ownerGroups.findIndex(g => g.id === og.id);
      ownerGroups[idx] = og;
      await saveGroups(mem.ownerId, ownerGroups);
    }
    await kvStoreSet(FAMILY_MEMBERSHIP_KEY, null, { userId });
    return NextResponse.json({ ok: true, left: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
