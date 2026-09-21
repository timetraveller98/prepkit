"use client";

import { Check } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

const SAVE_DELAY_MS = 700;
const SAVED_BADGE_MS = 1600;

export interface InlineEditableProps {
  value: string;
  onSave: (value: string) => void;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
  monospace?: boolean;
}

export function InlineEditable({
  value,
  onSave,
  label,
  placeholder,
  multiline = false,
  className,
  monospace = false,
}: InlineEditableProps) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fieldId = useId();

  useEffect(() => {
    if (!focused) setDraft(value);
  }, [value, focused]);

  useLayoutEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [draft]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  const commit = (next: string) => {
    if (next === value) return;
    onSave(next);
    setJustSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setJustSaved(false), SAVED_BADGE_MS);
  };

  const scheduleSave = (next: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(next.trim()), SAVE_DELAY_MS);
  };

  const shared = {
    id: fieldId,
    "aria-label": label,
    placeholder,
    value: draft,
    onFocus: () => setFocused(true),
    onBlur: () => {
      setFocused(false);
      if (timer.current) clearTimeout(timer.current);
      commit(draft.trim());
    },
    className: cn(
      "w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-ink transition-colors",
      "hover:border-line focus:border-accent focus:bg-surface focus:outline-none",
      "placeholder:text-ink-faint",
      monospace && "font-mono text-[13px]",
      className,
    ),
  };

  return (
    <div className="relative">
      {multiline ? (
        <textarea
          {...shared}
          ref={textareaRef}
          rows={1}
          className={cn(shared.className, "resize-none overflow-hidden leading-relaxed")}
          onChange={(event) => {
            setDraft(event.target.value);
            scheduleSave(event.target.value);
          }}
        />
      ) : (
        <input
          {...shared}
          onChange={(event) => {
            setDraft(event.target.value);
            scheduleSave(event.target.value);
          }}
        />
      )}
      <span
        aria-live="polite"
        className={cn(
          "pointer-events-none absolute -top-1 right-1 flex items-center gap-1 text-[11px] text-success transition-opacity",
          justSaved ? "opacity-100" : "opacity-0",
        )}
      >
        <Check className="size-3" />
        Saved
      </span>
    </div>
  );
}
