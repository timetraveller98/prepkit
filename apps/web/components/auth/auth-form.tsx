"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Sparkles } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { ErrorState } from "@/components/ui/feedback";
import { ApiRequestError } from "@/lib/api";
import { useSignIn } from "@/lib/queries";

const COPY = {
  login: {
    heading: "Sign in",
    subheading: "Your kits are private to your account.",
    submit: "Sign in",
    switchPrompt: "No account yet?",
    switchLabel: "Create one",
    switchHref: "/register",
  },
  register: {
    heading: "Create an account",
    subheading: "One account, every role you are preparing for.",
    submit: "Create account",
    switchPrompt: "Already registered?",
    switchLabel: "Sign in",
    switchHref: "/login",
  },
} as const;

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const copy = COPY[mode];
  const router = useRouter();
  const searchParams = useSearchParams();
  const signIn = useSignIn(mode);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  const submit = (event: FormEvent) => {
    event.preventDefault();

    const errors: { email?: string; password?: string } = {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.email = "Enter a valid email address.";
    if (password.length < 10) errors.password = "Use at least 10 characters.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    signIn.mutate(
      { email, password },
      {
        onSuccess: () => {
          const next = searchParams.get("next");
          router.replace(next && next.startsWith("/") ? next : "/kits");
        },
      },
    );
  };

  const failure = signIn.error;

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col justify-center px-4 py-16">
      <div className="mb-8 flex items-center gap-2 text-sm font-semibold tracking-tight text-ink">
        <span className="grid size-7 place-items-center rounded-lg bg-accent text-accent-fg">
          <Sparkles className="size-3.5" />
        </span>
        PrepKit
      </div>

      <h1 className="text-xl font-semibold tracking-tight text-ink">{copy.heading}</h1>
      <p className="mt-1 text-[13px] text-ink-muted">{copy.subheading}</p>

      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        {failure ? (
          <ErrorState
            title="That did not work"
            message={
              failure instanceof ApiRequestError
                ? failure.message
                : "Something went wrong, try again."
            }
          />
        ) : null}

        <Field label="Email" error={fieldErrors.email}>
          {(props) => (
            <Input
              {...props}
              type="email"
              name="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          )}
        </Field>

        <Field
          label="Password"
          hint={mode === "register" ? "At least 10 characters." : undefined}
          error={fieldErrors.password}
        >
          {(props) => (
            <Input
              {...props}
              type="password"
              name="password"
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </Field>

        <Button type="submit" variant="primary" size="lg" className="w-full justify-center" loading={signIn.isPending}>
          {copy.submit}
        </Button>
      </form>

      <p className="mt-6 text-[13px] text-ink-muted">
        {copy.switchPrompt}{" "}
        <Link href={copy.switchHref} className="font-medium text-accent hover:underline">
          {copy.switchLabel}
        </Link>
      </p>
    </div>
  );
}
