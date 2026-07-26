import { Suspense } from "react";
import BillingPage from "./billing-client";

export default function BillingRoute() {
  return (
    <Suspense
      fallback={
        <div className="py-20 text-center text-sm text-mist">Loading billing…</div>
      }
    >
      <BillingPage />
    </Suspense>
  );
}
