import type { ExcursionCategory, ExcursionOffer, ExcursionSearchRequest } from "@/lib/excursions/types";

const CATALOG: ExcursionOffer[] = [
  {
    id: "rome-pasta-class",
    title: "Handmade Pasta & Tiramisu Workshop",
    provider: "Trastevere Kitchen Lab",
    category: "cooking-class",
    city: "Rome",
    cityCodes: ["ROM", "FCO", "CIA"],
    country: "Italy",
    durationMinutes: 180,
    priceUsd: 89,
    currency: "USD",
    rating: 4.9,
    reviewCount: 2140,
    description: "Roll fresh fettuccine, fill ravioli, and finish with classic tiramisu in a chef-led Roman kitchen.",
    highlights: ["Small group", "Wine included", "Recipes to take home"],
    includes: ["Ingredients", "Apron", "Lunch with your dishes"],
    meetingPoint: "Via di San Francesco a Ripa 55, Trastevere",
    maxGuests: 12,
    cancellable: true,
    imageEmoji: "🍝",
  },
  {
    id: "rome-food-walk",
    title: "Trastevere Evening Food Walk",
    provider: "Roma Bites",
    category: "food-tour",
    city: "Rome",
    cityCodes: ["ROM", "FCO", "CIA"],
    country: "Italy",
    durationMinutes: 210,
    priceUsd: 72,
    currency: "USD",
    rating: 4.8,
    reviewCount: 1680,
    description: "Six stops for supplì, porchetta, gelato, and local wine across Rome's favorite neighborhood.",
    highlights: ["Local guide", "6 tastings", "Hidden alleys"],
    includes: ["All food tastings", "Wine pairings"],
    meetingPoint: "Piazza Trilussa fountain",
    maxGuests: 14,
    cancellable: true,
    imageEmoji: "🥖",
  },
  {
    id: "paris-pastry-class",
    title: "French Pastry Masterclass",
    provider: "Le Petit Atelier",
    category: "cooking-class",
    city: "Paris",
    cityCodes: ["PAR", "CDG", "ORY"],
    country: "France",
    durationMinutes: 150,
    priceUsd: 110,
    currency: "USD",
    rating: 4.9,
    reviewCount: 980,
    description: "Learn laminated dough, crème pâtissière, and assemble your own éclairs and tartelettes.",
    highlights: ["Pastry chef instructor", "Take-home box", "Coffee welcome"],
    includes: ["Tools", "Ingredients", "Pastries to keep"],
    meetingPoint: "11 Rue du Cherche-Midi, 6th arr.",
    maxGuests: 10,
    cancellable: true,
    imageEmoji: "🥐",
  },
  {
    id: "paris-wine-bistro",
    title: "Left Bank Wine & Cheese Tasting",
    provider: "Cave Saint-Germain",
    category: "wine-tasting",
    city: "Paris",
    cityCodes: ["PAR", "CDG", "ORY"],
    country: "France",
    durationMinutes: 90,
    priceUsd: 65,
    currency: "USD",
    rating: 4.7,
    reviewCount: 740,
    description: "Sommelier-led flight of French wines with artisan cheeses and charcuterie.",
    highlights: ["Sommelier host", "5 wines", "Pairing notes"],
    includes: ["Wine flight", "Cheese board"],
    meetingPoint: "62 Rue de Seine, Saint-Germain",
    maxGuests: 16,
    cancellable: true,
    imageEmoji: "🍷",
  },
  {
    id: "barcelona-tapas-class",
    title: "Tapas & Paella Cooking Class",
    provider: "Boqueria Cooks",
    category: "cooking-class",
    city: "Barcelona",
    cityCodes: ["BCN"],
    country: "Spain",
    durationMinutes: 195,
    priceUsd: 84,
    currency: "USD",
    rating: 4.8,
    reviewCount: 1320,
    description: "Shop the market, then cook patatas bravas, gambas al ajillo, and seafood paella.",
    highlights: ["Market visit", "Seafood paella", "Sangria break"],
    includes: ["Market tour", "Lunch", "Recipes"],
    meetingPoint: "Mercat de la Boqueria main entrance",
    maxGuests: 14,
    cancellable: true,
    imageEmoji: "🥘",
  },
  {
    id: "barcelona-gothic-tour",
    title: "Gothic Quarter Secrets Walk",
    provider: "Barcelona Storytellers",
    category: "cultural-tour",
    city: "Barcelona",
    cityCodes: ["BCN"],
    country: "Spain",
    durationMinutes: 120,
    priceUsd: 38,
    currency: "USD",
    rating: 4.6,
    reviewCount: 890,
    description: "Roman walls, hidden courtyards, and the stories behind Gaudí's city.",
    highlights: ["Expert historian", "Skip busy routes", "Photo stops"],
    includes: ["Guided walk", "Headset in crowds"],
    meetingPoint: "Plaça de Sant Jaume",
    maxGuests: 18,
    cancellable: true,
    imageEmoji: "🏛️",
  },
  {
    id: "tokyo-sushi-class",
    title: "Sushi Rolling for Beginners",
    provider: "Tsukiji Kitchen Studio",
    category: "cooking-class",
    city: "Tokyo",
    cityCodes: ["TYO", "HND", "NRT"],
    country: "Japan",
    durationMinutes: 120,
    priceUsd: 95,
    currency: "USD",
    rating: 4.9,
    reviewCount: 1560,
    description: "Knife skills, rice seasoning, and nigiri basics with a licensed itamae instructor.",
    highlights: ["Fish market stories", "Knife demo", "Eat your rolls"],
    includes: ["Ingredients", "Green tea", "Certificate"],
    meetingPoint: "Tsukiji Outer Market Kitchen 2F",
    maxGuests: 8,
    cancellable: true,
    imageEmoji: "🍣",
  },
  {
    id: "tokyo-street-food",
    title: "Shinjuku Street Food Night",
    provider: "Tokyo After Dark",
    category: "food-tour",
    city: "Tokyo",
    cityCodes: ["TYO", "HND", "NRT"],
    country: "Japan",
    durationMinutes: 180,
    priceUsd: 78,
    currency: "USD",
    rating: 4.8,
    reviewCount: 1120,
    description: "Yakitori alleys, ramen counters, and depachika bites with a local foodie guide.",
    highlights: ["7 tastings", "Local bars", "English guide"],
    includes: ["Food tastings", "One drink"],
    meetingPoint: "Shinjuku Station East Exit",
    maxGuests: 12,
    cancellable: true,
    imageEmoji: "🍜",
  },
  {
    id: "nyc-pizza-class",
    title: "NYC Pizza-Making Workshop",
    provider: "Brooklyn Dough Co.",
    category: "cooking-class",
    city: "New York",
    cityCodes: ["NYC", "JFK", "LGA", "EWR"],
    country: "USA",
    durationMinutes: 135,
    priceUsd: 79,
    currency: "USD",
    rating: 4.7,
    reviewCount: 640,
    description: "Stretch dough, build pies, and learn oven techniques in a Brooklyn pizzeria.",
    highlights: ["Wood-fired oven", "Two pizzas each", "Soft drinks"],
    includes: ["Ingredients", "Pizza lunch"],
    meetingPoint: "Williamsburg — address sent after booking",
    maxGuests: 16,
    cancellable: true,
    imageEmoji: "🍕",
  },
  {
    id: "nyc-harlem-jazz",
    title: "Harlem Jazz & Soul Food Evening",
    provider: "Uptown Nights",
    category: "cultural-tour",
    city: "New York",
    cityCodes: ["NYC", "JFK", "LGA", "EWR"],
    country: "USA",
    durationMinutes: 150,
    priceUsd: 92,
    currency: "USD",
    rating: 4.8,
    reviewCount: 520,
    description: "Historic walk, gospel stop, and live jazz set with a Southern dinner spread.",
    highlights: ["Live jazz", "Soul food dinner", "Local historian"],
    includes: ["Dinner", "Show entry", "Guided walk"],
    meetingPoint: "Apollo Theater plaza",
    maxGuests: 20,
    cancellable: true,
    imageEmoji: "🎷",
  },
  {
    id: "london-fish-chips",
    title: "British Pub Classics Cooking Class",
    provider: "Thames Cook School",
    category: "cooking-class",
    city: "London",
    cityCodes: ["LON", "LHR", "LGW", "STN"],
    country: "UK",
    durationMinutes: 165,
    priceUsd: 88,
    currency: "USD",
    rating: 4.7,
    reviewCount: 710,
    description: "Perfect batter, mushy peas, sticky toffee pudding, and a pint while you cook.",
    highlights: ["Pub setting", "Chef instructor", "Full lunch"],
    includes: ["Ingredients", "One pint", "Recipes"],
    meetingPoint: "Southwark — 5 min from London Bridge",
    maxGuests: 12,
    cancellable: true,
    imageEmoji: "🐟",
  },
  {
    id: "london-market-tour",
    title: "Borough Market Food Tour",
    provider: "London Eats",
    category: "food-tour",
    city: "London",
    cityCodes: ["LON", "LHR", "LGW", "STN"],
    country: "UK",
    durationMinutes: 150,
    priceUsd: 68,
    currency: "USD",
    rating: 4.8,
    reviewCount: 1340,
    description: "Artisan cheese, scotch eggs, brownie stops, and market history with a food writer.",
    highlights: ["8 tastings", "Market history", "Small group"],
    includes: ["All tastings"],
    meetingPoint: "Borough Market main gate",
    maxGuests: 14,
    cancellable: true,
    imageEmoji: "🧀",
  },
  {
    id: "hawaii-luau-class",
    title: "Hawaiian Luau Cooking Experience",
    provider: "Aloha Kitchen",
    category: "cooking-class",
    city: "Honolulu",
    cityCodes: ["HNL", "OGG"],
    country: "USA",
    durationMinutes: 180,
    priceUsd: 105,
    currency: "USD",
    rating: 4.9,
    reviewCount: 430,
    description: "Kalua pork prep, poi tasting, haupia dessert, and ukulele welcome in Waikīkī.",
    highlights: ["Cultural intro", "Ocean view kitchen", "Full plate lunch"],
    includes: ["Ingredients", "Lei welcome", "Lunch"],
    meetingPoint: "Waikīkī Beach Walk — lobby desk",
    maxGuests: 16,
    cancellable: true,
    imageEmoji: "🌺",
  },
  {
    id: "oahu-kayak",
    title: "Kailua Bay Kayak & Snorkel",
    provider: "Windward Adventures",
    category: "outdoor-adventure",
    city: "Honolulu",
    cityCodes: ["HNL", "OGG"],
    country: "USA",
    durationMinutes: 240,
    priceUsd: 118,
    currency: "USD",
    rating: 4.8,
    reviewCount: 890,
    description: "Guided paddle to the Mokulua Islands with snorkel gear and beach picnic.",
    highlights: ["Gear included", "Guide photos", "Picnic lunch"],
    includes: ["Kayak", "Snorkel gear", "Lunch", "Shuttle from Waikīkī"],
    meetingPoint: "Kailua Beach Park — check-in tent",
    maxGuests: 10,
    cancellable: true,
    imageEmoji: "🛶",
  },
  {
    id: "bali-balinese-class",
    title: "Balinese Farm-to-Table Cooking",
    provider: "Ubud Green Kitchen",
    category: "cooking-class",
    city: "Bali",
    cityCodes: ["DPS"],
    country: "Indonesia",
    durationMinutes: 240,
    priceUsd: 58,
    currency: "USD",
    rating: 4.9,
    reviewCount: 2100,
    description: "Organic garden tour, spice paste workshop, and feast of lawar, satay, and sambal.",
    highlights: ["Garden tour", "Vegetarian option", "Hotel pickup"],
    includes: ["Pickup", "Lunch", "Recipes"],
    meetingPoint: "Ubud — hotel pickup included",
    maxGuests: 12,
    cancellable: true,
    imageEmoji: "🌿",
  },
  {
    id: "mexico-mole-class",
    title: "Oaxacan Mole & Tortilla Workshop",
    provider: "Casa Culinaria",
    category: "cooking-class",
    city: "Mexico City",
    cityCodes: ["MEX"],
    country: "Mexico",
    durationMinutes: 195,
    priceUsd: 62,
    currency: "USD",
    rating: 4.8,
    reviewCount: 760,
    description: "Grind spices on metate, nixtamal tortillas, and simmer two mole styles from scratch.",
    highlights: ["Traditional tools", "Market visit", "Family recipes"],
    includes: ["Market tour", "Lunch", "Mezcal tasting"],
    meetingPoint: "Coyoacán main square",
    maxGuests: 10,
    cancellable: true,
    imageEmoji: "🌶️",
  },
];

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9\s]/g, "");
}

function destinationTokens(destination: string): string[] {
  const base = normalizeToken(destination);
  const codeMatch = /\(([a-z]{3})\)/i.exec(destination);
  const tokens = new Set<string>();
  if (base) tokens.add(base);
  if (codeMatch) tokens.add(codeMatch[1].toLowerCase());
  for (const part of base.split(/\s+/)) {
    if (part.length >= 3) tokens.add(part);
  }
  return [...tokens];
}

export function listExcursionCatalog(): ExcursionOffer[] {
  return CATALOG;
}

export function getExcursionById(id: string): ExcursionOffer | null {
  return CATALOG.find((offer) => offer.id === id) ?? null;
}

export function searchExcursions(request: ExcursionSearchRequest): ExcursionOffer[] {
  const tokens = destinationTokens(request.destination);
  const query = normalizeToken(request.query ?? "");
  const category = request.category ?? "all";

  return CATALOG.filter((offer) => {
    const cityMatch =
      tokens.length === 0 ||
      tokens.some(
        (token) =>
          normalizeToken(offer.city).includes(token) ||
          offer.cityCodes.some((code) => code.toLowerCase() === token) ||
          normalizeToken(offer.country).includes(token),
      );
    if (!cityMatch) return false;

    if (category !== "all" && offer.category !== category) return false;

    if (query) {
      const haystack = normalizeToken(
        [offer.title, offer.provider, offer.description, ...offer.highlights].join(" "),
      );
      if (!haystack.includes(query)) return false;
    }

    return true;
  }).sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);
}

export function formatExcursionDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

export function reservationTypeForExcursion(category: ExcursionCategory): "dinner" | "ride" {
  return category === "outdoor-adventure" || category === "cultural-tour" ? "ride" : "dinner";
}
