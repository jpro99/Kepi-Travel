import type { Metadata } from "next";
import { OfflineTravelKitPageClient } from "@/components/travelAssistant/OfflineTravelKitPageClient";

export const metadata: Metadata = {
  title: "Offline Travel Kit | Kepi Travel",
  description: "Your saved trip itinerary, hotel contacts, and directions — available without Wi‑Fi.",
};

export default function OfflineKitPage() {
  return <OfflineTravelKitPageClient />;
}
