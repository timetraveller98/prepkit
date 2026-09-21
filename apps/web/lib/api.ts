export const API_BASE_PATH = "/backend";

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get isAuthFailure(): boolean {
    return this.status === 401;
  }
}

export async function apiFetch<TResult>(path: string, init: RequestInit = {}): Promise<TResult> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_PATH}${path}`, {
      credentials: "include",
      headers: init.body ? { "content-type": "application/json", ...init.headers } : init.headers,
      ...init,
    });
  } catch {
    throw new ApiRequestError(0, "NETWORK", "could not reach the server, check your connection");
  }

  if (response.status === 204) return undefined as TResult;

  const text = await response.text();
  const payload = text ? safeParse(text) : null;

  if (!response.ok) {
    const error = (
      payload as { error?: { code?: string; message?: string; details?: unknown } } | null
    )?.error;
    throw new ApiRequestError(
      response.status,
      error?.code ?? "REQUEST_FAILED",
      error?.message ?? `request failed with status ${response.status}`,
      error?.details,
    );
  }

  return payload as TResult;
}

export function jsonBody(value: unknown): RequestInit {
  return { body: JSON.stringify(value) };
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
