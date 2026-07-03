import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { buildBasePackingList, type PackingContext } from "@/lib/packing/smartPack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as Partial<PackingContext>;

  if (!body.destination || !body.departDate) {
    return NextResponse.json({ error: "Missing destination or date" }, { status: 400 });
  }

  const nights = body.nights ?? (body.returnDate
    ? Math.ceil((new Date(body.returnDate).getTime() - new Date(body.departDate).getTime()) / 86_400_000)
    : 3);

  const ctx: PackingContext = {
    destination: body.destination,
    destinationCity: body.destinationCity,
    departDate: body.departDate,
    returnDate: body.returnDate,
    nights,
    tripType: body.tripType ?? "leisure",
    activities: body.activities,
    formalDinner: body.formalDinner,
    gender: body.gender,
  };

  // Build base list from rules engine
  const baseList = buildBasePackingList(ctx);

  // Enhance with Claude AI for destination-specific items
  let aiAdditions: { name: string; category: string; note: string }[] = [];
  try {
    const prompt = `You are a travel packing expert. For a ${nights}-night ${ctx.tripType} trip to ${ctx.destination} departing ${ctx.departDate}, suggest 5-8 destination-specific packing items NOT already in a standard list. Focus on items specific to this exact destination (local customs, unique weather, specific activities, cultural requirements). Return ONLY a JSON array like: [{"name":"item","category":"Clothing|Toiletries|Misc|Health|Documents","note":"brief reason"}]. No other text.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const text = data.content?.[0]?.text ?? "";
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean) as typeof aiAdditions;
      if (Array.isArray(parsed)) aiAdditions = parsed.slice(0, 8);
    }
  } catch {
    // Claude unavailable — base list is still great
  }

  return NextResponse.json({ items: baseList, aiAdditions, ctx });
}
