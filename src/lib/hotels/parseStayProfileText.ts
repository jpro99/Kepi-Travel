import type { BreakfastPreference, HotelQualityFloor, HotelStayProfile } from "@/lib/memory/hotelStayProfile";

/** Rule-based parser for natural-language hotel preferences (voice or typed). */
export function parseStayProfileText(text: string): Partial<HotelStayProfile> {
  const lower = text.toLowerCase();
  const patch: Partial<HotelStayProfile> = { freeTextSummary: text.trim() };

  if (/\b(no stairs|without stairs|avoid stairs|hate stairs|drag.*bag|lug.*bag|carry.*up|walk.*up)\b/.test(lower)) {
    patch.avoidStairs = true;
    patch.requiresElevator = true;
  }
  if (/\b(elevator|lift)\b/.test(lower)) {
    patch.requiresElevator = true;
  }

  if (/\b(balcony|terrace|patio)\b/.test(lower)) patch.prefersBalcony = true;
  if (/\b(ocean|beach|sea|waterfront|coast|seaside|harbor|harbour)\b/.test(lower)) {
    patch.prefersOceanView = true;
  }
  if (/\b(metro|subway|train|transit|rail|station|public transport)\b/.test(lower)) {
    patch.prefersNearTransit = true;
  }
  if (/\b(central|downtown|city center|walkable|old town)\b/.test(lower)) {
    patch.prefersCentralArea = true;
  }

  let breakfast: BreakfastPreference | undefined;
  if (/\b(free breakfast|breakfast included|must have breakfast|need breakfast)\b/.test(lower)) {
    breakfast = "required";
  } else if (/\b(breakfast|morning meal)\b/.test(lower)) {
    breakfast = "nice_to_have";
  }
  if (breakfast) patch.prefersBreakfast = breakfast;

  if (/\b(luxury|five star|5 star|premium|high end|splurge)\b/.test(lower)) {
    patch.qualityFloor = "luxury";
  } else if (/\b(quality|clean|nice hotel|good hotel|personable|boutique)\b/.test(lower)) {
    patch.qualityFloor = "high";
  } else if (/\b(budget|cheap|affordable|value)\b/.test(lower)) {
    patch.qualityFloor = "budget";
  }

  return patch;
}

export function mergeStayProfile(
  existing: HotelStayProfile,
  patch: Partial<HotelStayProfile>,
): HotelStayProfile {
  return {
    ...existing,
    ...patch,
    freeTextSummary: patch.freeTextSummary?.trim() || existing.freeTextSummary,
    completed: Boolean((patch.freeTextSummary ?? existing.freeTextSummary).trim().length >= 12),
    updatedAt: new Date().toISOString(),
  };
}
