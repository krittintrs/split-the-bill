// PROTOTYPE — throwaway. Holds the in-memory bill state and swaps the
// rendered layout per ?variant=. Ticks run through the REAL computeBill.
"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { computeBill } from "@/lib/billing/compute";
import { INITIAL_ITEMS, PEERS, type EditorItem } from "./shared";
import PrototypeSwitcher from "./PrototypeSwitcher";
import VariantA from "./VariantA";
import VariantB from "./VariantB";
import VariantC from "./VariantC";

const VARIANTS = [
  { key: "A", name: "Sheet matrix", Component: VariantA },
  { key: "B", name: "Stacked cards", Component: VariantB },
  { key: "C", name: "Split pane", Component: VariantC },
];

export default function PrototypeEditor() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<EditorItem[]>(INITIAL_ITEMS);
  const [receiptText, setReceiptText] = useState("902.70");

  const result = useMemo(
    () =>
      computeBill({
        items,
        peerIds: PEERS.map((peer) => peer.id),
        serviceChargePercent: 0,
        vatPercent: 0,
      }),
    [items],
  );

  const onToggle = useCallback((itemId: string, peerId: string) => {
    setItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              tickedBy: item.tickedBy.includes(peerId)
                ? item.tickedBy.filter((id) => id !== peerId)
                : [...item.tickedBy, peerId],
            }
          : item,
      ),
    );
  }, []);

  const currentKey = searchParams.get("variant") ?? "A";
  const variant = VARIANTS.find((v) => v.key === currentKey) ?? VARIANTS[0];
  const setVariant = useCallback(
    (key: string) => router.replace(`?variant=${key}`, { scroll: false }),
    [router],
  );

  return (
    <>
      <variant.Component
        items={items}
        peers={PEERS}
        result={result}
        receiptText={receiptText}
        onToggle={onToggle}
        onReceiptChange={setReceiptText}
      />
      <PrototypeSwitcher
        variants={VARIANTS}
        current={variant.key}
        onChange={setVariant}
      />
    </>
  );
}
