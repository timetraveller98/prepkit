"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Plus, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useSession, useSignOut } from "@/lib/queries";

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const session = useSession();
  const signOut = useSignOut();

  return (
    <div className="flex min-h-full flex-col">
      <header className="no-print sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Link
            href="/kits"
            className="flex items-center gap-2 rounded-md text-sm font-semibold tracking-tight text-ink"
          >
            <span className="grid size-7 place-items-center rounded-lg bg-accent text-accent-fg">
              <Sparkles className="size-3.5" />
            </span>
            PrepKit
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Button asChild size="sm" variant="primary">
              <Link href="/kits/new">
                <Plus className="size-3.5" />
                New kit
              </Link>
            </Button>

            <Menu>
              <MenuTrigger asChild>
                <button
                  type="button"
                  className="grid size-8.5 place-items-center rounded-lg border border-line bg-surface text-[13px] font-medium text-ink-muted transition-colors hover:text-ink"
                  aria-label="Account menu"
                >
                  {(session.data?.email ?? "?").slice(0, 1).toUpperCase()}
                </button>
              </MenuTrigger>
              <MenuContent>
                <div className="px-2.5 py-1.5 text-xs text-ink-faint">
                  {session.data?.email ?? "Signed out"}
                </div>
                <MenuSeparator />
                <MenuItem
                  destructive
                  onSelect={() =>
                    signOut.mutate(undefined, { onSuccess: () => router.replace("/login") })
                  }
                >
                  <LogOut className="size-3.5" />
                  Sign out
                </MenuItem>
              </MenuContent>
            </Menu>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
