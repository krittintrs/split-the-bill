"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * Measures a DOM node's rendered width and keeps it in sync via ResizeObserver.
 *
 * #38: pinning a second `position: sticky` table column right after one whose width
 * varies with its content (an item-name / row-label column) needs a concrete `left`
 * offset -- CSS sticky can't say "stick right after the previous sticky column," and a
 * guessed pixel constant drifts the moment content is longer or shorter than assumed.
 * Attach `ref` to the first column's header cell (every cell in a table column shares
 * its rendered width, so measuring one is enough) and apply `width` as the second
 * column's `left` style.
 */
export function useMeasuredWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}
