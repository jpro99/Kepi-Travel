
import NextAuth from "next-auth";
import { clerkBackend } from "@/lib/auth/clerk-backend";

const handler = NextAuth(clerkBackend);

export { handler as GET, handler as POST };
