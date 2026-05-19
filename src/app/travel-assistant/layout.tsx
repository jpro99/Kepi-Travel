import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Trips",
};

export default function TravelAssistantLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
