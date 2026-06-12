// @ts-nocheck

import { clerkClient } from "@clerk/nextjs/server";
import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

export const clerkBackend: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Clerk",
      credentials: {
        token: { label: "Token", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.token) return null;
        try {
          const client = await clerkClient();
          const session = await client.sessions.verifySession(credentials.token);
          if (session) {
            const user = await client.users.getUser(session.userId);
            return { ...user, id: user.id };
          }
          return null;
        } catch (error) {
          console.error("Clerk authorization error:", error);
          return null;
        }
      },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  jwt: {
    async encode({ token, user }) {
      return JSON.stringify({ ...token, ...user });
    },
    async decode({ token }) {
      if (typeof token === "string") {
        return JSON.parse(token);
      }
      return token;
    },
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
};
