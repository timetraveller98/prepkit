import { Loader2 } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Spinner({ className, ...props }: ComponentProps<"svg">) {
  return <Loader2 className={cn("size-4 animate-spin", className)} aria-hidden {...props} />;
}

export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-bg-subtle", className)}
      aria-hidden
      {...props}
    />
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
    <div className={cn("flex flex-col items-center px-6 py-14 text-center", className)}>
      {icon ? <div className="mb-3 text-ink-faint">{icon}</div> : null}
      <p className="text-sm font-medium text-ink">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-ink-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
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
      className="rounded-xl border border-danger/40 bg-danger-soft/60 px-4 py-3.5 text-[13px]"
    >
      <p className="font-medium text-danger">{title}</p>
      <p className="mt-1 leading-relaxed text-ink-muted">{message}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function ProgressBar({
  value,
  label,
  className,
}: {
  value: number;
  label: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-bg-subtle", className)}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
