import "server-only";
import { NextResponse } from "next/server";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await resolveAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const reservations = await kvStoreGet<Record<string, unknown>>("reservations", { userId }) ?? {};

  const summary = Object.entries(reservations).map(([id, r]) => {
    const res = r as Record<string, unknown>;
    return { id, type: res.type, title: res.title, provider: res.provider, localTime: res.localTime };
  });

  return NextResponse.json({ reservationCount: summary.length, reservations: summary });
}

export async function POST(req: Request) {
  const userId = await resolveAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const url = new URL(req.url);
  const clearAll = url.searchParams.get("clear") === "all";
  const deleteId = url.searchParams.get("id");

  if (clearAll) {
    await kvStoreSet("trips", {}, { userId });
    await kvStoreSet("reservations", {}, { userId });
    return NextResponse.json({ cleared: true });
  }

  if (deleteId) {
    const reservations = await kvStoreGet<Record<string, unknown>>("reservations", { userId }) ?? {};
    const title = (reservations[deleteId] as Record<string, unknown> | undefined)?.title;
    if (!title) return NextResponse.json({ error: "Not found" }, { status: 404 });
    delete reservations[deleteId];
    await kvStoreSet("reservations", reservations, { userId });
    return NextResponse.json({ deleted: true, title });
  }

  return NextResponse.json({ error: "Provide ?id=ID or ?clear=all" }, { status: 400 });
}
