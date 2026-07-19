"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * ⋯ overflow menu for row/header actions (issue #15). Items render via the
 * children function; each item should call the provided close() when activated.
 */
export default function KebabMenu({
  label,
  children,
}: {
  label: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 w-11 items-center justify-center rounded-xl text-lg font-bold text-ink-muted transition hover:bg-surface-tint active:scale-95 focus-visible:outline-2 focus-visible:outline-primary-ink"
      >
        ⋯
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 min-w-40 rounded-xl border border-border bg-surface p-1 shadow-lg"
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/** Shared class for menu entries rendered inside KebabMenu. */
export const kebabItemCls =
  "flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm transition hover:bg-surface-tint active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";
