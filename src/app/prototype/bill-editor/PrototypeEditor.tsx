// PROTOTYPE — throwaway. Holds the in-memory bill state and swaps the
// rendered layout per ?variant=. Ticks and bill-level fields run through
// the REAL computeBill. The top-right pill stress-tests design questions:
// peer count (5 vs 12), chip style (names vs initials), ฿ shown in chips.
"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { computeBill } from "@/lib/billing/compute";
import {
  INITIAL_ITEMS,
  PEERS_FEW,
  PEERS_MANY,
  type BillMeta,
  type EditorItem,
  type VariantProps,
} from "./shared";
import PrototypeSwitcher from "./PrototypeSwitcher";
import VariantA from "./VariantA";
import VariantB from "./VariantB";
import VariantC from "./VariantC";

function MatrixItemsAsRows(props: VariantProps) {
  return <VariantA {...props} />;
}
function MatrixPeersAsRows(props: VariantProps) {
  return <VariantA {...props} transposed />;
}

const VARIANTS = [
  { key: "A", name: "Matrix (items rows)", Component: MatrixItemsAsRows },
  { key: "A2", name: "Matrix (peers rows)", Component: MatrixPeersAsRows },
  { key: "B", name: "Stacked cards", Component: VariantB },
  { key: "C", name: "Split pane", Component: VariantC },
];

export default function PrototypeEditor() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<EditorItem[]>(INITIAL_ITEMS);
  const [receiptText, setReceiptText] = useState("902.70");
  const [billMeta, setBillMeta] = useState<BillMeta>({
    billDiscountPercent: 0,
    serviceChargePercent: 0,
    vatPercent: 0,
  });
  const [manyPeers, setManyPeers] = useState(false);
  const [chipStyle, setChipStyle] = useState<"name" | "initial">("name");
  const [showChipAmounts, setShowChipAmounts] = useState(true);

  const peers = manyPeers ? PEERS_MANY : PEERS_FEW;

  const result = useMemo(
    () =>
      computeBill({
        items,
        peerIds: peers.map((peer) => peer.id),
        billDiscount: { percent: billMeta.billDiscountPercent },
        serviceChargePercent: billMeta.serviceChargePercent,
        vatPercent: billMeta.vatPercent,
      }),
    [items, peers, billMeta],
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
        peers={peers}
        result={result}
        receiptText={receiptText}
        billMeta={billMeta}
        chipStyle={chipStyle}
        showChipAmounts={showChipAmounts}
        onToggle={onToggle}
        onReceiptChange={setReceiptText}
        onMetaChange={setBillMeta}
      />
      <div className="fixed right-3 top-3 z-50 flex items-center gap-1 rounded-full bg-black/85 px-2 py-1 text-xs text-white shadow-lg dark:bg-white/90 dark:text-black">
        <button
          type="button"
          onClick={() => setManyPeers((v) => !v)}
          className="rounded-full px-2 py-1 hover:opacity-70"
        >
          {peers.length} peers
        </button>
        <span className="opacity-30">|</span>
        <button
          type="button"
          onClick={() => setChipStyle((v) => (v === "name" ? "initial" : "name"))}
          className="rounded-full px-2 py-1 hover:opacity-70"
        >
          {chipStyle === "name" ? "name chips" : "ABC chips"}
        </button>
        <span className="opacity-30">|</span>
        <button
          type="button"
          onClick={() => setShowChipAmounts((v) => !v)}
          className="rounded-full px-2 py-1 hover:opacity-70"
        >
          ฿ {showChipAmounts ? "on" : "off"}
        </button>
      </div>
      <PrototypeSwitcher
        variants={VARIANTS}
        current={variant.key}
        onChange={setVariant}
      />
    </>
  );
}
