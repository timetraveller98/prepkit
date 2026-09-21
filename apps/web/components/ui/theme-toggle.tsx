"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

type Theme = "light" | "dark" | "system";

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
  { value: "dark", label: "Dark", icon: Moon },
];

export const THEME_STORAGE_KEY = "prepkit-theme";

export function applyTheme(theme: Theme): void {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = theme === "dark" || (theme === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", dark);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    if (stored) setTheme(stored);
  }, []);

  useEffect(() => {
    applyTheme(theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  return (
    <fieldset className="inline-flex items-center rounded-lg border border-line bg-surface p-0.5">
      <legend className="sr-only">Colour theme</legend>
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const active = theme === option.value;
        return (
          <label
            key={option.value}
            className={cn(
              "cursor-pointer rounded-md p-1.5 transition-colors",
              "focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent",
              active ? "bg-bg-subtle text-ink" : "text-ink-faint hover:text-ink",
            )}
          >
            <input
              type="radio"
              name="prepkit-theme"
              className="sr-only"
              value={option.value}
              checked={active}
              onChange={() => setTheme(option.value)}
            />
            <Icon className="size-3.5" aria-hidden />
            <span className="sr-only">{option.label}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
