import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, detectLocaleFromAcceptLanguage, normalizeLocale } from "@/i18n/locales";
import { getUserLocalePreference } from "@/lib/i18n/localeStore";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { logger } from "@/lib/logger";

async function resolveRequestLocale(): Promise<"en" | "es"> {
  try {
    const userId = await resolveAuthenticatedUserId();
    if (userId) {
      const userLocale = await getUserLocalePreference(userId);
      if (userLocale) {
        return userLocale;
      }
    }
  } catch (error) {
    logger.withContext({ scope: "i18n/request" }).warn("Falling back from KV locale lookup.", { error });
  }

  const cookieStore = await cookies();
  const cookieLocale = normalizeLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  if (cookieLocale) {
    return cookieLocale;
  }

  const headerStore = await headers();
  const headerLocale = detectLocaleFromAcceptLanguage(headerStore.get("accept-language"));
  return headerLocale ?? DEFAULT_LOCALE;
}

export default getRequestConfig(async () => {
  const locale = await resolveRequestLocale();
  let messages: Record<string, unknown> = {};
  try {
    messages = (await import(`../../messages/${locale}.json`)).default as Record<string, unknown>;
  } catch {
    // Locale file not found — fall back to English
    try {
      messages = (await import("../../messages/en.json")).default as Record<string, unknown>;
    } catch {
      messages = {};
    }
  }
  return { locale, messages };
});
