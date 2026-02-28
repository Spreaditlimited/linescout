import { Suspense } from "react";
import ShippingPaystackVerifyClient from "./ShippingPaystackVerifyClient";

export default function ShippingPaystackVerifyPage() {
  return (
    <Suspense fallback={null}>
      <ShippingPaystackVerifyClient />
    </Suspense>
  );
}
