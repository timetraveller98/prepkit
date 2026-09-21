import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("panel overflow-hidden", className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-b border-line px-4 py-3.5 sm:px-5",
        className,
      )}
    >
      <div className="min-w-0 space-y-0.5">
        <h2 className="text-title font-semibold text-ink">{title}</h2>
        {description ? <p className="text-small text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("px-4 py-4 sm:px-5", className)} {...props} />;
}

export function SectionLabel({ className, ...props }: ComponentProps<"h3">) {
  return (
    <h3
      className={cn("text-micro font-medium tracking-[0.06em] text-ink-faint uppercase", className)}
      {...props}
    />
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-line bg-sunken px-3 py-2.5">
      <dt className="text-micro tracking-wide text-ink-faint uppercase">{label}</dt>
      <dd className="numeric mt-1 text-lead font-semibold text-ink">{value}</dd>
      {hint ? <p className="mt-0.5 text-micro text-ink-faint">{hint}</p> : null}
    </div>
  );
}
