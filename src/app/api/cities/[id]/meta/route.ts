import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getCityCatalog } from "@/data/cities/registry";
import { logger } from "@/lib/logger";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const requestId = _request.headers.get("x-request-id")?.trim() || randomUUID();
  const routeLogger = logger.withContext({ requestId, route: "/api/cities/[id]/meta" });
  const { id: raw } = await params;
  const id = decodeURIComponent(raw);
  const catalog = getCityCatalog(id);
  if (!catalog) {
    routeLogger.warn("Unknown city metadata request.", { cityId: id });
    return NextResponse.json({ error: "Unknown city" }, { status: 404 });
  }
  routeLogger.info("Returning city metadata.", { cityId: id });
  return NextResponse.json({
    id: catalog.id,
    label: catalog.label,
    map: catalog.map,
  });
}
