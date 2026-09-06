import { NextResponse } from "next/server";
import { getPlanCityCatalogByKey } from "@/lib/planCity/catalogRegistry";
import { resolvePlanCityCatalogId } from "@/lib/planCity/resolveCityKey";

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const cityParam = url.searchParams.get("city")?.trim() ?? "";
  const cityIdParam = url.searchParams.get("cityId")?.trim() ?? "";

  const catalogId = cityIdParam || resolvePlanCityCatalogId(cityParam);
  if (!catalogId) {
    return NextResponse.json(
      {
        catalog: null,
        cityLabel: cityParam || null,
        message: "No Plan City catalog for this city yet — pipeline may be thin until Facts run.",
      },
      { status: 200 },
    );
  }

  const catalog = getPlanCityCatalogByKey(catalogId);
  if (!catalog) {
    return NextResponse.json({ catalog: null, cityLabel: cityParam || null }, { status: 200 });
  }

  return NextResponse.json({ catalog, cityLabel: catalog.cityLabel });
}
