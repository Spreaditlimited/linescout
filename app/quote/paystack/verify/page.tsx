import { Suspense } from "react";
import PaystackQuoteVerifyClient from "./PaystackQuoteVerifyClient";

export default function QuotePaystackVerifyPage() {
  return (
    <Suspense fallback={null}>
      <PaystackQuoteVerifyClient />
    </Suspense>
  );
}
