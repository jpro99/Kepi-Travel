import { NextResponse } from "next/server";
import { requireAdminApiAccess } from "@/lib/admin/requireAdminApiAccess";
import { listBotDeckTasks, updateBotDeckTask } from "@/lib/admin/botDeck/store";

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

export async function PATCH(req: Request, ctx: { params: Promise<{ taskId: string }> }) {
  const gate = await requireAdminApiAccess("/api/admin/bots/tasks");
  if (!gate.ok) return gate.response;

  const { taskId } = await ctx.params;
  const body = (await req.json()) as { status?: string; priority?: string; creditNote?: string };
  const task = await updateBotDeckTask(taskId, {
    status: body.status as "pending" | "in_progress" | "done" | "cancelled" | undefined,
    priority: body.priority as "low" | "normal" | "high" | undefined,
    creditNote: body.creditNote,
  });

  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  return NextResponse.json({ task });
}
