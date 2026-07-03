import { NextResponse } from "next/server";
import { requireAdminApiAccess } from "@/lib/admin/requireAdminApiAccess";
import {
  appendBotMemory,
  getBotMemory,
  listBotDeckTasks,
  setBotMemory,
} from "@/lib/admin/botDeck/store";
import { botDeckBot } from "@/lib/admin/botDeck/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ botId: string }> }) {
  const gate = await requireAdminApiAccess("/api/admin/bots/memory");
  if (!gate.ok) return gate.response;

  const { botId } = await ctx.params;
  const bot = botDeckBot(botId);
  if (!bot) return NextResponse.json({ error: "Unknown bot" }, { status: 404 });

  const memory = await getBotMemory(bot.id);
  const tasks = (await listBotDeckTasks()).filter((t) => t.assignee === bot.id);
  return NextResponse.json({ bot, memory, tasks });
}

export async function POST(req: Request, ctx: { params: Promise<{ botId: string }> }) {
  const gate = await requireAdminApiAccess("/api/admin/bots/memory");
  if (!gate.ok) return gate.response;

  const { botId } = await ctx.params;
  const bot = botDeckBot(botId);
  if (!bot) return NextResponse.json({ error: "Unknown bot" }, { status: 404 });

  const body = (await req.json()) as { content?: string };
  if (!body.content?.trim()) return NextResponse.json({ error: "content required" }, { status: 400 });

  await setBotMemory(bot.id, body.content);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ botId: string }> }) {
  const gate = await requireAdminApiAccess("/api/admin/bots/memory");
  if (!gate.ok) return gate.response;

  const { botId } = await ctx.params;
  const bot = botDeckBot(botId);
  if (!bot) return NextResponse.json({ error: "Unknown bot" }, { status: 404 });

  const body = (await req.json()) as { note?: string; syncConductor?: boolean };
  if (!body.note?.trim()) return NextResponse.json({ error: "note required" }, { status: 400 });

  await appendBotMemory(bot.id, body.note);
  if (bot.id !== "conductor" && body.syncConductor !== false) {
    await appendBotMemory("conductor", `[${bot.name}] ${body.note}`);
  }
  return NextResponse.json({ ok: true });
}
