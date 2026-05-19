import type { MetadataRoute } from "next";

function resolveSiteUrl(): string {
  const rawBaseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const withProtocol = rawBaseUrl?.startsWith("http") ? rawBaseUrl : rawBaseUrl ? `https://${rawBaseUrl}` : null;
  try {
    return new URL(withProtocol ?? "https://kepi.travel").toString().replace(/\/$/u, "");
  } catch {
    return "https://kepi.travel";
  }
}

export default function robots(): MetadataRoute.Robots {
  const siteUrl = resolveSiteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/privacy", "/terms", "/share/", "/refer/"],
        disallow: ["/admin", "/api", "/travel-assistant"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
