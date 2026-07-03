import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { HomeLanding } from "@/components/landing/HomeLanding";
import { getSubscriptionRecord, isSubscriptionActive } from "@/lib/billing/subscriptionStore";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Kepi Travel — Plan, guide, and remember every journey",
  description:
    "Kepi Travel is an intelligent end-to-end travel companion. Plan your trip, navigate airports with Airport Mode, and hold onto memories — calmly, from booking through arrival.",
  openGraph: {
    title: "Kepi Travel — Plan, guide, and remember every journey",
    description:
      "Real-time airport guidance, live flight tracking, and a travel companion that stays with you from departure to memory.",
    url: "/",
    type: "website",
  },
};

export default async function Home() {
  let userId: string | null = null;
  let hasProAccess = false;

  try {
    const session = await auth();
    userId = session.userId ?? null;
    if (userId) {
      try {
        const sub = await getSubscriptionRecord(userId);
        hasProAccess = Boolean(
          sub && (sub.lifetimePlan || (isSubscriptionActive(sub) && sub.plan !== "free")),
        );
      } catch {
        // redis unavailable — show full marketing page
      }
    }
  } catch {
    // clerk unavailable — show static page
  }

  return <HomeLanding userId={userId} hasProAccess={hasProAccess} />;
}
