import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ClerkProvider } from "@clerk/nextjs";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { SplashTransition } from "@/components/native/SplashTransition";
import { SupportChat } from "@/components/support/SupportChat";
import { BillingProvider } from "@/lib/billing/BillingContext";
import { verifyEnvFromExampleAtBoot } from "../../scripts/verify-env";
import "./globals.css";

verifyEnvFromExampleAtBoot();

function resolveSiteUrl(): URL {
  const rawBaseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const withProtocol = rawBaseUrl?.startsWith("http") ? rawBaseUrl : rawBaseUrl ? `https://${rawBaseUrl}` : null;
  try {
    return new URL(withProtocol ?? "https://kepi.travel");
  } catch {
    return new URL("https://kepi.travel");
  }
}

const siteUrl = resolveSiteUrl();

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: "Kepi Travel Assistant",
    template: "%s | Kepi Travel Assistant",
  },
  description:
    "Never miss a flight. Never lose a reservation. Kepi is your adaptive travel assistant from packing to landing.",
  applicationName: "Kepi Travel Assistant",
  keywords: [
    "travel assistant",
    "itinerary app",
    "flight tracking",
    "trip planning",
    "travel automation",
    "concierge travel app",
  ],
  authors: [{ name: "Kepi" }],
  creator: "Kepi",
  publisher: "Kepi",
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    title: "Kepi Travel Assistant",
    description:
      "Never miss a flight. Never lose a reservation. Adaptive trip execution from packing to landing.",
    url: "/",
    siteName: "Kepi Travel Assistant",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Kepi Travel Assistant — adaptive trip execution",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Kepi Travel Assistant",
    description:
      "Never miss a flight. Never lose a reservation. Adaptive trip execution from packing to landing.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "192x192", type: "image/png" }],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#1a1a2e" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Kepi" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body className="min-h-full flex flex-col">
        <ClerkProvider>
          <NextIntlClientProvider locale={locale} messages={messages}>
            <BillingProvider>
              <SplashTransition>{children}</SplashTransition>
              <SupportChat />
              <Analytics />
              <SpeedInsights />
            </BillingProvider>
          </NextIntlClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
