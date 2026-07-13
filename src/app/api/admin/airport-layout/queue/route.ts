import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApiAccess } from "@/lib/admin/requireAdminApiAccess";
import {
  listAirportCurationRequests,
  setAirportCurationStatus,
} from "@/lib/airportNav/airportCurationQueue";

const UpdateSchema = z.object({
  iata: z.string().trim().regex(/^[A-Za-z]{3}$/),
  status: z.enum(["requested", "dismissed"]),
});

export async function GET() {
  const gate = await requireAdminApiAccess("/api/admin/airport-layout/queue");
  if (!gate.ok) return gate.response;
  return NextResponse.json({ requests: await listAirportCurationRequests() });
}

export async function POST(request: Request) {
  const gate = await requireAdminApiAccess("/api/admin/airport-layout/queue");
  if (!gate.ok) return gate.response;
  try {
    const body = UpdateSchema.parse(await request.json());
    const updated = await setAirportCurationStatus(body.iata, body.status);
    return NextResponse.json({ request: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid curation queue update", details: error.flatten() },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Unable to update curation queue" }, { status: 400 });
  }
}
