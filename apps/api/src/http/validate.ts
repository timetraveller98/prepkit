import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny, z } from "zod";
import { ApiError } from "./errors.ts";

export function parseBody<TSchema extends ZodTypeAny>(
  schema: TSchema,
  request: Request,
): z.infer<TSchema> {
  const result = schema.safeParse(request.body);
  if (!result.success) {
    throw ApiError.badRequest(
      "the request body did not match what this endpoint expects",
      result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }
  return result.data;
}

export function requireParam(request: Request, name: string): string {
  const value = request.params[name];
  if (typeof value !== "string" || value.length === 0) {
    throw ApiError.badRequest(`missing ${name} in the path`);
  }
  return value;
}

export type RouteHandler = (
  request: Request,
  response: Response,
  next: NextFunction,
) => Promise<void> | void;
