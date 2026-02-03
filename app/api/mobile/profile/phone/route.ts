import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { queryOne, queryRows } from "@/lib/db";
import { RowDataPacket } from "mysql2/promise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LeadRow = RowDataPacket & {
  id: number;
  email: string;
  name: string;
  whatsapp: string;
};

function normalizePhone(raw: string) {
  return String(raw || "").trim().replace(/\s+/g, " ");
}

async function getOrCreateLeadByEmail(email: string) {
  const lead = await queryOne<LeadRow>(
    `SELECT id, email, name, whatsapp
     FROM linescout_leads
     WHERE email = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [email]
  );
  if (lead) return lead;

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
    `SELECT id, email, name, whatsapp
     FROM linescout_leads
     WHERE session_id = ?
     LIMIT 1`,
    [sessionId]
  );

  if (!created) throw new Error("Failed to create profile row");
  return created;
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const phone = normalizePhone(body?.phone || "");

    if (!phone) {
      return NextResponse.json({ ok: false, error: "Phone number is required" }, { status: 400 });
    }

    const lead = await getOrCreateLeadByEmail(user.email);

    await queryRows(
      `UPDATE linescout_leads
       SET whatsapp = ?, updated_at = NOW()
       WHERE id = ?
       LIMIT 1`,
      [phone, lead.id]
    );

    return NextResponse.json({ ok: true, phone });
  } catch (e: any) {
    const msg = e?.message || "Unauthorized";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
