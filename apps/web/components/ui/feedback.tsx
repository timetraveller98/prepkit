import { Loader2 } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Spinner({ className, ...props }: ComponentProps<"svg">) {
  return <Loader2 className={cn("size-4 animate-spin", className)} aria-hidden {...props} />;
}

export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("animate-pulse rounded-lg bg-sunken", className)} aria-hidden {...props} />
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-16 text-center", className)}>
      {icon ? (
        <div className="mb-4 grid size-11 place-items-center rounded-xl border border-line bg-sunken text-ink-faint">
          {icon}
        </div>
      ) : null}
      <p className="text-lead font-semibold text-ink">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-small leading-relaxed text-ink-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-danger/35 bg-danger-soft/60 px-4 py-3.5 text-small"
    >
      <p className="font-semibold text-danger">{title}</p>
      <p className="mt-1 leading-relaxed text-ink-muted">{message}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function ProgressBar({
  value,
  label,
  tone = "accent",
  className,
}: {
  value: number;
  label: string;
  tone?: "accent" | "success" | "warning" | "danger";
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const fills = {
    accent: "bg-accent",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
  } as const;

  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-sunken", className)}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500 ease-out", fills[tone])}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
