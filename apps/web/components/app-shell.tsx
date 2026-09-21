"use client";

import { LogOut, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export function AppShell({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const email = session?.user?.email ?? "";

  return (
    <div className="flex min-h-full flex-col">
      <header className="no-print sticky top-0 z-40 border-b border-line bg-[var(--header-bg)] backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-[84rem] items-center gap-3 px-4 sm:px-6">
          <Link
            href="/kits"
            className="flex items-center gap-2 rounded-md text-body font-semibold tracking-tight text-ink"
          >
            <span className="grid size-7 place-items-center rounded-lg bg-accent text-accent-fg shadow-xs">
              <Sparkles className="size-3.5" />
            </span>
            <span className="hidden sm:inline">PrepKit</span>
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />

            <Button asChild size="md" variant="primary">
              <Link href="/kits/new">
                <Plus className="size-3.5" />
                <span className="hidden sm:inline">New kit</span>
                <span className="sm:hidden">New</span>
              </Link>
            </Button>

            <Menu>
              <MenuTrigger asChild>
                <button
                  type="button"
                  className="grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-surface text-small font-semibold text-ink-muted shadow-xs transition-colors hover:border-line-strong hover:text-ink"
                  aria-label="Account menu"
                >
                  {(email || "?").slice(0, 1).toUpperCase()}
                </button>
              </MenuTrigger>
              <MenuContent>
                <div className="truncate px-2.5 py-1.5 text-tiny text-ink-faint">
                  {email || "Signed out"}
                </div>
                <MenuSeparator />
                <MenuItem destructive onSelect={() => void signOut({ redirectTo: "/login" })}>
                  <LogOut className="size-3.5" />
                  Sign out
                </MenuItem>
              </MenuContent>
            </Menu>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-[84rem] flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        {eyebrow}
        <h1 className="text-heading font-semibold text-ink">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-small text-ink-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
