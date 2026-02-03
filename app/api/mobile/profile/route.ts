// app/api/mobile/profile/route.ts
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
    `SELECT id, email, name, whatsapp
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
    `SELECT id, email, name, whatsapp
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
