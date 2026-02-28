import ShipmentAdminDetailClient from "@/components/internal/ShipmentAdminDetailClient";

export default async function InternalShipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ShipmentAdminDetailClient id={id} />;
}
