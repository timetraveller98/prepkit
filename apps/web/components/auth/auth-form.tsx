"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/feedback";
import { Field, Input, PasswordInput } from "@/components/ui/field";
import { ApiRequestError } from "@/lib/api";
import { useRegister } from "@/lib/queries";

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

interface FieldErrors {
  email?: string;
  password?: string;
  confirmPassword?: string;
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const copy = COPY[mode];
  const router = useRouter();
  const searchParams = useSearchParams();
  const register = useRegister();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    const errors: FieldErrors = {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.email = "Enter a valid email address.";
    if (password.length < 10) errors.password = "Use at least 10 characters.";
    if (mode === "register" && confirmPassword !== password) {
      errors.confirmPassword = "Both passwords must match.";
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setFailure(null);
    setPending(true);

    try {
      if (mode === "register") {
        await register.mutateAsync({ email, password });
      }

      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) {
        setFailure("That email and password do not match.");
        return;
      }

      const next = searchParams.get("next");
      router.replace(next?.startsWith("/") ? next : "/kits");
      router.refresh();
    } catch (error) {
      setFailure(
        error instanceof ApiRequestError ? error.message : "Something went wrong, try again.",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div
        aria-hidden
        className="grid-backdrop pointer-events-none absolute inset-0 opacity-[0.55] [mask-image:radial-gradient(ellipse_at_center,black,transparent_72%)]"
      />

      <div className="relative w-full max-w-[25rem] rise-in">
        <div className="mb-7 flex items-center gap-2 text-body font-semibold tracking-tight text-ink">
          <span className="grid size-8 place-items-center rounded-xl bg-accent text-accent-fg shadow-sm">
            <Sparkles className="size-4" />
          </span>
          PrepKit
        </div>

        <div className="panel p-6 sm:p-7">
          <h1 className="text-title font-semibold text-ink">{copy.heading}</h1>
          <p className="mt-1 text-small text-ink-muted">{copy.subheading}</p>

          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            {failure ? <ErrorState title="That did not work" message={failure} /> : null}

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
                <PasswordInput
                  {...props}
                  name="password"
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              )}
            </Field>

            {mode === "register" ? (
              <Field label="Re-enter password" error={fieldErrors.confirmPassword}>
                {(props) => (
                  <PasswordInput
                    {...props}
                    name="confirmPassword"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                )}
              </Field>
            ) : null}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full justify-center"
              loading={pending}
            >
              {copy.submit}
            </Button>
          </form>
        </div>

        <p className="mt-5 text-center text-small text-ink-muted">
          {copy.switchPrompt}{" "}
          <Link href={copy.switchHref} className="font-medium text-accent hover:underline">
            {copy.switchLabel}
          </Link>
        </p>
      </div>
    </div>
  );
}
