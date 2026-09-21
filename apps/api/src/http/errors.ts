import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, "BAD_REQUEST", message, details);
  }
  static unauthorized(message = "sign in to continue") {
    return new ApiError(401, "UNAUTHORIZED", message);
  }
  static forbidden(message = "this kit belongs to someone else") {
    return new ApiError(403, "FORBIDDEN", message);
  }
  static notFound(message = "not found") {
    return new ApiError(404, "NOT_FOUND", message);
  }
  static conflict(code: string, message: string, details?: unknown) {
    return new ApiError(409, code, message, details);
  }
}

export function notFoundHandler(_request: Request, response: Response): void {
  response.status(404).json({ error: { code: "NOT_FOUND", message: "no such endpoint" } });
}

export function errorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  next: NextFunction,
): void {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (error instanceof ApiError) {
    response.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details ?? null },
    });
    return;
  }

  if (error instanceof ZodError) {
    response.status(400).json({
      error: {
        code: "VALIDATION_FAILED",
        message: "the request body did not match what this endpoint expects",
        details: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    });
    return;
  }

  const message = error instanceof Error ? error.message : "unexpected error";
  process.stderr.write(`unhandled error: ${message}\n`);
  response.status(500).json({ error: { code: "INTERNAL_ERROR", message } });
}
