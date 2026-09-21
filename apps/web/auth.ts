import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "./auth.config";
import { apiOrigin } from "./lib/server-env";

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(10).max(200),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const response = await fetch(`${apiOrigin()}/api/auth/verify`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(parsed.data),
        });

        if (!response.ok) return null;

        const payload = (await response.json()) as { user?: { id: string; email: string } };
        if (!payload.user) return null;

        return { id: payload.user.id, email: payload.user.email };
      },
    }),
  ],
});
