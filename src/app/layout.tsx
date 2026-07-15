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
    return new URL(withProtocol ?? "https://kepitravel.com");
  } catch {
    return new URL("https://kepitravel.com");
  }
}

const siteUrl = resolveSiteUrl();

// Force dynamic — layout reads headers for locale detection
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: "Kepi Travel",
    template: "%s | Kepi Travel",
  },
  description:
    "Never miss a flight. Never lose a reservation. Kepi is your adaptive travel assistant from packing to landing.",
  applicationName: "Kepi Travel",
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
    title: "Kepi Travel",
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
    title: "Kepi Travel",
    creator: "@kepitravel",
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
  let locale = "en";
  let messages = {};
  try {
    locale = await getLocale();
    messages = await getMessages();
  } catch {
    // Use defaults if i18n fails — non-fatal
  }

  return (
    <html
      lang={locale}
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Inline script — runs before React hydration to prevent theme flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var _ktheme=localStorage.getItem('kepi-theme');var _kdark=_ktheme==='dark'||(_ktheme===null&&window.matchMedia('(prefers-color-scheme:dark)').matches);if(_kdark)document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
        <link rel="manifest" href="/manifest.json" />
        {process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ? (
          <meta name="vapid-public-key" content={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY} />
        ) : null}

        {/* ── Standard web ── */}
        <meta name="theme-color" content="#0b1f3a" />

        {/* ── Apple PWA / Capacitor iOS ── */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        {/*
          "black-translucent" lets the content extend edge-to-edge under the
          notch/Dynamic Island; we then use env(safe-area-inset-*) in CSS to
          pad content back into the safe zone.
        */}
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Kepi" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

        {/*
          Expand the viewport to fill behind the notch / Dynamic Island.
          viewport-fit=cover is the key flag — it allows env(safe-area-inset-*)
          to work and lets us paint behind the status bar.
        */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1"
        />

        {/*
          Expose safe-area insets as CSS custom properties so any component can
          consume them without knowing the exact env() syntax.
          --sat / --sar / --sab / --sal  (top/right/bottom/left)
        */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
:root {
  --sat: env(safe-area-inset-top, 0px);
  --sar: env(safe-area-inset-right, 0px);
  --sab: env(safe-area-inset-bottom, 0px);
  --sal: env(safe-area-inset-left, 0px);
}
/* Capacitor WKWebView: prevent scroll bounce and rubber-banding */
html, body { overscroll-behavior: none; }
/* Full viewport height that accounts for the browser chrome on iOS Safari */
.h-dvh { height: 100dvh; }
`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
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
