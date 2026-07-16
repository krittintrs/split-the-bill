"use client";

import { useState } from "react";
import type { PeerRow } from "@/lib/bills/types";

interface Props {
  peersOnBill: PeerRow[];
  recentPeers: PeerRow[];
  onAdd: (name: string) => void;
  onRemove: (peerId: string) => void;
}

export default function PeerPicker({ peersOnBill, recentPeers, onAdd, onRemove }: Props) {
  const [name, setName] = useState("");
  const onBillIds = new Set(peersOnBill.map((peer) => peer.id));
  const suggestions = recentPeers.filter((peer) => !onBillIds.has(peer.id));

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setName("");
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <h2 className="font-semibold">คนร่วมบิล</h2>

      {peersOnBill.length === 0 ? (
        <p className="text-sm text-ink-muted">ยังไม่มีใครในบิล — เพิ่มเพื่อนด้านล่าง</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {peersOnBill.map((peer) => (
            <span
              key={peer.id}
              className="flex min-h-11 items-center gap-1 rounded-full bg-primary pl-4 pr-0.5 text-sm font-bold text-white"
            >
              {peer.name}
              <button
                type="button"
                onClick={() => onRemove(peer.id)}
                aria-label={`เอา ${peer.name} ออกจากบิล`}
                className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-primary-deep focus-visible:outline-2 focus-visible:outline-white"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-muted">ล่าสุด:</span>
          {suggestions.map((peer) => (
            <button
              key={peer.id}
              type="button"
              onClick={() => onAdd(peer.name)}
              className="min-h-11 rounded-full bg-surface-tint px-4 py-2 text-sm font-medium text-primary-ink hover:bg-border focus-visible:outline-2 focus-visible:outline-primary-ink"
            >
              + {peer.name}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex gap-2"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="เพิ่มเพื่อนใหม่…"
          className="min-h-11 flex-1 rounded-lg border border-border bg-surface p-2 text-sm focus-visible:outline-2 focus-visible:outline-primary-ink"
        />
        <button
          type="submit"
          disabled={!name.trim()}
          className="min-h-11 rounded-lg bg-primary px-4 text-sm font-bold text-white hover:bg-primary-deep disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-ink"
        >
          เพิ่ม
        </button>
      </form>
    </section>
  );
}
