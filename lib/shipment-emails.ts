import { sendNoticeEmail } from "@/lib/notice-email";
import { statusLabel, type ShipmentStatus } from "@/lib/shipments";

export async function sendShipmentStatusEmail(params: {
  to: string;
  trackingId: string;
  status: ShipmentStatus;
  origin?: string | null;
  destination?: string | null;
}) {
  const label = statusLabel(params.status);
  const lines = [
    `Tracking ID: ${params.trackingId}`,
    `Current Status: ${label}`,
    params.origin || params.destination
      ? `Route: ${params.origin || "Origin"} → ${params.destination || "Destination"}`
      : null,
  ].filter(Boolean) as string[];

  return sendNoticeEmail({
    to: params.to,
    subject: `LineScout Shipment Update: ${label}`,
    title: "Shipment status update",
    lines,
    footerNote: "This email was sent because your LineScout shipment status was updated.",
  });
}

export async function sendShipmentUpdateEmail(params: {
  to: string;
  trackingId: string;
  title: string;
  lines: string[];
  origin?: string | null;
  destination?: string | null;
}) {
  const routeLine =
    params.origin || params.destination
      ? `Route: ${params.origin || "Origin"} → ${params.destination || "Destination"}`
      : null;
  const payload = [
    `Tracking ID: ${params.trackingId}`,
    routeLine,
    ...params.lines,
  ].filter(Boolean) as string[];

  return sendNoticeEmail({
    to: params.to,
    subject: `LineScout Shipment Update`,
    title: params.title,
    lines: payload,
    footerNote: "This email was sent because your LineScout shipment was updated.",
  });
}
