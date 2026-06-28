const DEFAULT_UTM = {
  source: "kepitravel",
  medium: "referral",
  campaign: "hotel-search",
};

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}

export function resolveBookingComAid(): string | null {
  return (
    readEnv("NEXT_PUBLIC_KEPI_BOOKING_COM_AID") ??
    readEnv("KEPI_BOOKING_COM_AID") ??
    readEnv("BOOKING_COM_AID")
  );
}

export function resolveBookingComLabel(): string | null {
  return (
    readEnv("NEXT_PUBLIC_KEPI_BOOKING_COM_LABEL") ??
    readEnv("KEPI_BOOKING_COM_LABEL") ??
    readEnv("BOOKING_COM_LABEL")
  );
}

export function appendGoogleHotelsAffiliateParams(url: string): string {
  try {
    const parsed = new URL(url);
    const partner = readEnv("KEPI_GOOGLE_HOTELS_PARTNER");
    const utmSource = readEnv("KEPI_HOTEL_UTM_SOURCE") ?? DEFAULT_UTM.source;
    const utmMedium = readEnv("KEPI_HOTEL_UTM_MEDIUM") ?? DEFAULT_UTM.medium;
    const utmCampaign = readEnv("KEPI_HOTEL_UTM_CAMPAIGN") ?? DEFAULT_UTM.campaign;

    if (partner) parsed.searchParams.set("partner", partner);
    parsed.searchParams.set("utm_source", utmSource);
    parsed.searchParams.set("utm_medium", utmMedium);
    parsed.searchParams.set("utm_campaign", utmCampaign);
    return parsed.toString();
  } catch {
    return url;
  }
}

export function buildBookingComSearchUrl(input: {
  destination: string;
  checkInDate: string;
  checkOutDate: string;
  propertyName?: string;
}): string | null {
  const aid = resolveBookingComAid();
  if (!aid) return null;

  const destination = input.propertyName?.trim()
    ? `${input.propertyName.trim()}, ${input.destination.trim()}`
    : input.destination.trim();
  if (!destination) return null;

  const params = new URLSearchParams({
    ss: destination,
    checkin: input.checkInDate,
    checkout: input.checkOutDate,
    group_adults: "2",
    no_rooms: "1",
    aid,
  });

  const label = resolveBookingComLabel();
  if (label) params.set("label", label);

  const utmSource = readEnv("KEPI_HOTEL_UTM_SOURCE") ?? DEFAULT_UTM.source;
  params.set("utm_source", utmSource);

  return `https://www.booking.com/searchresults.html?${params.toString()}`;
}
