import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/sso-callback(.*)",
  "/redeem(.*)",
  "/refer(.*)",
  "/share(.*)",
  "/offline-kit(.*)",
  "/join-family(.*)",
  "/support(.*)",
  "/privacy(.*)",
  "/terms(.*)",
  "/billing(.*)",
  "/create(.*)",
  "/book(.*)",
  "/api/health(.*)",
  "/api/config(.*)",
  "/api/maptiles(.*)",
  "/api/invite(.*)",
  "/api/email-forward/receive(.*)",
  "/api/billing/webhook(.*)",
  "/api/billing/revenuecat/webhook(.*)",
  "/api/auth(.*)",
  "/api/flights/award-search(.*)",
  "/api/flights/search(.*)",
  "/api/family/native-location(.*)",
]);

function clerkEnvReady(): boolean {
  return Boolean(
    process.env.CLERK_SECRET_KEY?.trim() && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim(),
  );
}

function withNoCache(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "private, no-cache, no-store, max-age=0, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  return res;
}

const clerkHandler = clerkMiddleware(async (auth, req) => {
  try {
    if (!isPublicRoute(req)) {
      await auth.protect();
    }
  } catch (error) {
    console.error("[middleware] Clerk auth failed:", error);
    if (!isPublicRoute(req)) {
      const signIn = new URL("/sign-in", req.url);
      signIn.searchParams.set("redirect_url", req.nextUrl.pathname + req.nextUrl.search);
      return NextResponse.redirect(signIn);
    }
  }

  return withNoCache(NextResponse.next());
});

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  if (!clerkEnvReady()) {
    console.error("[middleware] Clerk env missing — allowing request without auth gate");
    return withNoCache(NextResponse.next());
  }

  return clerkHandler(req, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|json|jpe?g|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
  // Vercel Edge + Clerk can throw MIDDLEWARE_INVOCATION_FAILED; Node runtime is more reliable.
  runtime: "nodejs",
};
