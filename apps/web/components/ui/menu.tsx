"use client";

import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const Menu = DropdownMenuPrimitive.Root;
export const MenuTrigger = DropdownMenuPrimitive.Trigger;

export function MenuContent({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={6}
        align="end"
        className={cn(
          "z-50 min-w-44 overflow-hidden rounded-lg border border-line bg-raised p-1 shadow-md",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export function MenuItem({
  className,
  destructive = false,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Item> & { destructive?: boolean }) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-small outline-none",
        "data-[highlighted]:bg-sunken",
        destructive ? "text-danger" : "text-ink",
        className,
      )}
      {...props}
    />
  );
}

export function MenuSeparator() {
  return <DropdownMenuPrimitive.Separator className="my-1 h-px bg-line" />;
}
