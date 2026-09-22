import "server-only";

const LOCAL_API_ORIGIN = "http://localhost:4000";

export function apiOrigin(): string {
  const configured = process.env.API_ORIGIN?.trim();

  if (!configured) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "API_ORIGIN is not set. The web app has nothing to forward /backend/* to. " +
          "Set it to the API service's base URL, for example https://prepkit-api.onrender.com",
      );
    }
    return LOCAL_API_ORIGIN;
  }

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error(`API_ORIGIN is not a valid URL: ${configured}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`API_ORIGIN must be http or https, received ${parsed.protocol}`);
  }

  return parsed.origin;
}

export function apiTokenSecret(): string {
  const secret = process.env.API_JWT_SECRET ?? process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "API_JWT_SECRET must be set and at least 16 characters, and must match the API's JWT_SECRET",
    );
  }
  return secret;
}

export function sessionTtlDays(): number {
  const parsed = Number.parseInt(process.env.SESSION_TTL_DAYS ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 7;
}
