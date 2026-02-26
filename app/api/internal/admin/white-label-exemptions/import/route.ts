import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import {
  ensureWhiteLabelExemptionsTable,
  normalizeEmail,
} from "@/lib/white-label-exemptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdminSession() {
  const cookieName = process.env.INTERNAL_AUTH_COOKIE_NAME;
  if (!cookieName) {
    return { ok: false as const, status: 500 as const, error: "Missing INTERNAL_AUTH_COOKIE_NAME" };
  }

  const h = await headers();
  const bearer = h.get("authorization") || "";
  const headerToken = bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : "";

  const cookieHeader = h.get("cookie") || "";
  const cookieToken =
    cookieHeader
      .split(/[;,]/)
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1) || "";

  const token = headerToken || cookieToken;
  if (!token) return { ok: false as const, status: 401 as const, error: "Not signed in" };

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `
      SELECT u.id, u.role, u.is_active
      FROM internal_sessions s
      JOIN internal_users u ON u.id = s.user_id
      WHERE s.session_token = ?
        AND s.revoked_at IS NULL
      LIMIT 1
      `,
      [token]
    );

    if (!rows?.length) return { ok: false as const, status: 401 as const, error: "Invalid session" };
    if (!rows[0].is_active) return { ok: false as const, status: 403 as const, error: "Account disabled" };
    if (String(rows[0].role || "") !== "admin") return { ok: false as const, status: 403 as const, error: "Forbidden" };

    return { ok: true as const, adminId: Number(rows[0].id) };
  } finally {
    conn.release();
  }
}

function parseCsv(raw: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    const next = raw[i + 1];

    if (ch === "\"") {
      if (inQuotes && next === "\"") {
        current += "\"";
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (ch === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(current);
      current = "";
      if (row.length > 1 || row[0]?.trim()) rows.push(row);
      row = [];
      continue;
    }

    current += ch;
  }

  if (current.length || row.length) {
    row.push(current);
    rows.push(row);
  }

  return rows;
}

function clean(v: any) {
  return String(v ?? "").trim();
}

function toMonths(value: any) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(1, Math.min(12, Math.floor(n)));
}

export async function POST(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const csv = String(body?.csv || "");
  if (!csv.trim()) {
    return NextResponse.json({ ok: false, error: "CSV payload is required" }, { status: 400 });
  }

  const rows = parseCsv(csv);
  if (!rows.length) {
    return NextResponse.json({ ok: false, error: "CSV appears empty" }, { status: 400 });
  }

  const header = rows[0].map((h) => clean(h).toLowerCase());
  const dataRows = rows.slice(1);
  const colIndex = (name: string) => header.indexOf(name);
  const idxEmail = colIndex("email");
  const idxMonths = colIndex("months");
  const idxNotes = colIndex("notes");

  if (idxEmail === -1 || idxMonths === -1) {
    return NextResponse.json({ ok: false, error: "CSV must include email and months columns" }, { status: 400 });
  }

  const conn = await db.getConnection();
  let inserted = 0;
  let skipped = 0;
  try {
    await ensureWhiteLabelExemptionsTable(conn);

    for (const row of dataRows) {
      const email = clean(row[idxEmail] ?? "");
      const months = toMonths(row[idxMonths]);
      const notes = idxNotes >= 0 ? clean(row[idxNotes] ?? "") : "";
      const emailNorm = normalizeEmail(email);
      if (!emailNorm || !emailNorm.includes("@") || !months) {
        skipped += 1;
        continue;
      }

      await conn.query(
        `
        UPDATE linescout_white_label_exemptions
        SET revoked_at = NOW()
        WHERE email_normalized = ?
          AND revoked_at IS NULL
        `,
        [emailNorm]
      );

      await conn.query(
        `
        INSERT INTO linescout_white_label_exemptions
          (email, email_normalized, starts_at, ends_at, source, notes, created_by_internal_user_id)
        VALUES
          (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? MONTH), 'csv', ?, ?)
        `,
        [email, emailNorm, months, notes || null, auth.adminId]
      );
      inserted += 1;
    }

    return NextResponse.json({ ok: true, inserted, skipped });
  } catch (e: any) {
    console.error("POST /api/internal/admin/white-label-exemptions/import error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to import exemptions" }, { status: 500 });
  } finally {
    conn.release();
  }
}
