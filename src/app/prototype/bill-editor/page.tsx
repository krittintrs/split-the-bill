// PROTOTYPE — throwaway route answering issue #8's open layout question:
// sheet-like matrix vs stacked cards vs split pane, on mobile AND desktop.
// Lives on branch prototype/8-bill-editor; never merge to main.
import { Suspense } from "react";
import PrototypeEditor from "./PrototypeEditor";

export default function BillEditorPrototypePage() {
  return (
    <Suspense>
      <PrototypeEditor />
    </Suspense>
  );
}
