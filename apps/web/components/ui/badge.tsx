import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "outline";

const TONES: Record<Tone, string> = {
  neutral: "border-transparent bg-sunken text-ink-muted",
  outline: "border-line bg-transparent text-ink-muted",
  accent: "border-transparent bg-accent-soft text-accent",
  success: "border-transparent bg-success-soft text-success",
  warning: "border-transparent bg-warning-soft text-warning",
  danger: "border-transparent bg-danger-soft text-danger",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-micro font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Dot({ tone = "neutral" }: { tone?: Tone }) {
  const colors: Record<Tone, string> = {
    neutral: "bg-ink-faint",
    outline: "bg-ink-faint",
    accent: "bg-accent",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
  };
  return <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", colors[tone])} />;
}
