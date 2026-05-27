import "server-only";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";
import { logger } from "@/lib/logger";
import { generateId } from "@/lib/utils/generateId";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FAMILY_GROUP_KEY = "family:group";
const FAMILY_LOCATION_KEY = (memberId: string) => `family:location:${memberId}`;

const MemberSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(60),
  email: z.string().email().optional().nullable(),
  role: z.enum(["organizer", "adult", "teen", "child"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  sharingEnabled: z.boolean().default(true),
  visibility: z.enum(["all-members", "organizer-only"]).default("all-members"),
  joinedAt: z.string(),
});

const FamilyGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  ownerId: z.string(),
  members: z.array(MemberSchema),
  inviteCode: z.string(),
  createdAt: z.string(),
});

const LocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  accuracy: z.number().optional(),
  updatedAt: z.string(),
  memberId: z.string(),
  label: z.string().optional(),
});

const MEMBER_COLORS = [
  "#0ea5e9", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
];

function nextColor(members: z.infer<typeof MemberSchema>[]): string {
  const used = new Set(members.map(m => m.color));
  return MEMBER_COLORS.find(c => !used.has(c)) ?? MEMBER_COLORS[members.length % MEMBER_COLORS.length];
}

// GET - fetch group and all member locations
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let group = await kvStoreGet<z.infer<typeof FamilyGroupSchema>>(FAMILY_GROUP_KEY, { userId });

  // Create default group if none exists
  if (!group) {
    group = {
      id: generateId(),
      name: "My Family",
      ownerId: userId,
      members: [{
        id: userId,
        name: "Me",
        email: null,
        role: "organizer",
        color: MEMBER_COLORS[0],
        sharingEnabled: true,
        visibility: "all-members",
        joinedAt: new Date().toISOString(),
      }],
      inviteCode: generateId().slice(0, 8).toUpperCase(),
      createdAt: new Date().toISOString(),
    };
    await kvStoreSet(FAMILY_GROUP_KEY, group, { userId });
  }

  // Fetch locations for all members
  const locationEntries = await Promise.all(
    group.members.map(async (member) => {
      const loc = await kvStoreGet<z.infer<typeof LocationSchema>>(
        FAMILY_LOCATION_KEY(member.id), { userId }
      );
      return [member.id, loc] as const;
    })
  );
  const locations = Object.fromEntries(locationEntries.filter(([, v]) => v !== null));

  return NextResponse.json({ group, locations });
}

// POST - update own location
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const parsed = z.object({
    action: z.enum(["update-location", "add-member", "remove-member", "update-member", "update-group"]),
    lat: z.number().optional(),
    lon: z.number().optional(),
    accuracy: z.number().optional(),
    label: z.string().max(60).optional(),
    memberId: z.string().optional(),
    name: z.string().max(60).optional(),
    email: z.string().email().nullable().optional(),
    role: z.enum(["organizer", "adult", "teen", "child"]).optional(),
    sharingEnabled: z.boolean().optional(),
    visibility: z.enum(["all-members", "organizer-only"]).optional(),
    groupName: z.string().max(60).optional(),
  }).safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { action } = parsed.data;
  const group = await kvStoreGet<z.infer<typeof FamilyGroupSchema>>(FAMILY_GROUP_KEY, { userId });
  if (!group) return NextResponse.json({ error: "No family group found" }, { status: 404 });

  if (action === "update-location") {
    const { lat, lon, accuracy, label } = parsed.data;
    if (lat === undefined || lon === undefined) {
      return NextResponse.json({ error: "lat and lon required" }, { status: 400 });
    }
    const location: z.infer<typeof LocationSchema> = {
      lat, lon,
      accuracy: accuracy ?? undefined,
      updatedAt: new Date().toISOString(),
      memberId: userId,
      label: label ?? undefined,
    };
    await kvStoreSet(FAMILY_LOCATION_KEY(userId), location, { userId });
    return NextResponse.json({ ok: true, location });
  }

  if (action === "add-member") {
    const { name, email, role } = parsed.data;
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
    const newMember: z.infer<typeof MemberSchema> = {
      id: generateId(),
      name,
      email: email ?? null,
      role: role ?? "adult",
      color: nextColor(group.members),
      sharingEnabled: true,
      visibility: "all-members",
      joinedAt: new Date().toISOString(),
    };
    group.members.push(newMember);
    await kvStoreSet(FAMILY_GROUP_KEY, group, { userId });
    return NextResponse.json({ ok: true, member: newMember, group });
  }

  if (action === "remove-member") {
    const { memberId } = parsed.data;
    if (!memberId || memberId === userId) {
      return NextResponse.json({ error: "Cannot remove yourself" }, { status: 400 });
    }
    group.members = group.members.filter(m => m.id !== memberId);
    await kvStoreSet(FAMILY_GROUP_KEY, group, { userId });
    return NextResponse.json({ ok: true, group });
  }

  if (action === "update-member") {
    const { memberId, sharingEnabled, visibility, name } = parsed.data;
    if (!memberId) return NextResponse.json({ error: "memberId required" }, { status: 400 });
    group.members = group.members.map(m => {
      if (m.id !== memberId) return m;
      return {
        ...m,
        ...(name !== undefined ? { name } : {}),
        ...(sharingEnabled !== undefined ? { sharingEnabled } : {}),
        ...(visibility !== undefined ? { visibility } : {}),
      };
    });
    await kvStoreSet(FAMILY_GROUP_KEY, group, { userId });
    return NextResponse.json({ ok: true, group });
  }

  if (action === "update-group") {
    const { groupName } = parsed.data;
    if (groupName) group.name = groupName;
    await kvStoreSet(FAMILY_GROUP_KEY, group, { userId });
    return NextResponse.json({ ok: true, group });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
