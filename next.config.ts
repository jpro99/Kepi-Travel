// build: invite-email-ui
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import createBundleAnalyzer from "@next/bundle-analyzer";
import createNextIntlPlugin from "next-intl/plugin";
const isCapacitorBuild = process.env.CAPACITOR_BUILD === "true";
// next-pwa does not currently ship typed exports for TS configs.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const withPWA = require("next-pwa")({
  dest: "public",
  disable: process.env.NODE_ENV === "development" || isCapacitorBuild,
  register: true,
  skipWaiting: true,
  swSrc: "public/sw.js",
});

const withBundleAnalyzer = createBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "form-action 'self' https://*.clerk.com https://*.clerk.accounts.dev",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://api.maptiler.com https://*.maptiler.com",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.com https://*.clerk.accounts.dev https://*.sentry-cdn.com https://challenges.cloudflare.com",
  "connect-src 'self' ws: wss: https://*.clerk.com https://*.clerk.accounts.dev https://*.ingest.sentry.io https://*.sentry.io https://api.inngest.com https://*.inngest.com https://api.maptiler.com https://*.maptiler.com https://challenges.cloudflare.com",
  "frame-src 'self' https://*.clerk.com https://*.clerk.accounts.dev https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
].join("; ");

const nextConfig: NextConfig = {
  reactCompiler: false, // disabled — causes TDZ crash with Turbopack in Next 16.2.4
  typescript: {
    ignoreBuildErrors: true,
  },
  ...(isCapacitorBuild ? { output: "export" as const } : {}),
  images: {
    formats: ["image/avif", "image/webp"],
    ...(isCapacitorBuild ? { unoptimized: true } : {}),
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
    clientTraceMetadata: [],
  },
  ...(isCapacitorBuild
    ? {}
    : {
        async headers() {
          return [
            {
              source: "/(.*)",
              headers: [
                {
                  key: "X-Frame-Options",
                  value: "DENY",
                },
                {
                  key: "X-Content-Type-Options",
                  value: "nosniff",
                },
                {
                  key: "Referrer-Policy",
                  value: "strict-origin-when-cross-origin",
                },
                {
                  key: "Permissions-Policy",
                  value: "camera=(), microphone=(), geolocation=(self)",
                },
                {
                  key: "Content-Security-Policy",
                  value: contentSecurityPolicy,
                },
              ],
            },
          ];
        },
      }),
};

export default withSentryConfig(withBundleAnalyzer(withPWA(withNextIntl(nextConfig))), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
});
