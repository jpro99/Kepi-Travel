import { NextResponse } from "next/server";
import { requireAdminApiAccess } from "@/lib/admin/requireAdminApiAccess";
import { getProjectMemory, setProjectMemory } from "@/lib/admin/botDeck/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdminApiAccess("/api/admin/bots/project-memory");
  if (!gate.ok) return gate.response;

  return NextResponse.json({ content: await getProjectMemory() });
}

export async function POST(req: Request) {
  const gate = await requireAdminApiAccess("/api/admin/bots/project-memory");
  if (!gate.ok) return gate.response;

  const body = (await req.json()) as { content?: string };
  if (!body.content?.trim()) return NextResponse.json({ error: "content required" }, { status: 400 });

  await setProjectMemory(body.content);
  return NextResponse.json({ ok: true });
}
