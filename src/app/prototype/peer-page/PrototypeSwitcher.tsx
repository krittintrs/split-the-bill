// PROTOTYPE — floating variant switcher, not part of any design being judged.
"use client";

import { useEffect } from "react";

interface Props {
  variants: { key: string; name: string }[];
  current: string;
  onChange: (key: string) => void;
}

export default function PrototypeSwitcher({ variants, current, onChange }: Props) {
  const index = Math.max(0, variants.findIndex((v) => v.key === current));
  const previous = variants[(index - 1 + variants.length) % variants.length];
  const next = variants[(index + 1) % variants.length];

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
      )
        return;
      if (event.key === "ArrowLeft") onChange(previous.key);
      if (event.key === "ArrowRight") onChange(next.key);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previous.key, next.key, onChange]);

  if (process.env.NODE_ENV === "production") return null;

  return (
    <div className="fixed bottom-3 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black px-2 py-1 text-sm text-white shadow-lg dark:bg-white dark:text-black">
      <button
        type="button"
        onClick={() => onChange(previous.key)}
        className="px-2 py-1 text-lg leading-none"
        aria-label="Previous variant"
      >
        ←
      </button>
      <span className="min-w-36 text-center font-medium">
        {variants[index].key} — {variants[index].name}
      </span>
      <button
        type="button"
        onClick={() => onChange(next.key)}
        className="px-2 py-1 text-lg leading-none"
        aria-label="Next variant"
      >
        →
      </button>
    </div>
  );
}
