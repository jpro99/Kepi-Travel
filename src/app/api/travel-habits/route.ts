import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { getTravelHabitsSnapshot, saveTravelHabitsSnapshot } from "@/lib/memory/travelHabitsStore";
import type { LearnedTravelHabits } from "@/lib/travelFit/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HabitsSchema = z.custom<LearnedTravelHabits>();

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const snapshot = await getTravelHabitsSnapshot(userId);
  return NextResponse.json({ snapshot });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = HabitsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid habits payload" }, { status: 400 });
  }

  await saveTravelHabitsSnapshot(userId, { ...parsed.data, userId });
  return NextResponse.json({ ok: true });
}
