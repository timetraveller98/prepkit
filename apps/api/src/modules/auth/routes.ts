import bcrypt from "bcryptjs";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { UserModel } from "../../db/models/user.ts";
import { ApiError } from "../../http/errors.ts";
import { parseBody } from "../../http/validate.ts";
import { currentUser, requireUser, type SessionIssuer } from "./session.ts";

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email("that does not look like an email address"),
  password: z
    .string()
    .min(10, "use at least 10 characters")
    .max(200, "that password is longer than we store"),
});

const PASSWORD_ROUNDS = 12;

export function createAuthRouter(sessions: SessionIssuer, attemptsPerWindow: number): Router {
  const router = Router();

  const attemptLimiter = rateLimit({
    windowMs: 10 * 60_000,
    limit: attemptsPerWindow,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
      error: { code: "TOO_MANY_ATTEMPTS", message: "too many attempts, try again later" },
    },
  });

  router.post("/register", attemptLimiter, async (request, response) => {
    const { email, password } = parseBody(credentialsSchema, request);

    const existing = await UserModel.findOne({ email }).lean();
    if (existing)
      throw ApiError.conflict("EMAIL_TAKEN", "an account with that email already exists");

    const user = await UserModel.create({
      email,
      passwordHash: await bcrypt.hash(password, PASSWORD_ROUNDS),
    });

    const session = { id: user._id.toString(), email: user.email };
    sessions.issue(response, session);
    response.status(201).json({ user: session });
  });

  router.post("/login", attemptLimiter, async (request, response) => {
    const { email, password } = parseBody(credentialsSchema, request);

    const user = await UserModel.findOne({ email });
    const matches = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !matches) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "that email and password do not match");
    }

    const session = { id: user._id.toString(), email: user.email };
    sessions.issue(response, session);
    response.json({ user: session });
  });

  router.post("/verify", attemptLimiter, async (request, response) => {
    const { email, password } = parseBody(credentialsSchema, request);

    const user = await UserModel.findOne({ email });
    const matches = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !matches) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "that email and password do not match");
    }

    response.json({ user: { id: user._id.toString(), email: user.email } });
  });

  router.post("/logout", (_request, response) => {
    sessions.clear(response);
    response.status(204).end();
  });

  router.get("/me", requireUser, (request, response) => {
    response.json({ user: currentUser(request) });
  });

  return router;
}
