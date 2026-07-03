import "server-only";

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { kvStoreGet } from "@/lib/travelAssistant/kvStore";
import { generateId } from "@/lib/utils/generateId";
import {
  buildMemberJourneyFromTap,
  isClerkMemberId,
  type FamilyRallyTarget,
} from "@/lib/family/familyAirportSync";
import { loadFamilyAirportSync, setFamilyRally, upsertMemberJourney } from "@/lib/family/familyAirportSyncStore";
import { sendFamilyRallyNotification } from "@/lib/travelAssistant/pushNotificationService";
import { computeGroupBoardingPressure } from "@/lib/airportNav/groupBoardingMath";
import type { JourneyPhaseId } from "@/lib/airportNav/journeyMachine";
import type { FamilyAirportSyncDocument } from "@/lib/family/familyAirportSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FAMILY_GROUPS_KEY = "family:groups:v2";
const FAMILY_MEMBERSHIP_KEY = "family:membership";

interface Group {
  id: string;
  name: string;
  ownerId: string;
  members: Array<{ id: string; name: string; sharingEnabled?: boolean }>;
}

function resolveMembership(raw: unknown, selfUserId: string): { ownerId: string; groupId: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  let ownerId = r.ownerId;
  let groupId = (r.groupId as string) ?? "";
  if (ownerId && typeof ownerId === "object" && "ownerId" in (ownerId as object)) {
    const nested = ownerId as Record<string, unknown>;
    ownerId = nested.ownerId;
    if (nested.groupId && typeof nested.groupId === "string") groupId = nested.groupId;
  }
  if (typeof ownerId !== "string" || !ownerId || ownerId === selfUserId) return null;
  return { ownerId, groupId };
}

async function resolveGroupContext(userId: string, groupId?: string): Promise<{
  ownerId: string;
  group: Group;
  myMemberId: string;
} | null> {
  const rawMem = await kvStoreGet<unknown>(FAMILY_MEMBERSHIP_KEY, { userId });
  const mem = resolveMembership(rawMem, userId);

  if (mem) {
    const ownerGroups = await kvStoreGet<Group[]>(FAMILY_GROUPS_KEY, { userId: mem.ownerId });
    const group =
      ownerGroups?.find((g) => g.id === (groupId ?? mem.groupId) && g.members.some((m) => m.id === userId)) ??
      ownerGroups?.find((g) => g.members.some((m) => m.id === userId)) ??
      null;
    if (!group) return null;
    return { ownerId: mem.ownerId, group, myMemberId: userId };
  }

  const groups = await kvStoreGet<Group[]>(FAMILY_GROUPS_KEY, { userId });
  const group = groups?.find((g) => g.id === groupId) ?? groups?.[0] ?? null;
  if (!group) return null;
  if (!group.members.some((m) => m.id === userId)) return null;
  return { ownerId: userId, group, myMemberId: userId };
}

function buildGroupBoardingResponse(
  doc: FamilyAirportSyncDocument,
  group: Group,
  minutesToDeparture: number | undefined,
) {
  if (minutesToDeparture == null || !Number.isFinite(minutesToDeparture)) return null;
  const inputs = group.members
    .map((member) => {
      const journey = doc.journeys[member.id];
      if (!journey) return null;
      return {
        memberId: member.id,
        name: member.name,
        phase: journey.phase,
        throughSecurity: journey.throughSecurity,
      };
    })
    .filter(Boolean) as Array<{
    memberId: string;
    name: string;
    phase: JourneyPhaseId;
    throughSecurity: boolean;
  }>;
  return computeGroupBoardingPressure(inputs, minutesToDeparture);
}

const PhaseSchema = z.enum([
  "landside",
  "checkin",
  "security",
  "airside",
  "lounge",
  "at_gate",
  "boarding_soon",
]);

const RallyTargetSchema = z.object({
  kind: z.enum(["gate", "meetup"]),
  iata: z.string().length(3),
  label: z.string().min(1).max(80),
  gateCode: z.string().max(8).optional(),
  poiId: z.string().max(80).optional(),
});

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const tripId = url.searchParams.get("tripId")?.trim();
  const groupId = url.searchParams.get("groupId")?.trim() ?? undefined;
  const minutesRaw = url.searchParams.get("minutesToDeparture");
  const minutesToDeparture = minutesRaw != null ? Number(minutesRaw) : undefined;

  if (!tripId) return NextResponse.json({ error: "tripId required" }, { status: 400 });

  const ctx = await resolveGroupContext(userId, groupId);
  if (!ctx) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const doc = await loadFamilyAirportSync(ctx.ownerId, tripId, ctx.group.id);
  const groupBoarding = buildGroupBoardingResponse(doc, ctx.group, minutesToDeparture);

  return NextResponse.json({
    sync: doc,
    groupBoarding,
    myMemberId: ctx.myMemberId,
  });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = z
    .object({
      action: z.enum(["set-phase", "set-rally", "cancel-rally"]),
      tripId: z.string().min(1),
      groupId: z.string().optional(),
      phase: PhaseSchema.optional(),
      target: RallyTargetSchema.optional(),
      message: z.string().max(120).optional(),
      minutesToDeparture: z.number().optional(),
    })
    .safeParse(await req.json().catch(() => ({})));

  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const body = parsed.data;

  const ctx = await resolveGroupContext(userId, body.groupId);
  if (!ctx) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const member = ctx.group.members.find((m) => m.id === userId);
  if (!member) return NextResponse.json({ error: "Not a group member" }, { status: 403 });

  if (body.action === "set-phase") {
    if (!body.phase) return NextResponse.json({ error: "phase required" }, { status: 400 });
    const journey = buildMemberJourneyFromTap(body.phase, userId);
    const doc = await upsertMemberJourney(ctx.ownerId, body.tripId, ctx.group.id, journey);
    const groupBoarding = buildGroupBoardingResponse(doc, ctx.group, body.minutesToDeparture);
    return NextResponse.json({ ok: true, sync: doc, groupBoarding, journey });
  }

  if (body.action === "set-rally") {
    if (!body.target) return NextResponse.json({ error: "target required" }, { status: 400 });
    const target: FamilyRallyTarget = {
      ...body.target,
      iata: body.target.iata.toUpperCase(),
    };
    const rally = {
      id: generateId(),
      tripId: body.tripId,
      groupId: ctx.group.id,
      createdBy: userId,
      createdByName: member.name,
      status: "active" as const,
      target,
      createdAt: new Date().toISOString(),
      message: body.message,
    };
    const doc = await setFamilyRally(ctx.ownerId, body.tripId, ctx.group.id, rally);

    const otherMemberIds = ctx.group.members
      .map((m) => m.id)
      .filter((id) => id !== userId && isClerkMemberId(id));

    await sendFamilyRallyNotification(otherMemberIds, {
      fromName: member.name,
      label: target.label,
      tripId: body.tripId,
    });

    const groupBoarding = buildGroupBoardingResponse(doc, ctx.group, body.minutesToDeparture);
    return NextResponse.json({ ok: true, sync: doc, groupBoarding, rally });
  }

  if (body.action === "cancel-rally") {
    const doc = await setFamilyRally(ctx.ownerId, body.tripId, ctx.group.id, null);
    return NextResponse.json({ ok: true, sync: doc });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
