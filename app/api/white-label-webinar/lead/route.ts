import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendMetaLeadEvent } from "@/lib/meta-capi";
import { upsertFlodeskSubscriber } from "@/lib/flodesk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function splitName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" ") || "",
  };
}

export async function POST(req: Request) {
  const conn = await db.getConnection();
  try {
    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || "").trim();
    const emailRaw = String(body?.email || "").trim();
    const email = normalizeEmail(emailRaw);
    const sessionId = String(body?.sessionId || "").trim();
    const meta = body?.meta && typeof body.meta === "object" ? body.meta : {};

    if (!name || !email || !email.includes("@") || !sessionId) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    // Store lead record (minimal)
    await conn.query(
      `
      INSERT INTO linescout_leads
      (session_id, name, whatsapp, email, sourcing_request, meta_json)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        sessionId,
        name,
        "unknown",
        emailRaw,
        "White label webinar lead",
        JSON.stringify({
          source: "white-label-webinar",
          ...meta,
        }),
      ]
    );

    const segmentId =
      process.env.FLODESK_WEBINAR_SEGMENT_ID?.trim() || "6990c932ec27531072f9bbdf";
    const { firstName, lastName } = splitName(name);
    const flodeskRes = await upsertFlodeskSubscriber({
      email,
      firstName,
      lastName,
      segmentId,
    });
    if (!flodeskRes.ok) {
      console.warn("Flodesk webinar subscribe failed:", flodeskRes.error);
      return NextResponse.json({ ok: false, error: "Failed to subscribe lead" }, { status: 502 });
    }

    // Fire Meta CAPI lead event with webinar-specific metadata
    const ip =
      String(req.headers.get("x-forwarded-for") || "")
        .split(",")[0]
        .trim() || null;
    const ua = String(req.headers.get("user-agent") || "").trim() || null;
    const eventSourceUrl =
      String(req.headers.get("referer") || "").trim() ||
      String(req.headers.get("origin") || "").trim() ||
      "https://linescout.sureimports.com/white-label-leads";

    try {
      await sendMetaLeadEvent({
        email,
        firstName: name.split(" ")[0] || null,
        lastName: name.split(" ").slice(1).join(" ") || null,
        clientIp: ip,
        userAgent: ua,
        eventSourceUrl,
        eventName: "Lead",
        customData: {
          lead_type: "webinar",
          content_name: "white_label_webinar",
        },
      });
    } catch (err) {
      console.warn("Meta CAPI webinar lead failed:", err);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("white-label-webinar lead error:", err);
    return NextResponse.json({ ok: false, error: "Failed to save lead" }, { status: 500 });
  } finally {
    conn.release();
  }
}
