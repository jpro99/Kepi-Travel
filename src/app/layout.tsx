import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ClerkProvider } from "@clerk/nextjs";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { SplashTransition } from "@/components/native/SplashTransition";
import { DeployRefresh } from "@/components/pwa/DeployRefresh";
import { StandaloneViewportFix } from "@/components/native/StandaloneViewportFix";
import { SupportChat } from "@/components/support/SupportChat";
import { PostHogProvider } from "@/components/analytics/PostHogProvider";
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f9f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1f3a" },
  ],
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
            __html: `(function(){try{var _ktheme=localStorage.getItem('kepi-theme');if(_ktheme==='dark')document.documentElement.classList.add('dark');else document.documentElement.classList.remove('dark');}catch(e){}})();`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var _cap=window.Capacitor;var _native=_cap&&typeof _cap.isNativePlatform==='function'&&_cap.isNativePlatform();var _standalone=window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone;if(!_native&&!_standalone&&!/Capacitor/i.test(navigator.userAgent))return;document.documentElement.classList.add('kepi-standalone');var _vp='width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, viewport-fit=cover';var _meta=document.querySelector('meta[name="viewport"]');if(_meta)_meta.setAttribute('content',_vp);}catch(e){}})();`,
          }}
        />
        <link rel="manifest" href="/manifest.json" />
        {process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ? (
          <meta name="vapid-public-key" content={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY} />
        ) : null}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        {/*
          black-translucent: content paints edge-to-edge behind the status bar
          and Dynamic Island. The StandaloneViewportFix + CSS env() vars below
          handle pushing interactive content below the safe area.
        */}
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Kepi" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        {/*
          Expose safe-area insets as CSS custom properties for use in Tailwind
          and inline styles.  --sat / --sar / --sab / --sal (top/right/bottom/left)
        */}
        <style
          dangerouslySetInnerHTML={{
            __html: `:root{--sat:env(safe-area-inset-top,0px);--sar:env(safe-area-inset-right,0px);--sab:env(safe-area-inset-bottom,0px);--sal:env(safe-area-inset-left,0px)}html,body{overscroll-behavior:none}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <StandaloneViewportFix />
        <DeployRefresh />
        <ClerkProvider>
          <NextIntlClientProvider locale={locale} messages={messages}>
            <BillingProvider>
              <PostHogProvider>
                <SplashTransition>{children}</SplashTransition>
                <SupportChat />
              </PostHogProvider>
              <Analytics />
              <SpeedInsights />
            </BillingProvider>
          </NextIntlClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
