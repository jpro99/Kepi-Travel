import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Billing",
};

export default function BillingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
