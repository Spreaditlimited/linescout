import { Suspense } from "react";
import PayPalQuoteVerifyClient from "./PayPalQuoteVerifyClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function PayPalQuoteVerifyPage() {
  return (
    <Suspense fallback={null}>
      <PayPalQuoteVerifyClient />
    </Suspense>
  );
}
