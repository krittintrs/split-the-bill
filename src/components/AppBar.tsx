"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOut } from "@/app/auth/actions";
import { kebabItemCls } from "@/components/KebabMenu";

/**
 * Organizer top bar (#10 nav): wordmark links back to the bill list; the account
 * menu holds Profile + Sign out. Mounted only on authenticated pages — peer link
 * pages (/b/[id]) stay chrome-free (no login). Same bar on desktop and mobile.
 */
export default function AppBar({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const initial = (email.trim()[0] ?? "?").toUpperCase();

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
    <header className="sticky top-0 z-40 border-b border-border bg-surface">
      <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between px-4">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded-lg py-1 font-bold text-ink transition active:scale-95 focus-visible:outline-2 focus-visible:outline-primary-ink"
        >
          <span
            aria-hidden
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white"
          >
            ฿
          </span>
          Split the Bill
        </Link>

        <div ref={rootRef} className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label="เมนูบัญชี"
            onClick={() => setOpen((o) => !o)}
            className="flex min-h-11 items-center gap-2 rounded-xl py-1 pl-1 pr-2 text-sm text-ink-muted transition hover:bg-surface-tint active:scale-95 focus-visible:outline-2 focus-visible:outline-primary-ink"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-tint text-sm font-bold text-primary-ink">
              {initial}
            </span>
            <span className="hidden max-w-40 truncate sm:inline">{email}</span>
            <span aria-hidden className="text-xs">
              ▾
            </span>
          </button>

          {open && (
            <div
              role="menu"
              className="absolute right-0 top-full z-40 mt-1 min-w-44 rounded-xl border border-border bg-surface p-1 shadow-lg"
            >
              <Link
                href="/profile"
                role="menuitem"
                onClick={() => setOpen(false)}
                className={kebabItemCls}
              >
                <span aria-hidden className="mr-2">
                  👤
                </span>
                โปรไฟล์
              </Link>
              <form action={signOut}>
                <button type="submit" role="menuitem" className={`${kebabItemCls} text-ink-muted`}>
                  <span aria-hidden className="mr-2">
                    ⎋
                  </span>
                  ออกจากระบบ
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
