import { Suspense } from "react";
import ShippingPayPalVerifyClient from "./ShippingPayPalVerifyClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function ShippingPayPalVerifyPage() {
  return (
    <Suspense fallback={null}>
      <ShippingPayPalVerifyClient />
    </Suspense>
  );
}
