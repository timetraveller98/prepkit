import type { NextAuthConfig } from "next-auth";

export const PUBLIC_ROUTES = new Set(["/login", "/register"]);

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  trustHost: true,
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.userId = user.id as string;
        token.email = user.email as string;
      }
      return token;
    },
    session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId as string;
        session.user.email = (token.email as string) ?? session.user.email;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
