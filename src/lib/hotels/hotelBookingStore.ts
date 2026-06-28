import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";
import { generateId } from "@/lib/utils/generateId";

const PENDING_PREFIX = "hotel-checkout-pending";
const FULFILLED_PREFIX = "hotel-checkout-fulfilled";

export interface PendingHotelCheckout {
  id: string;
  userId: string;
  stripeSessionId?: string;
  prebookId: string;
  offerId: string;
  netTotalUsd: number;
  guestTotalUsd: number;
  isMemberRate: boolean;
  currency: string;
  hotel: {
    id: string;
    name: string;
    chainName?: string;
    address?: string;
    city: string;
    checkIn: string;
    checkOut: string;
    guests: number;
    rooms: number;
    nights: number;
  };
  guest: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
  };
  createdAt: string;
  status: "pending" | "paid" | "booked" | "failed";
  bookingReference?: string;
  error?: string;
}

export async function savePendingHotelCheckout(
  record: PendingHotelCheckout,
): Promise<void> {
  await kvStoreSet(`${PENDING_PREFIX}/${record.userId}/${record.id}`, record, { userId: record.userId });
}

export async function getPendingHotelCheckout(
  userId: string,
  pendingId: string,
): Promise<PendingHotelCheckout | null> {
  return kvStoreGet<PendingHotelCheckout>(`${PENDING_PREFIX}/${userId}/${pendingId}`, { userId });
}

export async function updatePendingHotelCheckout(
  record: PendingHotelCheckout,
): Promise<void> {
  await savePendingHotelCheckout(record);
}

export function createPendingHotelCheckoutId(): string {
  return generateId();
}

export async function markHotelCheckoutFulfilled(stripeSessionId: string, bookingReference: string): Promise<void> {
  await kvStoreSet(`${FULFILLED_PREFIX}/${stripeSessionId}`, { bookingReference, at: new Date().toISOString() }, {
    userId: "__hotel-checkout__",
  });
}

export async function getHotelCheckoutFulfillment(
  stripeSessionId: string,
): Promise<{ bookingReference: string } | null> {
  return kvStoreGet<{ bookingReference: string }>(`${FULFILLED_PREFIX}/${stripeSessionId}`, {
    userId: "__hotel-checkout__",
  });
}
