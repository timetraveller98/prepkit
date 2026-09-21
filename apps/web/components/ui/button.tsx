"use client";

import { Slot } from "@radix-ui/react-slot";
import { Loader2 } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-fg hover:bg-accent-hover shadow-sm disabled:hover:bg-accent",
  secondary:
    "bg-surface-raised text-ink border border-line hover:border-line-strong hover:bg-bg-subtle",
  ghost: "text-ink-muted hover:text-ink hover:bg-bg-subtle",
  outline: "border border-line-strong text-ink hover:bg-bg-subtle",
  danger: "bg-danger text-white hover:opacity-90",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-9.5 px-4 text-sm gap-2 rounded-lg",
  lg: "h-11 px-5 text-[15px] gap-2 rounded-xl",
  icon: "size-8.5 rounded-lg justify-center",
};

export interface ButtonProps extends ComponentProps<"button"> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  asChild?: boolean;
}

export function Button({
  className,
  variant = "secondary",
  size = "md",
  loading = false,
  asChild = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(
    "inline-flex items-center font-medium transition-colors select-none",
    "disabled:cursor-not-allowed disabled:opacity-55",
    VARIANTS[variant],
    SIZES[size],
    className,
  );

  if (asChild) {
    return (
      <Slot className={classes} {...props}>
        {children}
      </Slot>
    );
  }

  return (
    <button
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}
