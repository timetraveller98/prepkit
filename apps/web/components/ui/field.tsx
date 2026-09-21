"use client";

import * as LabelPrimitive from "@radix-ui/react-label";
import type { ComponentProps, ReactNode } from "react";
import { useId } from "react";
import { cn } from "@/lib/cn";

const CONTROL_STYLES =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint transition-colors hover:border-line-strong focus:border-accent focus:outline-none focus-visible:outline-none disabled:opacity-60";

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn("text-[13px] font-medium text-ink", className)}
      {...props}
    />
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(CONTROL_STYLES, "h-9.5", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(CONTROL_STYLES, "resize-y leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select className={cn(CONTROL_STYLES, "h-9.5 pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: (props: { id: string; "aria-describedby": string | undefined; "aria-invalid": boolean }) => ReactNode;
}

export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": Boolean(error) })}
      {hint && !error ? (
        <p id={hintId} className="text-xs text-ink-faint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
