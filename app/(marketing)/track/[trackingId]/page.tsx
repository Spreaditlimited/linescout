import type { Metadata } from "next";
import TrackLookupClient from "@/components/shipments/TrackLookupClient";

export const metadata: Metadata = {
  title: "Shipment Progress | LineScout",
  robots: { index: false, follow: false },
};

export const runtime = "nodejs";

export default async function TrackingResultPage({
  params,
}: {
  params: Promise<{ trackingId: string }>;
}) {
  const { trackingId } = await params;
  return <TrackLookupClient initialTrackingId={decodeURIComponent(trackingId)} />;
}
