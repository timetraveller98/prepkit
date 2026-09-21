import "server-only";

export function apiOrigin(): string {
  return (process.env.API_ORIGIN ?? "http://localhost:4000").replace(/\/$/, "");
}

export function apiTokenSecret(): string {
  const secret = process.env.API_JWT_SECRET ?? process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("API_JWT_SECRET must be set and at least 16 characters");
  }
  return secret;
}

export function sessionTtlDays(): number {
  const parsed = Number.parseInt(process.env.SESSION_TTL_DAYS ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 7;
}
