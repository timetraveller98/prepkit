"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/cn";

type Theme = "light" | "dark" | "system";

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
  { value: "dark", label: "Dark", icon: Moon },
];

export const THEME_STORAGE_KEY = "prepkit-theme";

function readStoredTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(theme: Theme): void {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle(
    "dark",
    theme === "dark" || (theme === "system" && prefersDark),
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    setTheme(readStoredTheme());
  }, []);

  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  const choose = useCallback((next: Theme) => {
    setTheme(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      return;
    }
  }, []);

  return (
    <fieldset className="hidden items-center rounded-lg border border-line bg-surface p-0.5 shadow-xs sm:inline-flex">
      <legend className="sr-only">Colour theme</legend>
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const active = theme === option.value;
        return (
          <label
            key={option.value}
            className={cn(
              "rounded-md p-1.5 transition-colors",
              "focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent",
              active ? "bg-sunken text-ink" : "text-ink-faint hover:text-ink",
            )}
          >
            <input
              type="radio"
              name="prepkit-theme"
              className="sr-only"
              value={option.value}
              checked={active}
              onChange={() => choose(option.value)}
            />
            <Icon className="size-3.5" aria-hidden />
            <span className="sr-only">{option.label}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
