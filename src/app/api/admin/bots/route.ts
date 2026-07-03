import { NextResponse } from "next/server";
import { requireAdminApiAccess } from "@/lib/admin/requireAdminApiAccess";
import { buildBotDeckOverview } from "@/lib/admin/botDeck/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdminApiAccess("/api/admin/bots");
  if (!gate.ok) return gate.response;

  const bots = await buildBotDeckOverview();
  return NextResponse.json({ bots });
}
