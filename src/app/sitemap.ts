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

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = resolveSiteUrl();
  const now = new Date();
  return [
    {
      url: `${siteUrl}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${siteUrl}/privacy`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${siteUrl}/terms`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.4,
    },
  ];
}
