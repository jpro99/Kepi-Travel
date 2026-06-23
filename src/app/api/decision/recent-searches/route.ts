import { NextResponse } from "next/server";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { listRecentSearchSnapshots } from "@/lib/flights/searchSnapshotCache";

export async function GET() {
  const userId = await resolveAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const snapshots = await listRecentSearchSnapshots(userId);
  return NextResponse.json({ snapshots });
}
