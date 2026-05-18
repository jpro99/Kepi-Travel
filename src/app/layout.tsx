import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { verifyEnvFromExampleAtBoot } from "../../scripts/verify-env";
import "./globals.css";

verifyEnvFromExampleAtBoot();

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Kepi Search",
  description:
    "Personal hotel map explorer (Hyatt, Marriott, Hilton) with city catalogs",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#1a1a2e" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Kepi" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="min-h-full flex flex-col">
        <ClerkProvider>
          <NextIntlClientProvider locale={locale} messages={messages}>
            {children}
            <Analytics />
            <SpeedInsights />
          </NextIntlClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
