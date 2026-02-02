import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
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
      `SELECT u.id, u.role, u.is_active
       FROM internal_sessions s
       JOIN internal_users u ON u.id = s.user_id
       WHERE s.session_token = ?
         AND s.revoked_at IS NULL
       LIMIT 1`,
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

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const owner_type = String(body?.owner_type || "").trim();
  const owner_id = Number(body?.owner_id || 0);
  const type = String(body?.type || "").trim();
  const amount = Number(body?.amount || 0);
  const reason = String(body?.reason || "").trim();

  if (owner_type !== "user" && owner_type !== "agent") {
    return NextResponse.json({ ok: false, error: "owner_type must be user or agent" }, { status: 400 });
  }
  if (!owner_id || Number.isNaN(owner_id)) {
    return NextResponse.json({ ok: false, error: "owner_id is required" }, { status: 400 });
  }
  if (type !== "credit" && type !== "debit") {
    return NextResponse.json({ ok: false, error: "type must be credit or debit" }, { status: 400 });
  }
  if (!amount || amount <= 0) {
    return NextResponse.json({ ok: false, error: "amount must be > 0" }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ ok: false, error: "reason is required" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [rows]: any = await conn.query(
      `SELECT id, balance FROM linescout_wallets WHERE owner_type = ? AND owner_id = ? LIMIT 1`,
      [owner_type, owner_id]
    );

    if (!rows?.length) {
      await conn.query(
        `INSERT INTO linescout_wallets (owner_type, owner_id, currency, balance, status)
         VALUES (?, ?, 'NGN', 0, 'active')`,
        [owner_type, owner_id]
      );
    }

    const [walletRows]: any = await conn.query(
      `SELECT id, balance FROM linescout_wallets WHERE owner_type = ? AND owner_id = ? LIMIT 1`,
      [owner_type, owner_id]
    );

    const walletId = Number(walletRows[0].id);
    const currentBalance = Number(walletRows[0].balance || 0);
    const nextBalance = type === "credit" ? currentBalance + amount : currentBalance - amount;

    if (type === "debit" && nextBalance < 0) {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "Insufficient balance" }, { status: 400 });
    }

    await conn.query(
      `INSERT INTO linescout_wallet_transactions
        (wallet_id, type, amount, currency, reason, reference_type, reference_id, created_by_internal_user_id)
       VALUES (?, ?, ?, 'NGN', ?, 'admin_adjustment', NULL, ?)`,
      [walletId, type, amount, reason, auth.adminId]
    );

    await conn.query(`UPDATE linescout_wallets SET balance = ?, updated_at = NOW() WHERE id = ?`, [
      nextBalance,
      walletId,
    ]);

    await conn.commit();
    return NextResponse.json({ ok: true, balance: nextBalance });
  } catch (e: any) {
    try {
      await conn.rollback();
    } catch {}
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 500 });
  } finally {
    conn.release();
  }
}
