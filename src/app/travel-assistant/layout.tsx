import type { Metadata } from "next";
import { TravelAssistantChrome } from "@/components/travelAssistant/TravelAssistantChrome";

export const metadata: Metadata = {
  title: "My Trips",
};

export default function TravelAssistantLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <TravelAssistantChrome>{children}</TravelAssistantChrome>;
}
