import crypto from "node:crypto";
import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { sendMetaLeadEvent } from "@/lib/meta-capi";
import { upsertFlodeskSubscriber } from "@/lib/flodesk";
import { createWebinarAccessToken } from "@/lib/webinar-access";
import { sendWebinarAccessEmail } from "@/lib/webinar-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LeadRow = RowDataPacket & { id: number; name: string; email: string };

function splitName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || "", lastName: parts.slice(1).join(" ") || "" };
}
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const submittedName = String(body?.name || "").trim();
    const submittedEmail = String(body?.email || "").trim();
    const emailNormalized = submittedEmail.toLowerCase();
    const sessionId = String(body?.sessionId || "").trim() || crypto.randomUUID();
    const meta = body?.meta && typeof body.meta === "object" ? body.meta : {};

    if (submittedName.length < 2 || !/^\S+@\S+\.\S+$/.test(emailNormalized)) {
      return NextResponse.json({ ok: false, error: "Enter a valid name and email address." }, { status: 400 });
    }

    const conn = await db.getConnection();
    let lead: LeadRow;
    let isNewLead = false;
    try {
      try {
        const [result] = await conn.query<ResultSetHeader>(
          `INSERT INTO linescout_machine_webinar_leads
           (session_id, name, email, email_normalized, meta_json)
           VALUES (?, ?, ?, ?, ?)`,
          [
            sessionId,
            submittedName,
            submittedEmail,
            emailNormalized,
            JSON.stringify({ source: "machine-sourcing-webinar", page: "machine-sourcing-webinar", ...meta }),
          ],
        );
        lead = { id: Number(result.insertId), name: submittedName, email: submittedEmail } as LeadRow;
        isNewLead = true;
      } catch (error: unknown) {
        if ((error as { code?: string })?.code !== "ER_DUP_ENTRY") throw error;
        const [rows] = await conn.query<LeadRow[]>(
          `SELECT id, name, email FROM linescout_machine_webinar_leads
           WHERE email_normalized = ? LIMIT 1`,
          [emailNormalized],
        );
        if (!rows[0]) throw error;
        lead = rows[0];
      }
    } finally {
      conn.release();
    }

    const origin = new URL(req.url).origin;
    const token = createWebinarAccessToken("machine-sourcing", Number(lead.id));
    const accessUrl = new URL("/machine-sourcing-webinar-video", origin);
    accessUrl.searchParams.set("access", token);
    const { firstName, lastName } = splitName(lead.name);
    const segmentId = process.env.FLODESK_MACHINE_WEBINAR_SEGMENT_ID?.trim() || "692ef75bc6061033b90614cf";
    const ip = String(req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
    const userAgent = String(req.headers.get("user-agent") || "").trim() || null;
    const eventSourceUrl = String(req.headers.get("referer") || "").trim() || `${origin}/machine-sourcing-webinar`;

    const [emailResult, flodeskResult, metaResult] = await Promise.allSettled([
      sendWebinarAccessEmail({
        kind: "machine-sourcing",
        to: lead.email,
        name: lead.name,
        accessUrl: accessUrl.toString(),
        origin,
      }),
      upsertFlodeskSubscriber({ email: lead.email.toLowerCase(), firstName, lastName, segmentId }),
      isNewLead
        ? sendMetaLeadEvent({
            email: lead.email.toLowerCase(),
            firstName: firstName || null,
            lastName: lastName || null,
            clientIp: ip,
            userAgent,
            eventSourceUrl,
            eventName: "machineWebinarSignup",
            customData: { lead_type: "webinar", content_name: "machine_sourcing_webinar" },
          })
        : Promise.resolve(),
    ]);

    if (emailResult.status === "rejected") {
      console.error("Machine webinar access email failed:", emailResult.reason);
      return NextResponse.json(
        { ok: false, error: "We could not send your access email. Please try again." },
        { status: 502 },
      );
    }
    if (flodeskResult.status === "rejected" || !flodeskResult.value.ok) {
      console.warn(
        "Flodesk machine webinar subscribe failed:",
        flodeskResult.status === "rejected" ? flodeskResult.reason : flodeskResult.value.error,
      );
    }
    if (metaResult.status === "rejected") {
      console.warn("Meta CAPI machine webinar lead failed:", metaResult.reason);
    }

    return NextResponse.json({ ok: true, email_sent: true, already_registered: !isNewLead });
  } catch (error: unknown) {
    console.error("machine-sourcing-webinar lead error:", error);
    return NextResponse.json({ ok: false, error: "Failed to register for the webinar." }, { status: 500 });
  }
}
