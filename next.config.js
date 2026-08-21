const { withSentryConfig } = require("@sentry/nextjs");
const createBundleAnalyzer = require("@next/bundle-analyzer");
const createNextIntlPlugin = require("next-intl/plugin");

const isCapacitorBuild = process.env.CAPACITOR_BUILD === "true";

// next-pwa does not currently ship typed exports for TS configs.
//
// NOTE: swSrc and dest both resolve to public/sw.js, so `next build` reads
// our hand-authored service worker as the injectManifest source AND writes
// the built (minified, manifest-injected) output back to that same path.
// That's fine for a single build from a fresh checkout (what Vercel does on
// every deploy), but it means a SECOND `npm run build` in the same working
// tree fails with "Can't find self.__WB_MANIFEST in your SW source" — the
// previous build's output is no longer valid source. If you hit that
// locally, run `git checkout -- public/sw.js` to restore the source before
// rebuilding.
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
  "connect-src 'self' ws: wss: https://*.clerk.com https://*.clerk.accounts.dev https://*.ingest.sentry.io https://*.sentry.io https://api.inngest.com https://*.inngest.com https://api.maptiler.com https://*.maptiler.com https://demotiles.maplibre.org https://*.maplibre.org https://tile.openstreetmap.org https://challenges.cloudflare.com",
  "frame-src 'self' https://*.clerk.com https://*.clerk.accounts.dev https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // reactCompiler: Next 15/16-only option (React Compiler integration) — no Next 14
  // equivalent, dropped here pending a real Next upgrade.
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  ...(isCapacitorBuild ? { output: "export" } : {}),
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
    ...(isCapacitorBuild ? { unoptimized: true } : {}),
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },
  serverExternalPackages: ["pdf-parse"],
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

module.exports = withSentryConfig(withBundleAnalyzer(withPWA(withNextIntl(nextConfig))), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
});
