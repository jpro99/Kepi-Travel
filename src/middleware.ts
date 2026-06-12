import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/sso-callback(.*)",
  "/redeem(.*)",
  "/refer(.*)",
  "/share(.*)",
  "/join-family(.*)",
  "/privacy(.*)",
  "/terms(.*)",
  "/billing(.*)",
  "/create(.*)",
  "/book(.*)",
  "/api/health(.*)",
  "/api/config(.*)",
  "/api/invite(.*)",
  "/api/email-forward/receive(.*)",
  "/api/billing/webhook(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }

  const res = NextResponse.next();
  res.headers.set("Cache-Control", "private, no-cache, no-store, max-age=0, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  return res;
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
