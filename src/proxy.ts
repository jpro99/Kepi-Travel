import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isMockClerkAuthEnabled } from "@/lib/auth/mockClerkAuth";

const isProtectedRoute = createRouteMatcher([
  "/travel-assistant(.*)",
  "/admin(.*)",
  "/api/travel-updates(.*)",
  "/api/admin(.*)",
  "/api/ai(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req) && !isMockClerkAuthEnabled()) {
    await auth.protect();
  }

  const response = NextResponse.next();
  response.headers.set(
    "Cache-Control",
    "private, no-cache, no-store, max-age=0, must-revalidate",
  );
  response.headers.set("Pragma", "no-cache");
  return response;
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
