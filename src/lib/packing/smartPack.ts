// Smart packing engine — generates context-aware lists

export interface PackingContext {
  destination: string;
  destinationCity?: string;
  departDate: string;
  returnDate?: string;
  nights: number;
  tripType: "business" | "leisure" | "mixed" | "beach" | "ski" | "adventure";
  weatherSummary?: string;
  activities?: string[];
  formalDinner?: boolean;
  gender?: "m" | "f" | "unspecified";
}

export interface PackingItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit?: string;
  essential: boolean;
  packed: boolean;
  note?: string;
}

export type PackingCategory =
  | "Clothing"
  | "Shoes"
  | "Toiletries"
  | "Documents"
  | "Electronics"
  | "Health"
  | "Comfort"
  | "Business"
  | "Beach"
  | "Ski"
  | "Misc";

// Month → hemisphere-aware season
function getSeasonForDestination(date: string, isSouthernHemisphere: boolean) {
  const month = new Date(date).getMonth(); // 0-11
  const northSeason = month >= 2 && month <= 4 ? "spring" :
    month >= 5 && month <= 7 ? "summer" :
    month >= 8 && month <= 10 ? "fall" : "winter";
  if (!isSouthernHemisphere) return northSeason;
  const flip: Record<string, string> = { spring: "fall", summer: "winter", fall: "spring", winter: "summer" };
  return flip[northSeason] ?? northSeason;
}

// Destinations in southern hemisphere
const SOUTHERN = ["AU", "NZ", "AR", "BR", "ZA", "CL", "PE"];

function isSouth(dest: string) {
  return SOUTHERN.some(c => dest.toUpperCase().includes(c));
}

export function buildBasePackingList(ctx: PackingContext): PackingItem[] {
  const { nights, tripType } = ctx;
  const season = getSeasonForDestination(ctx.departDate, isSouth(ctx.destination));
  const isWarm = season === "summer" || ctx.destination.toLowerCase().includes("hawaii") ||
    ctx.destination.toLowerCase().includes("cancun") || ctx.destination.toLowerCase().includes("miami") ||
    ctx.destination.toLowerCase().includes("bali") || ctx.destination.toLowerCase().includes("thailand");
  const isCold = season === "winter" || ctx.destination.toLowerCase().includes("iceland") ||
    ctx.destination.toLowerCase().includes("canada") || ctx.destination.toLowerCase().includes("alaska");
  const isBusiness = tripType === "business" || tripType === "mixed";
  const isBeach = tripType === "beach" || isWarm;
  const isSki = tripType === "ski";
  const outfits = Math.min(nights + 1, 7); // cap at 7, do laundry
  const shirts = Math.ceil(outfits * 1.3); // extra shirts

  const id = (n: string) => n.toLowerCase().replace(/\s+/g, "_");

  const items: PackingItem[] = [
    // DOCUMENTS — always essential
    { id: "passport", name: "Passport", category: "Documents", quantity: 1, essential: true, packed: false },
    { id: "id", name: "Driver's license / ID", category: "Documents", quantity: 1, essential: true, packed: false },
    { id: "boarding_passes", name: "Boarding passes downloaded", category: "Documents", quantity: 1, essential: true, packed: false, note: "Screenshot offline copy" },
    { id: "travel_insurance", name: "Travel insurance card", category: "Documents", quantity: 1, essential: false, packed: false },
    { id: "hotel_confirmation", name: "Hotel confirmation printed/saved", category: "Documents", quantity: 1, essential: true, packed: false },
    { id: "credit_cards", name: "Credit cards (no foreign fees)", category: "Documents", quantity: 2, essential: true, packed: false },
    { id: "cash", name: "Local currency / cash", category: "Documents", quantity: 1, essential: true, packed: false, note: "$100 minimum" },

    // ELECTRONICS
    { id: "phone_charger", name: "Phone charger", category: "Electronics", quantity: 1, essential: true, packed: false },
    { id: "power_adapter", name: "International power adapter", category: "Electronics", quantity: 1, essential: true, packed: false },
    { id: "portable_charger", name: "Portable battery pack", category: "Electronics", quantity: 1, essential: false, packed: false },
    { id: "earbuds", name: "Earbuds / headphones", category: "Electronics", quantity: 1, essential: false, packed: false },
    { id: "camera", name: "Camera + memory cards", category: "Electronics", quantity: 1, essential: false, packed: false },

    // TOILETRIES
    { id: "toothbrush", name: "Toothbrush + toothpaste", category: "Toiletries", quantity: 1, essential: true, packed: false },
    { id: "deodorant", name: "Deodorant", category: "Toiletries", quantity: 1, essential: true, packed: false },
    { id: "shampoo", name: "Shampoo + conditioner", category: "Toiletries", quantity: 1, essential: false, packed: false, note: "Or use hotel's" },
    { id: "razor", name: "Razor / shaver", category: "Toiletries", quantity: 1, essential: false, packed: false },
    { id: "lip_balm", name: "Lip balm (SPF)", category: "Toiletries", quantity: 1, essential: false, packed: false },

    // HEALTH
    { id: "prescriptions", name: "Prescription medications", category: "Health", quantity: nights + 3, unit: "days extra", essential: true, packed: false, note: "Pack extra in case of delays" },
    { id: "pain_relief", name: "Pain reliever (Advil/Tylenol)", category: "Health", quantity: 1, essential: true, packed: false },
    { id: "antidiarrheal", name: "Antidiarrheal / Pepto", category: "Health", quantity: 1, essential: false, packed: false },
    { id: "band_aids", name: "Band-aids", category: "Health", quantity: 6, essential: false, packed: false },
    { id: "hand_sanitizer", name: "Hand sanitizer", category: "Health", quantity: 1, essential: true, packed: false },

    // COMFORT (flight)
    { id: "neck_pillow", name: "Travel neck pillow", category: "Comfort", quantity: 1, essential: false, packed: false },
    { id: "eye_mask", name: "Eye mask", category: "Comfort", quantity: 1, essential: false, packed: false },
    { id: "melatonin", name: "Melatonin (jet lag)", category: "Comfort", quantity: 1, essential: false, packed: false, note: "For long-haul" },

    // CLOTHING — basics
    { id: id("t_shirts"), name: isWarm ? "T-shirts / light tops" : "Shirts / tops", category: "Clothing", quantity: shirts, essential: true, packed: false },
    { id: id("underwear"), name: "Underwear", category: "Clothing", quantity: nights + 1, essential: true, packed: false },
    { id: id("socks"), name: "Socks", category: "Clothing", quantity: nights + 1, essential: true, packed: false },
    { id: id("pants"), name: isBusiness ? "Dress pants / slacks" : "Pants / jeans", category: "Clothing", quantity: Math.ceil(outfits / 2), essential: true, packed: false },
    { id: id("sleepwear"), name: "Sleepwear", category: "Clothing", quantity: 1, essential: false, packed: false },

    // SHOES
    { id: id("main_shoes"), name: isBusiness ? "Dress shoes" : "Walking shoes / sneakers", category: "Shoes", quantity: 1, unit: "pair", essential: true, packed: false },
    { id: id("casual_shoes"), name: "Casual shoes / sandals", category: "Shoes", quantity: 1, unit: "pair", essential: false, packed: false },
  ];

  // Warm weather additions
  if (isWarm) {
    items.push(
      { id: "sunscreen", name: "Sunscreen SPF 50+", category: "Toiletries", quantity: 1, essential: true, packed: false },
      { id: "sunglasses", name: "Sunglasses", category: "Clothing", quantity: 1, essential: true, packed: false },
      { id: "hat", name: "Sun hat / cap", category: "Clothing", quantity: 1, essential: false, packed: false },
    );
  }

  // Cold weather additions
  if (isCold) {
    items.push(
      { id: "heavy_jacket", name: "Heavy jacket / coat", category: "Clothing", quantity: 1, essential: true, packed: false },
      { id: "gloves", name: "Gloves", category: "Clothing", quantity: 1, unit: "pair", essential: true, packed: false },
      { id: "beanie", name: "Beanie / hat", category: "Clothing", quantity: 1, essential: true, packed: false },
      { id: "thermal_layer", name: "Thermal base layer", category: "Clothing", quantity: 2, essential: false, packed: false },
      { id: "scarf", name: "Scarf", category: "Clothing", quantity: 1, essential: false, packed: false },
    );
  } else if (!isWarm) {
    items.push({ id: "light_jacket", name: "Light jacket / layer", category: "Clothing", quantity: 1, essential: true, packed: false });
  }

  // Beach additions
  if (isBeach) {
    items.push(
      { id: "swimsuit", name: "Swimsuit", category: "Beach", quantity: 2, essential: true, packed: false },
      { id: "beach_bag", name: "Beach bag", category: "Beach", quantity: 1, essential: false, packed: false },
      { id: "flip_flops", name: "Flip flops", category: "Beach", quantity: 1, unit: "pair", essential: true, packed: false },
      { id: "rash_guard", name: "Rash guard / cover-up", category: "Beach", quantity: 1, essential: false, packed: false },
      { id: "after_sun", name: "After-sun lotion / aloe", category: "Beach", quantity: 1, essential: false, packed: false },
    );
  }

  // Business additions
  if (isBusiness) {
    items.push(
      { id: "dress_shirts", name: "Dress shirts / blouses", category: "Business", quantity: Math.ceil(outfits / 2) + 1, essential: true, packed: false },
      { id: "blazer", name: "Blazer / sport coat", category: "Business", quantity: 1, essential: true, packed: false },
      { id: "business_cards", name: "Business cards", category: "Business", quantity: 1, essential: false, packed: false },
      { id: "laptop", name: "Laptop + charger", category: "Business", quantity: 1, essential: true, packed: false },
      { id: "notebook", name: "Notebook + pen", category: "Business", quantity: 1, essential: false, packed: false },
      { id: "formal_shoes", name: "Formal shoes (polished)", category: "Business", quantity: 1, unit: "pair", essential: true, packed: false },
    );
    if (ctx.formalDinner) {
      items.push({ id: "formal_outfit", name: "Formal outfit for dinner", category: "Business", quantity: 1, essential: true, packed: false, note: "Check dress code" });
    }
  }

  // Ski additions
  if (isSki) {
    items.push(
      { id: "ski_jacket", name: "Ski jacket (waterproof)", category: "Ski", quantity: 1, essential: true, packed: false },
      { id: "ski_pants", name: "Ski pants", category: "Ski", quantity: 1, essential: true, packed: false },
      { id: "ski_goggles", name: "Ski goggles", category: "Ski", quantity: 1, essential: true, packed: false },
      { id: "ski_gloves", name: "Waterproof gloves", category: "Ski", quantity: 1, unit: "pair", essential: true, packed: false },
      { id: "helmet", name: "Helmet (or rent on site)", category: "Ski", quantity: 1, essential: true, packed: false },
      { id: "base_layers", name: "Merino wool base layers", category: "Ski", quantity: 2, essential: true, packed: false },
      { id: "ski_socks", name: "Ski socks", category: "Ski", quantity: 3, essential: true, packed: false },
      { id: "hand_warmers", name: "Hand warmers", category: "Ski", quantity: 6, essential: false, packed: false },
      { id: "chapstick_ski", name: "SPF lip balm + face cream", category: "Ski", quantity: 1, essential: true, packed: false },
    );
  }

  // Long trip extras
  if (nights >= 7) {
    items.push(
      { id: "laundry_bag", name: "Laundry bag", category: "Misc", quantity: 1, essential: false, packed: false },
      { id: "travel_detergent", name: "Travel laundry detergent", category: "Misc", quantity: 1, essential: false, packed: false, note: "For sink washing" },
    );
  }

  // Misc always-useful
  items.push(
    { id: "luggage_lock", name: "Luggage lock (TSA-approved)", category: "Misc", quantity: 1, essential: false, packed: false },
    { id: "packing_cubes", name: "Packing cubes", category: "Misc", quantity: 1, essential: false, packed: false },
    { id: "reusable_bag", name: "Reusable shopping bag (folds flat)", category: "Misc", quantity: 1, essential: false, packed: false },
    { id: "snacks", name: "Snacks for the flight", category: "Misc", quantity: 1, essential: false, packed: false },
  );

  return items;
}

export function groupByCategory(items: PackingItem[]): Map<string, PackingItem[]> {
  const map = new Map<string, PackingItem[]>();
  for (const item of items) {
    const existing = map.get(item.category) ?? [];
    existing.push(item);
    map.set(item.category, existing);
  }
  return map;
}

export const CATEGORY_EMOJI: Record<string, string> = {
  Documents: "📄",
  Electronics: "🔌",
  Toiletries: "🪥",
  Health: "💊",
  Comfort: "😴",
  Clothing: "👕",
  Shoes: "👟",
  Business: "💼",
  Beach: "🏖️",
  Ski: "⛷️",
  Misc: "🎒",
};
