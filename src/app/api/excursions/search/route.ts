import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { searchExcursions } from "@/lib/excursions/catalog";

export const dynamic = "force-dynamic";

const SearchSchema = z.object({
  destination: z.string().trim().min(1),
  date: z.string().trim().optional(),
  category: z
    .enum(["all", "cooking-class", "food-tour", "wine-tasting", "cultural-tour", "outdoor-adventure"])
    .optional(),
  query: z.string().trim().optional(),
});

export async function POST(req: Request): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = SearchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 422 });
  }

  const excursions = searchExcursions({
    destination: parsed.data.destination,
    date: parsed.data.date,
    category: parsed.data.category ?? "all",
    query: parsed.data.query,
  });

  return NextResponse.json({
    excursions,
    total: excursions.length,
    destination: parsed.data.destination,
  });
}
