import { z } from "zod";

const booleanish = z
  .enum(["true", "false", ""])
  .optional()
  .transform((value) => value === "true");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  GENERATION_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  AUTH_ATTEMPTS_PER_WINDOW: z.coerce.number().int().min(1).default(20),
  API_REQUESTS_PER_MINUTE: z.coerce.number().int().min(1).default(300),
  TRUST_PROXY: booleanish,
});

export type Env = z.infer<typeof envSchema> & {
  isProduction: boolean;
  corsOrigins: string[];
};

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`invalid environment configuration:\n${problems}`);
  }

  return {
    ...parsed.data,
    isProduction: parsed.data.NODE_ENV === "production",
    corsOrigins: parsed.data.CORS_ORIGIN.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
}
