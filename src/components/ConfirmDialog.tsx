"use client";

import { useEffect, useRef } from "react";

/**
 * Minimal confirm modal on the native <dialog> element (no library, issue #19).
 * Used for destructive actions like bill delete.
 */
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Style the confirm button as destructive (red) instead of primary. */
  danger?: boolean;
  /** Disable both buttons while the confirmed action is in flight. */
  busy?: boolean;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "ยืนยัน",
  cancelLabel = "ยกเลิก",
  onConfirm,
  onCancel,
  danger = false,
  busy = false,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (busy) return;
        onCancel();
      }}
      onClose={() => {
        if (!busy) onCancel();
      }}
      className="w-[calc(100%-2rem)] max-w-sm rounded-xl border border-border bg-surface p-5 text-ink backdrop:bg-ink/40 open:flex open:flex-col open:gap-4"
    >
      <h2 className="text-base font-bold">{title}</h2>
      <p className="text-sm text-ink-muted">{message}</p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="min-h-11 rounded-lg border border-border px-4 text-sm font-medium text-ink transition-transform hover:bg-surface-tint active:scale-95 focus-visible:outline-2 focus-visible:outline-primary-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={`min-h-11 rounded-lg px-4 text-sm font-bold text-white transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
            danger
              ? "bg-danger hover:opacity-90 focus-visible:outline-danger"
              : "bg-primary hover:bg-primary-deep focus-visible:outline-primary-ink"
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
