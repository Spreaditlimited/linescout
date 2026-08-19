import type { Metadata } from "next";
import TrackLookupClient from "@/components/shipments/TrackLookupClient";

export const metadata: Metadata = {
  title: "Track Your Shipment | LineScout",
  description:
    "Track your LineScout shipment from origin through delivery using your unique LineScout tracking ID.",
  alternates: { canonical: "https://linescout.sureimports.com/track" },
};

export const runtime = "nodejs";

export default function TrackPage() {
  return <TrackLookupClient />;
}
