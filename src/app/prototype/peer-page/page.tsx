// PROTOTYPE — throwaway route answering issue #9's open layout question:
// peer tick view as receipt list vs matrix vs people-first, mobile AND
// desktop. Lives on branch prototype/9-peer-link; never merge to main.
import { Suspense } from "react";
import PrototypePeerPage from "./PrototypePeerPage";

export default function PeerPagePrototypePage() {
  return (
    <Suspense>
      <PrototypePeerPage />
    </Suspense>
  );
}
