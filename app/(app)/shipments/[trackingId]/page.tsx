import ShipmentDetailClient from "@/components/shipments/ShipmentDetailClient";

export const runtime = "nodejs";

export default async function ShipmentDetailPage({
  params,
}: {
  params: Promise<{ trackingId: string }>;
}) {
  const { trackingId } = await params;
  return <ShipmentDetailClient trackingId={trackingId} />;
}
