"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 scroll-thin">
      <TabsPrimitive.List
        className={cn(
          "inline-flex min-w-full gap-1 rounded-lg border border-line bg-sunken p-1",
          className,
        )}
        {...props}
      />
    </div>
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "shrink-0 rounded-md px-3 py-1.5 text-small font-medium whitespace-nowrap text-ink-muted transition-colors",
        "hover:text-ink",
        "data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-xs",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  keepMounted = false,
  ...props
}: ComponentProps<typeof TabsPrimitive.Content> & { keepMounted?: boolean }) {
  return (
    <TabsPrimitive.Content
      // Radix unmounts an inactive panel, which throws away whatever state the
      // panel holds. `keepMounted` keeps it in the tree and hides it with CSS
      // instead, so a half-filled form survives a trip to another tab.
      forceMount={keepMounted || undefined}
      className={cn(
        "fade-in focus-visible:outline-none",
        keepMounted && "data-[state=inactive]:hidden",
        className,
      )}
      {...props}
    />
  );
}
