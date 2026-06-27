import { NextResponse } from "next/server";
import { requireAdminApiAccess } from "@/lib/admin/requireAdminApiAccess";
import {
  createBotDeckTask,
  cursorPromptForTask,
  listBotDeckTasks,
} from "@/lib/admin/botDeck/store";
import { botDeckBot, type BotDeckBotId } from "@/lib/admin/botDeck/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const gate = await requireAdminApiAccess("/api/admin/bots/tasks");
  if (!gate.ok) return gate.response;

  const assignee = new URL(req.url).searchParams.get("assignee");
  let tasks = await listBotDeckTasks();
  if (assignee) tasks = tasks.filter((t) => t.assignee === assignee);
  tasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json({ tasks });
}

export async function POST(req: Request) {
  const gate = await requireAdminApiAccess("/api/admin/bots/tasks");
  if (!gate.ok) return gate.response;

  const body = (await req.json()) as {
    assignee?: string;
    instruction?: string;
    creditNote?: string;
  };

  const assignee = (body.assignee ?? "hotel") as BotDeckBotId;
  if (!botDeckBot(assignee)) {
    return NextResponse.json({ error: "Invalid bot" }, { status: 400 });
  }
  if (!body.instruction?.trim()) {
    return NextResponse.json({ error: "instruction required" }, { status: 400 });
  }

  const task = await createBotDeckTask({
    assignee,
    instruction: body.instruction,
    creditNote: body.creditNote,
    from: "jeff",
  });

  return NextResponse.json(
    {
      task,
      cursorPrompt: cursorPromptForTask(assignee, body.instruction.trim()),
    },
    { status: 201 },
  );
}
