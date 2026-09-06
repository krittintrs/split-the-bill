"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatSatang } from "@/lib/billing/money";

/**
 * ADR-0011 v2: a badge showing the bill-wide rounding discount one named peer keeps (everyone
 * else's independently-ceil'd total is untouched), that expands into a picker of candidate
 * peers plus a labeled shuffle option. Renders nothing when leftoverSatang is 0 — the caller
 * already only passes this a nonzero leftover (see BillResult.billLeftover, provably >= 0 per
 * ADR-0011), but the null-render stays here too so the component is safe to call unconditionally.
 *
 * The expanded menu renders through a portal to document.body, positioned via the trigger
 * button's getBoundingClientRect() (fixed coordinates), NOT CSS `absolute`/`top-full`. This
 * component gets reused in places where the trigger sits inside its own `position: sticky`
 * stacking context (e.g. MatrixView's sticky-left name column) — a same-z-index sibling later
 * in DOM order (the next sticky row) paints over an absolutely-positioned menu regardless of
 * its z-index, because sticky creates a new stacking context per cell. Portalling to <body>
 * escapes every ancestor's stacking context, so this is the one implementation for both the
 * table and the card layouts, not a table-only special case.
 */
export default function RoundingLeftoverBadge({
  leftoverSatang,
  candidateIds,
  candidateNames,
  absorberId,
  onChange,
  openDirection = "auto",
}: {
  leftoverSatang: number;
  candidateIds: string[];
  candidateNames: Record<string, string>;
  absorberId: string;
  onChange: (peerId: string) => void;
  /** "auto" (default) flips up/down based on measured viewport space — correct for a
   * normal table row (MatrixView), which always has room below. "up" skips that
   * measurement and always opens upward — for a trigger pinned to a bottom bar
   * (CardsView) whose position shifts as a sheet beneath it expands/collapses,
   * where fits-below can measure true for a beat mid-animation. */
  openDirection?: "auto" | "up";
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Position the portal'd menu under the trigger, clamped so it never runs off the right edge.
  // Runs again on the next frame once the menu itself has a measurable size (0 on first paint).
  // openDirection "auto" (default) prefers opening downward (the common case — plenty of room
  // in a table footer row), flipping to open upward only when the menu doesn't fit below and
  // does fit above. openDirection "up" skips that fit check and always opens upward: CardsView
  // pins this trigger inside a `fixed inset-x-0 bottom-0` bar whose vertical position shifts as
  // the totals sheet beneath it expands/collapses, so a measured "fits below" can be stale for
  // a beat mid-animation — that trigger should never rely on the measurement.
  useLayoutEffect(() => {
    if (!open) return;
    function reposition() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const menuWidth = menuRef.current?.offsetWidth ?? 0;
      const menuHeight = menuRef.current?.offsetHeight ?? 0;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8));
      let openUp: boolean;
      if (openDirection === "up") {
        openUp = true;
      } else {
        const fitsBelow = rect.bottom + menuHeight + 4 <= window.innerHeight;
        const fitsAbove = rect.top - menuHeight - 4 >= 0;
        openUp = !fitsBelow && fitsAbove;
      }
      const top = openUp ? rect.top - menuHeight - 4 : rect.bottom + 4;
      setPos({ top, left });
    }
    reposition();
    const raf = requestAnimationFrame(reposition);
    return () => cancelAnimationFrame(raf);
  }, [open, openDirection]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    // The menu's position is computed once, on open, from the trigger's viewport rect — it does
    // not track the trigger as it moves, so close (rather than try to follow) on scroll/resize.
    function onScrollOrResize() {
      setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  if (leftoverSatang === 0) return null;

  const absorberName = candidateNames[absorberId] ?? "?";
  // billLeftover is provably >= 0 (ADR-0011): the badge always reads as a discount the
  // named peer keeps, never an addition.

  function pick(peerId: string) {
    onChange(peerId);
    setOpen(false);
  }

  function shuffle() {
    const others = candidateIds.filter((id) => id !== absorberId);
    const pool = others.length > 0 ? others : candidateIds;
    pick(pool[Math.floor(Math.random() * pool.length)]);
  }

  return (
    <span className="inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex min-h-8 items-center gap-1 rounded-full border border-warning-ink/30 bg-warning-bg px-2.5 py-1 text-xs font-medium text-warning-ink transition hover:bg-warning-ink/15 active:scale-95"
      >
        {/* #38: whitespace-nowrap so this chip's own text can never wrap internally --
            without it, a table column narrower than the chip (e.g. no FX rate to widen
            the label above it) was free to squeeze this onto 2 lines. */}
        <span className="tabular-nums whitespace-nowrap">
          −{formatSatang(leftoverSatang)} → {absorberName}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
          className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path
            d="M2 4l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 1000 }}
            className="flex max-w-[calc(100vw-16px)] min-w-max flex-wrap items-center gap-1.5 rounded-xl border border-border bg-surface p-2 shadow-lg"
          >
            {candidateIds.map((id) => (
              <button
                key={id}
                type="button"
                role="menuitemradio"
                aria-checked={id === absorberId}
                onClick={() => pick(id)}
                className={`min-h-8 rounded-full px-3 py-1 text-xs font-medium transition active:scale-95 ${
                  id === absorberId
                    ? "bg-primary text-white"
                    : "bg-surface-tint text-primary-ink hover:bg-border"
                }`}
              >
                {candidateNames[id] ?? id}
              </button>
            ))}
            <button
              type="button"
              onClick={shuffle}
              className="inline-flex min-h-8 items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-xs font-medium text-ink-muted transition hover:border-primary hover:text-primary-ink active:scale-95"
            >
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect x="1.5" y="1.5" width="13" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.3" />
                <circle cx="5" cy="5" r="1.1" fill="currentColor" />
                <circle cx="11" cy="5" r="1.1" fill="currentColor" />
                <circle cx="8" cy="8" r="1.1" fill="currentColor" />
                <circle cx="5" cy="11" r="1.1" fill="currentColor" />
                <circle cx="11" cy="11" r="1.1" fill="currentColor" />
              </svg>
              สุ่ม
            </button>
          </div>,
          document.body,
        )}
    </span>
  );
}
