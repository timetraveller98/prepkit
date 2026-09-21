import { SignJWT } from "jose";
import { auth } from "@/auth";
import { apiOrigin, apiTokenSecret } from "@/lib/server-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC_ENDPOINTS = new Set(["auth/register"]);
const SERVICE_TOKEN_TTL = "5m";
const FORWARDED_RESPONSE_HEADERS = ["content-type", "cache-control", "retry-after"];

async function forward(request: Request, context: RouteContext<"/backend/[...path]">) {
  const { path } = await context.params;
  const pathname = path.join("/");

  const headers = new Headers({ accept: request.headers.get("accept") ?? "application/json" });
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  if (!PUBLIC_ENDPOINTS.has(pathname)) {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return Response.json(
        { error: { code: "UNAUTHORIZED", message: "sign in to continue" } },
        { status: 401 },
      );
    }
    headers.set("authorization", `Bearer ${await serviceToken(userId, session.user.email ?? "")}`);
  }

  const target = new URL(`/api/${pathname}${new URL(request.url).search}`, apiOrigin());
  const hasBody = request.method !== "GET" && request.method !== "HEAD";

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: "manual",
    });
  } catch {
    return Response.json(
      { error: { code: "API_UNREACHABLE", message: "the api service is not responding" } },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  responseHeaders.set("x-accel-buffering", "no");

  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

async function serviceToken(userId: string, email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(SERVICE_TOKEN_TTL)
    .sign(new TextEncoder().encode(apiTokenSecret()));
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
