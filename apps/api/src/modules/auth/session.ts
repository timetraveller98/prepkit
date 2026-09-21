import type { CookieOptions, NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { Env } from "../../config/env.ts";
import { ApiError } from "../../http/errors.ts";

export const SESSION_COOKIE = "prepkit_session";

export interface SessionUser {
  id: string;
  email: string;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: SessionUser;
  }
}

export function createSessionIssuer(env: Env) {
  const maxAgeMs = env.SESSION_TTL_DAYS * 86_400_000;

  const cookieOptions = (): CookieOptions => ({
    httpOnly: true,
    secure: env.isProduction,
    sameSite: env.isProduction ? "none" : "lax",
    maxAge: maxAgeMs,
    path: "/",
  });

  return {
    issue(response: Response, user: SessionUser): void {
      const token = jwt.sign({ email: user.email }, env.JWT_SECRET, {
        subject: user.id,
        expiresIn: `${env.SESSION_TTL_DAYS}d`,
      });
      response.cookie(SESSION_COOKIE, token, cookieOptions());
    },

    clear(response: Response): void {
      response.clearCookie(SESSION_COOKIE, { ...cookieOptions(), maxAge: undefined });
    },

    read(request: Request): SessionUser | null {
      const token = bearerToken(request) ?? request.cookies?.[SESSION_COOKIE];
      if (typeof token !== "string" || token.length === 0) return null;
      try {
        const payload = jwt.verify(token, env.JWT_SECRET);
        if (typeof payload === "string" || !payload.sub) return null;
        return { id: String(payload.sub), email: String(payload.email ?? "") };
      } catch {
        return null;
      }
    },
  };
}

export type SessionIssuer = ReturnType<typeof createSessionIssuer>;

function bearerToken(request: Request): string | null {
  const header = request.headers.authorization;
  if (typeof header !== "string") return null;
  const [scheme, value] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && value ? value : null;
}

export function attachUser(sessions: SessionIssuer) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    const user = sessions.read(request);
    if (user) request.user = user;
    next();
  };
}

export function requireUser(request: Request, _response: Response, next: NextFunction): void {
  if (!request.user) {
    next(ApiError.unauthorized("your session has expired, sign in again"));
    return;
  }
  next();
}

export function currentUser(request: Request): SessionUser {
  if (!request.user) throw ApiError.unauthorized();
  return request.user;
}
