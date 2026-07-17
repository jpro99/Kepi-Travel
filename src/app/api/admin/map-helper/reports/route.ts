import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApiAccess } from "@/lib/admin/requireAdminApiAccess";
import {
  listMapHelperReports,
  updateMapHelperReportStatus,
  type MapHelperReportStatus,
} from "@/lib/airportNav/mapHelperStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/map-helper/reports?iata=&status= */
export async function GET(req: Request) {
  const access = await requireAdminApiAccess("/api/admin/map-helper/reports");
  if (!access.ok) return access.response;

  const url = new URL(req.url);
  const iata = url.searchParams.get("iata")?.trim().toUpperCase() || undefined;
  const status = url.searchParams.get("status")?.trim() as MapHelperReportStatus | undefined;
  const reports = await listMapHelperReports({
    iata,
    status: status === "pending" || status === "accepted" || status === "dismissed" ? status : undefined,
    limit: 150,
  });
  return NextResponse.json({ reports });
}

const BodySchema = z.object({
  reportId: z.string().trim().min(3).max(80),
  action: z.enum(["accept", "dismiss"]),
  adminNote: z.string().trim().max(400).optional(),
});

/** POST /api/admin/map-helper/reports — accept or dismiss (never auto-publishes layout). */
export async function POST(req: Request) {
  const access = await requireAdminApiAccess("/api/admin/map-helper/reports");
  if (!access.ok) return access.response;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const updated = await updateMapHelperReportStatus({
    reportId: parsed.data.reportId,
    status: parsed.data.action === "accept" ? "accepted" : "dismissed",
    reviewedBy: access.userId,
    adminNote: parsed.data.adminNote,
  });
  if (!updated) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, report: updated });
}
