import { NextResponse } from "next/server";
import { requireAdminApiAccess } from "@/lib/admin/requireAdminApiAccess";
import { listBotDeckMessages } from "@/lib/admin/botDeck/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdminApiAccess("/api/admin/bots/messages");
  if (!gate.ok) return gate.response;

  const messages = await listBotDeckMessages();
  return NextResponse.json({ messages: messages.slice(0, 100) });
}
