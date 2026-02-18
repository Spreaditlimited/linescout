import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendMetaLeadEvent } from "@/lib/meta-capi";
import { upsertFlodeskSubscriber } from "@/lib/flodesk";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fallbackSessionId() {
  return crypto.randomUUID();
}

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

async function ensureMachineWebinarLeadsTable(conn: any) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS linescout_machine_webinar_leads (
      id BIGINT NOT NULL AUTO_INCREMENT,
      session_id VARCHAR(64) NOT NULL,
      name VARCHAR(200) NOT NULL,
      email VARCHAR(200) NOT NULL,
      email_normalized VARCHAR(200) NOT NULL,
      meta_json JSON NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_machine_webinar_email (email_normalized)
    )
  `);
}

export async function POST(req: Request) {
  const conn = await db.getConnection();
  try {
    await ensureMachineWebinarLeadsTable(conn);
    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || "").trim();
    const emailRaw = String(body?.email || "").trim();
    const email = normalizeEmail(emailRaw);
    const sessionIdRaw = String(body?.sessionId || "").trim();
    const sessionId = sessionIdRaw || fallbackSessionId();
    const meta = body?.meta && typeof body.meta === "object" ? body.meta : {};

    if (!name || !email || !email.includes("@")) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    const [ins]: any = await conn.query(
      `
      INSERT INTO linescout_machine_webinar_leads
      (session_id, name, email, email_normalized, meta_json)
      VALUES (?, ?, ?, ?, ?)
      `,
      [
        sessionId,
        name,
        emailRaw,
        email,
        JSON.stringify({
          source: "machine-sourcing-webinar",
          page: "machine-sourcing-webinar",
          ...meta,
        }),
      ]
    );
    if (!ins?.insertId) {
      return NextResponse.json(
        {
          ok: false,
          code: "already-registered",
          error: "You have already registered. Check your email (including spam) for the webinar link.",
        },
        { status: 409 }
      );
    }

    const segmentId =
      process.env.FLODESK_MACHINE_WEBINAR_SEGMENT_ID?.trim() || "692ef75bc6061033b90614cf";
    const { firstName, lastName } = splitName(name);
    const flodeskRes = await upsertFlodeskSubscriber({
      email,
      firstName,
      lastName,
      segmentId,
    });
    if (!flodeskRes.ok) {
      console.warn("Flodesk machine webinar subscribe failed:", flodeskRes.error);
      return NextResponse.json({ ok: false, error: "Failed to subscribe lead" }, { status: 502 });
    }

    let metaOk = true;
    const ip =
      String(req.headers.get("x-forwarded-for") || "")
        .split(",")[0]
        .trim() || null;
    const ua = String(req.headers.get("user-agent") || "").trim() || null;
    const eventSourceUrl =
      String(req.headers.get("referer") || "").trim() ||
      String(req.headers.get("origin") || "").trim() ||
      "https://linescout.sureimports.com/machine-sourcing-webinar";

    try {
      await sendMetaLeadEvent({
        email,
        firstName: name.split(" ")[0] || null,
        lastName: name.split(" ").slice(1).join(" ") || null,
        clientIp: ip,
        userAgent: ua,
        eventSourceUrl,
        eventName: "machineWebinarSignup",
        customData: {
          lead_type: "webinar",
          content_name: "machine_sourcing_webinar",
        },
      });
    } catch (err) {
      console.warn("Meta CAPI machine webinar lead failed:", err);
      metaOk = false;
    }

    return NextResponse.json({ ok: true, meta_ok: metaOk });
  } catch (err: any) {
    if (err?.code === "ER_DUP_ENTRY") {
      return NextResponse.json(
        {
          ok: false,
          code: "already-registered",
          error: "You have already registered. Check your email (including spam) for the webinar link.",
        },
        { status: 409 }
      );
    }
    console.error("machine-sourcing-webinar lead error:", err);
    return NextResponse.json({ ok: false, error: "Failed to save lead" }, { status: 500 });
  } finally {
    conn.release();
  }
}
