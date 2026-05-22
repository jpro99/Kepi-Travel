import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  type AppLocale,
  detectLocaleFromAcceptLanguage,
  isSupportedLocale,
  normalizeLocale,
} from "@/i18n/locales";
import { isMockClerkAuthEnabled } from "@/lib/auth/mockClerkAuth";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const PUBLIC_PATH_PATTERNS: RegExp[] = [
  /^\/$/,
  /^\/sign-in(?:\/.*)?$/,
  /^\/sign-up(?:\/.*)?$/,
  /^\/refer(?:\/.*)?$/,
];
const PROTECTED_PATH_PATTERNS: RegExp[] = [
  /^\/travel-assistant(?:\/.*)?$/,
  /^\/billing(?:\/.*)?$/,
  /^\/admin(?:\/.*)?$/,
  /^\/api\/travel-updates(?:\/.*)?$/,
  /^\/api\/admin(?:\/.*)?$/,
  /^\/api\/ai(?:\/.*)?$/,
  /^\/api\/trips(?:\/.*)?$/,
  /^\/api\/gmail(?:\/.*)?$/,
  /^\/api\/email-forward\/setup(?:\/.*)?$/,
  /^\/api\/email-handle\/mine(?:\/.*)?$/,
  /^\/api\/debug\/billing(?:\/.*)?$/,
  /^\/api\/debug\/my-plan(?:\/.*)?$/,
  /^\/api\/vault(?:\/.*)?$/,
  /^\/api\/billing\/checkout(?:\/.*)?$/,
  /^\/api\/billing\/portal(?:\/.*)?$/,
  /^\/api\/billing\/status(?:\/.*)?$/,
];

function extractLocalePrefix(pathname: string): AppLocale | null {
  const segment = pathname.split("/")[1] ?? "";
  return isSupportedLocale(segment) ? segment : null;
}

function stripLocalePrefix(pathname: string): string {
  const locale = extractLocalePrefix(pathname);
  if (!locale) {
    return pathname;
  }
  const strippedPath = pathname.replace(new RegExp(`^/${locale}(?=/|$)`), "") || "/";
  return strippedPath.startsWith("/") ? strippedPath : `/${strippedPath}`;
}

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATH_PATTERNS.some((pattern) => pattern.test(pathname));
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PATTERNS.some((pattern) => pattern.test(pathname));
}

export default clerkMiddleware(async (auth, req) => {
  const localeFromPath = extractLocalePrefix(req.nextUrl.pathname);
  const pathnameWithoutLocale = stripLocalePrefix(req.nextUrl.pathname);
  if (isProtectedPath(pathnameWithoutLocale) && !isPublicPath(pathnameWithoutLocale) && !isMockClerkAuthEnabled()) {
    await auth.protect();
  }

  const localeFromCookie = normalizeLocale(req.cookies.get(LOCALE_COOKIE_NAME)?.value);
  const localeFromHeader = detectLocaleFromAcceptLanguage(req.headers.get("accept-language"));
  const resolvedLocale = localeFromPath ?? localeFromCookie ?? localeFromHeader ?? DEFAULT_LOCALE;

  const response =
    localeFromPath !== null
      ? NextResponse.redirect(
          new URL(
            `${pathnameWithoutLocale}${req.nextUrl.search}`,
            req.nextUrl.origin,
          ),
        )
      : NextResponse.next();
  response.headers.set(
    "Cache-Control",
    "private, no-cache, no-store, max-age=0, must-revalidate",
  );
  response.headers.set("Pragma", "no-cache");
  response.cookies.set({
    name: LOCALE_COOKIE_NAME,
    value: resolvedLocale,
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });
  return response;
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
