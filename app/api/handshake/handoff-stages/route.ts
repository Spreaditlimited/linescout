import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    stages: [
      { value: "pending", label: "Pending" },
      { value: "claimed", label: "Claimed" },
      { value: "manufacturer_found", label: "Manufacturer found" },
      { value: "paid", label: "Paid" },
      { value: "shipped", label: "Shipped" },
      { value: "delivered", label: "Delivered" },
      { value: "cancelled", label: "Cancelled" },
    ],
  });
}
