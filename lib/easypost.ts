import { normalizeStatus, type ShipmentStatus } from "@/lib/shipments";

type EasyPostTracker = {
  id: string;
  status: string | null;
  tracking_code: string;
  carrier: string | null;
  estimated_delivery_date?: string | null;
  tracking_details?: Array<{
    datetime?: string | null;
    message?: string | null;
    status?: string | null;
    tracking_location?: {
      city?: string | null;
      state?: string | null;
      country?: string | null;
    } | null;
  }> | null;
};

function getApiKey() {
  const key = String(process.env.EASYPOST_API_KEY || "").trim();
  if (!key) {
    return { ok: false as const, error: "Missing EASYPOST_API_KEY" };
  }
  return { ok: true as const, key };
}

function authHeader(key: string) {
  const token = Buffer.from(`${key}:`).toString("base64");
  return `Basic ${token}`;
}

export async function createEasyPostTracker(params: { trackingCode: string; carrier?: string | null }) {
  const cfg = getApiKey();
  if (!cfg.ok) return { ok: false as const, error: cfg.error };
  const res = await fetch("https://api.easypost.com/v2/trackers", {
    method: "POST",
    headers: {
      Authorization: authHeader(cfg.key),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tracker: {
        tracking_code: params.trackingCode,
        carrier: params.carrier || undefined,
      },
    }),
  });
  const json = (await res.json().catch(() => null)) as EasyPostTracker | null;
  if (!res.ok || !json?.id) {
    return { ok: false as const, error: json || { status: res.status } };
  }
  return { ok: true as const, tracker: json };
}

export async function getEasyPostTracker(trackerId: string) {
  const cfg = getApiKey();
  if (!cfg.ok) return { ok: false as const, error: cfg.error };
  const res = await fetch(`https://api.easypost.com/v2/trackers/${trackerId}`, {
    headers: { Authorization: authHeader(cfg.key) },
  });
  const json = (await res.json().catch(() => null)) as EasyPostTracker | null;
  if (!res.ok || !json?.id) {
    return { ok: false as const, error: json || { status: res.status } };
  }
  return { ok: true as const, tracker: json };
}

export function mapEasyPostStatus(status: string | null | undefined): ShipmentStatus {
  const raw = String(status || "").toLowerCase();
  if (raw === "delivered") return "delivered";
  if (raw === "out_for_delivery") return "out_for_delivery";
  if (raw === "in_transit") return "departed_origin";
  if (raw === "pre_transit") return "created";
  if (raw === "return_to_sender") return "exception";
  if (raw === "failure") return "exception";
  return normalizeStatus(raw);
}

export function trackerToEvents(tracker: EasyPostTracker) {
  const details = Array.isArray(tracker.tracking_details) ? tracker.tracking_details : [];
  const events = details
    .map((detail) => {
      const when = detail?.datetime ? new Date(detail.datetime) : null;
      const status = mapEasyPostStatus(detail?.status || tracker.status || "created");
      const parts = [
        detail?.message,
        detail?.tracking_location?.city,
        detail?.tracking_location?.state,
        detail?.tracking_location?.country,
      ]
        .map((p) => String(p || "").trim())
        .filter(Boolean);
      return {
        status,
        label: null,
        notes: parts.length ? parts.join(" • ") : null,
        event_time: when && !Number.isNaN(when.valueOf()) ? when : new Date(),
        source: "carrier_api",
      };
    })
    .filter(Boolean);
  return events;
}
