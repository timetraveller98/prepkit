import { createLlmClient, type EnvSource, type LlmClient } from "@prepkit/core";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import type { Env } from "./config/env.ts";
import { errorHandler, notFoundHandler } from "./http/errors.ts";
import type { GenerationQueue } from "./jobs/generation-queue.ts";
import { createAuthRouter } from "./modules/auth/routes.ts";
import { attachUser, createSessionIssuer } from "./modules/auth/session.ts";
import { createKitsRouter } from "./modules/kits/routes.ts";
import { createPracticeRouter } from "./modules/practice/routes.ts";

export interface AppDependencies {
  env: Env;
  queue: GenerationQueue;
  llm?: LlmClient;
}

export function createApp({ env, queue, llm }: AppDependencies): Express {
  const app = express();
  const sessions = createSessionIssuer(env);

  let cachedLlm = llm ?? null;
  const llmFactory = () => {
    if (!cachedLlm) cachedLlm = createLlmClient(process.env as EnvSource);
    return cachedLlm;
  };

  if (env.TRUST_PROXY || env.isProduction) app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || env.corsOrigins.includes(origin)) callback(null, true);
        else callback(new Error(`origin ${origin} is not allowed`));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(attachUser(sessions));

  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: env.API_REQUESTS_PER_MINUTE,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      skip: (request) => request.path.endsWith("/events"),
    }),
  );

  app.get("/health", (_request, response) => {
    response.json({ status: "ok", activeGenerations: queue.activeCount });
  });

  app.use("/api/auth", createAuthRouter(sessions, env.AUTH_ATTEMPTS_PER_WINDOW));
  app.use("/api/kits", createKitsRouter(queue, llmFactory));
  app.use("/api/kits", createPracticeRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
