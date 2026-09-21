"use client";

import { useMutation } from "@tanstack/react-query";
import { apiFetch, jsonBody } from "../api";
import type { SessionUser } from "../types";

export function useRegister() {
  return useMutation({
    mutationFn: (credentials: { email: string; password: string }) =>
      apiFetch<{ user: SessionUser }>("/auth/register", {
        method: "POST",
        ...jsonBody(credentials),
      }),
  });
}
