import { resolveLiteApiKey } from "@/lib/providers/liteapi/searchHotels";

const LITEAPI_BOOK_BASE = "https://book.liteapi.travel/v3.0";

function resolvePaymentMethod(): string {
  return process.env.LITEAPI_PAYMENT_METHOD?.trim() || "ACC_CREDIT_CARD";
}

export interface LiteApiPrebookResult {
  prebookId: string;
  netTotalUsd: number;
  currency: string;
  hotelName?: string;
  roomName?: string;
}

export interface LiteApiBookResult {
  bookingId: string;
  confirmationCode?: string;
  status?: string;
}

function readTotalUsd(payload: Record<string, unknown>): number {
  const data = payload.data as Record<string, unknown> | undefined;
  const price = data?.price as Record<string, unknown> | undefined;
  const total = price?.total as Record<string, unknown> | undefined;
  const amount = total?.amount ?? price?.amount ?? data?.totalAmount;
  if (typeof amount === "number" && Number.isFinite(amount)) return amount;
  if (typeof amount === "string") {
    const parsed = Number.parseFloat(amount);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Number.NaN;
}

export async function prebookLiteApiOffer(offerId: string): Promise<LiteApiPrebookResult> {
  const apiKey = resolveLiteApiKey();
  if (!apiKey) {
    throw new Error("LiteAPI not configured");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35_000);

  try {
    const response = await fetch(`${LITEAPI_BOOK_BASE}/rates/prebook`, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        offerId,
        usePaymentSdk: false,
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const err = payload as { message?: string; error?: string };
      throw new Error(err.message ?? err.error ?? `Prebook failed (${response.status})`);
    }

    const data = payload.data as Record<string, unknown> | undefined;
    const prebookId = typeof data?.prebookId === "string" ? data.prebookId : typeof payload.prebookId === "string" ? payload.prebookId : null;
    if (!prebookId) {
      throw new Error("Prebook did not return a prebookId");
    }

    const netTotalUsd = readTotalUsd(payload);
    if (!Number.isFinite(netTotalUsd) || netTotalUsd <= 0) {
      throw new Error("Prebook did not return a valid price");
    }

    const roomTypes = data?.roomTypes as Array<{ rates?: Array<{ name?: string }> }> | undefined;
    const roomName = roomTypes?.[0]?.rates?.[0]?.name;

    return {
      prebookId,
      netTotalUsd,
      currency: "USD",
      hotelName: typeof data?.hotelName === "string" ? data.hotelName : undefined,
      roomName,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function bookLiteApiPrebook(input: {
  prebookId: string;
  holder: { firstName: string; lastName: string; email: string };
  guests: Array<{ firstName: string; lastName: string; email: string; occupancyNumber?: number }>;
  clientReference?: string;
}): Promise<LiteApiBookResult> {
  const apiKey = resolveLiteApiKey();
  if (!apiKey) {
    throw new Error("LiteAPI not configured");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);

  try {
    const response = await fetch(`${LITEAPI_BOOK_BASE}/rates/book`, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prebookId: input.prebookId,
        clientReference: input.clientReference,
        holder: {
          firstName: input.holder.firstName,
          lastName: input.holder.lastName,
          email: input.holder.email,
        },
        guests: input.guests.map((guest, index) => ({
          occupancyNumber: guest.occupancyNumber ?? index + 1,
          firstName: guest.firstName,
          lastName: guest.lastName,
          email: guest.email,
        })),
        payment: {
          method: resolvePaymentMethod(),
        },
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const err = payload as { message?: string; error?: string };
      throw new Error(err.message ?? err.error ?? `Booking failed (${response.status})`);
    }

    const data = payload.data as Record<string, unknown> | undefined;
    const bookingId =
      (typeof data?.bookingId === "string" ? data.bookingId : null) ??
      (typeof data?.id === "string" ? data.id : null) ??
      (typeof payload.bookingId === "string" ? payload.bookingId : null);

    if (!bookingId) {
      throw new Error("Booking succeeded but no booking id was returned");
    }

    const confirmationCode =
      (typeof data?.hotelConfirmationCode === "string" ? data.hotelConfirmationCode : undefined) ??
      (typeof data?.confirmationCode === "string" ? data.confirmationCode : undefined);

    return {
      bookingId,
      confirmationCode,
      status: typeof data?.status === "string" ? data.status : undefined,
    };
  } finally {
    clearTimeout(timer);
  }
}
