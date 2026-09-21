"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function SortableRow({
  id,
  label,
  children,
  className,
}: {
  id: string;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "surface-panel relative flex gap-2 p-3 sm:gap-3 sm:p-4",
        isDragging && "z-10 border-accent shadow-panel",
        className,
      )}
    >
      <button
        type="button"
        className="mt-0.5 h-7 shrink-0 cursor-grab touch-none rounded-md px-1 text-ink-faint transition-colors hover:bg-bg-subtle hover:text-ink active:cursor-grabbing"
        aria-label={`Reorder ${label}. Press space, then use the arrow keys.`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}
