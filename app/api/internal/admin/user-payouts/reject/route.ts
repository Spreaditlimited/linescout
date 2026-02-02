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
  const id = Number(body?.id || 0);
  const reason = String(body?.reason || "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `SELECT id, user_id, amount, status
       FROM linescout_user_payout_requests
       WHERE id = ? LIMIT 1`,
      [id]
    );
    if (!rows?.length) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (rows[0].status !== "pending") {
      return NextResponse.json({ ok: false, error: "Only pending requests can be rejected" }, { status: 400 });
    }

    const userId = Number(rows[0].user_id);
    const amount = Number(rows[0].amount || 0);

    await conn.beginTransaction();

    // credit back wallet
    const [walletRows]: any = await conn.query(
      `SELECT id, balance FROM linescout_wallets
       WHERE owner_type = 'user' AND owner_id = ?
       LIMIT 1`,
      [userId]
    );
    if (!walletRows?.length) {
      await conn.query(
        `INSERT INTO linescout_wallets (owner_type, owner_id, currency, balance, status)
         VALUES ('user', ?, 'NGN', 0, 'active')`,
        [userId]
      );
    }

    const [walletRows2]: any = await conn.query(
      `SELECT id, balance FROM linescout_wallets
       WHERE owner_type = 'user' AND owner_id = ?
       LIMIT 1`,
      [userId]
    );
    const walletId = Number(walletRows2[0].id);
    const balance = Number(walletRows2[0].balance || 0);
    const nextBalance = balance + amount;

    await conn.query(
      `INSERT INTO linescout_wallet_transactions
        (wallet_id, type, amount, currency, reason, reference_type, reference_id, created_by_internal_user_id)
       VALUES (?, 'credit', ?, 'NGN', ?, 'user_payout_reject', ?, ?)`,
      [walletId, amount, reason || "User payout rejected", id, auth.adminId]
    );

    await conn.query(`UPDATE linescout_wallets SET balance = ?, updated_at = NOW() WHERE id = ?`, [
      nextBalance,
      walletId,
    ]);

    await conn.query(
      `UPDATE linescout_user_payout_requests
       SET status = 'rejected', rejection_reason = ?, updated_at = NOW()
       WHERE id = ?`,
      [reason || "Rejected", id]
    );

    await conn.commit();

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    try {
      await conn.rollback();
    } catch {}
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 500 });
  } finally {
    conn.release();
  }
}
