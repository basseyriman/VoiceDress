import { Suspense } from "react";
import ConnectPageClient from "./connect-client";

export default function ConnectPage() {
  return (
    <Suspense
      fallback={
        <div className="py-20 text-center text-sm text-mist">Loading…</div>
      }
    >
      <ConnectPageClient />
    </Suspense>
  );
}
