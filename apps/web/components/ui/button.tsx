"use client";

import { Slot } from "@radix-ui/react-slot";
import { Loader2 } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger" | "subtle";
type Size = "sm" | "md" | "lg" | "icon" | "icon-sm";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-fg shadow-xs hover:bg-accent-hover active:translate-y-px disabled:hover:bg-accent",
  secondary:
    "bg-surface text-ink border border-line shadow-xs hover:border-line-strong hover:bg-sunken active:translate-y-px",
  subtle: "bg-sunken text-ink-muted hover:bg-canvas-deep hover:text-ink",
  ghost: "text-ink-muted hover:bg-sunken hover:text-ink",
  outline: "border border-line-strong text-ink hover:bg-sunken active:translate-y-px",
  danger: "bg-danger text-white shadow-xs hover:brightness-110 active:translate-y-px",
};

const SIZES: Record<Size, string> = {
  sm: "h-7.5 gap-1.5 rounded-md px-2.5 text-tiny",
  md: "h-9 gap-2 rounded-lg px-3.5 text-small",
  lg: "h-10.5 gap-2 rounded-lg px-5 text-body",
  icon: "size-9 justify-center rounded-lg",
  "icon-sm": "size-7.5 justify-center rounded-md",
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
    "inline-flex shrink-0 items-center font-medium whitespace-nowrap select-none",
    "transition-[background-color,border-color,color,box-shadow,transform] duration-150",
    "disabled:pointer-events-none disabled:opacity-50",
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
      {loading ? <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}
