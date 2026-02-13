// app/api/mobile/profile/route.ts
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { queryOne, queryRows } from "@/lib/db";
import { RowDataPacket } from "mysql2/promise";
import { upsertFlodeskSubscriber } from "@/lib/flodesk";
import { sendMetaLeadEvent } from "@/lib/meta-capi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LeadRow = RowDataPacket & {
  id: number;
  email: string;
  name: string;
  whatsapp: string;
  meta_json?: string | null;
};

function splitName(full: string) {
  const s = String(full || "").trim().replace(/\s+/g, " ");
  if (!s) return { firstName: "", lastName: "" };
  const parts = s.split(" ");
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function normalizePhone(raw: string) {
  // Keep it simple: trim + collapse spaces. Your WA pipeline already has its own normalizers.
  return String(raw || "").trim().replace(/\s+/g, " ");
}

async function getOrCreateLeadByEmail(email: string) {
  // Prefer the most recent lead record for that email
  const lead = await queryOne<LeadRow>(
    `SELECT id, email, name, whatsapp, meta_json
     FROM linescout_leads
     WHERE email = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [email]
  );

  if (lead) return lead;

  // Create a minimal row so profile can exist even if user never submitted a lead form
  // NOTE: We use session_id as a stable synthetic key here.
  const sessionId = `profile_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  await queryRows(
    `INSERT INTO linescout_leads
      (session_id, name, whatsapp, email, sourcing_request, meta_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      sessionId,
      "Unknown",
      "unknown",
      email,
      "profile-init",
      JSON.stringify({ source: "mobile_profile_init" }),
    ]
  );

  const created = await queryOne<LeadRow>(
    `SELECT id, email, name, whatsapp, meta_json
     FROM linescout_leads
     WHERE session_id = ?
     LIMIT 1`,
    [sessionId]
  );

  if (!created) throw new Error("Failed to create profile row");
  return created;
}

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);

    const lead = await getOrCreateLeadByEmail(user.email);
    const { firstName, lastName } = splitName(lead.name);

    return NextResponse.json({
      ok: true,
      email: user.email,
      first_name: firstName,
      last_name: lastName,
      phone: lead.whatsapp === "unknown" ? "" : lead.whatsapp,
    });
  } catch (e: any) {
    const msg = e?.message || "Unauthorized";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function PUT(req: Request) {
  try {
    const user = await requireUser(req);

    const body = await req.json().catch(() => ({}));
    const firstName = String(body?.first_name || "").trim();
    const lastName = String(body?.last_name || "").trim();
    const phone = normalizePhone(body?.phone || "");
    const fbclid = String(body?.fbclid || "").trim();
    const fbc = String(body?.fbc || "").trim();
    const fbp = String(body?.fbp || "").trim();

    if (!firstName) {
      return NextResponse.json({ ok: false, error: "First name is required" }, { status: 400 });
    }
    if (!lastName) {
      return NextResponse.json({ ok: false, error: "Last name is required" }, { status: 400 });
    }

    const lead = await getOrCreateLeadByEmail(user.email);
    const fullName = `${firstName} ${lastName}`.trim();

    await queryRows(
      `UPDATE linescout_leads
       SET name = ?, whatsapp = ?, updated_at = NOW()
       WHERE id = ?
       LIMIT 1`,
      [fullName, phone || lead.whatsapp, lead.id]
    );

    await queryRows(
      `UPDATE users
       SET display_name = ?
       WHERE id = ?
       LIMIT 1`,
      [fullName, user.id]
    );

    const segmentId =
      process.env.FLODESK_SEGMENT_ID?.trim() || "698e48199d85ee31d683c0d8";
    let meta: Record<string, any> = {};
    try {
      meta = lead.meta_json ? JSON.parse(String(lead.meta_json)) : {};
    } catch {
      meta = {};
    }

    let metaChanged = false;
    if (fbclid && !meta.fbclid) {
      meta.fbclid = fbclid;
      metaChanged = true;
    }
    if (fbc && !meta.fbc) {
      meta.fbc = fbc;
      metaChanged = true;
    }
    if (fbp && !meta.fbp) {
      meta.fbp = fbp;
      metaChanged = true;
    }

    let savedMeta = false;
    if (!meta.flodesk_subscribed_at) {
      const res = await upsertFlodeskSubscriber({
        email: user.email,
        firstName,
        lastName,
        segmentId,
      });
      if (res.ok) {
        meta.flodesk_subscribed_at = new Date().toISOString();
        meta.flodesk_segment_id = segmentId;

        const ip =
          String(req.headers.get("x-forwarded-for") || "")
            .split(",")[0]
            .trim() || null;
        const ua = String(req.headers.get("user-agent") || "").trim() || null;
        const eventSourceUrl =
          String(req.headers.get("referer") || "").trim() ||
          String(req.headers.get("origin") || "").trim() ||
          null;

        try {
          await sendMetaLeadEvent({
            email: user.email,
            firstName,
            lastName,
            fbclid: meta.fbclid || null,
            fbc: meta.fbc || null,
            fbp: meta.fbp || null,
            clientIp: ip,
            userAgent: ua,
            eventSourceUrl,
          });
        } catch (err) {
          console.warn("Meta CAPI lead failed:", err);
        }

        metaChanged = true;
        await queryRows(
          `UPDATE linescout_leads
           SET meta_json = ?, updated_at = NOW()
           WHERE id = ?
           LIMIT 1`,
          [JSON.stringify(meta), lead.id]
        );
        savedMeta = true;
      } else {
        console.warn("Flodesk subscribe failed:", res.error);
      }
    } else if (metaChanged) {
      await queryRows(
        `UPDATE linescout_leads
         SET meta_json = ?, updated_at = NOW()
         WHERE id = ?
         LIMIT 1`,
        [JSON.stringify(meta), lead.id]
      );
      savedMeta = true;
    }

    if (metaChanged && !savedMeta) {
      await queryRows(
        `UPDATE linescout_leads
         SET meta_json = ?, updated_at = NOW()
         WHERE id = ?
         LIMIT 1`,
        [JSON.stringify(meta), lead.id]
      );
    }

    return NextResponse.json({
      ok: true,
      email: user.email,
      first_name: firstName,
      last_name: lastName,
      phone,
    });
  } catch (e: any) {
    const msg = e?.message || "Unauthorized";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
