import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(v: any) {
  return String(v ?? "").trim();
}

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

async function paystackRequest(url: string, opts: { method: string; body?: any }) {
  const secret = clean(process.env.PAYSTACK_SECRET_KEY);
  if (!secret) throw new Error("Missing PAYSTACK_SECRET_KEY");

  const res = await fetch(url, {
    method: opts.method,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const raw = await res.text().catch(() => "");
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }

  if (!res.ok || !data?.status) {
    const msg =
      String(data?.message || data?.error || "").trim() ||
      `Paystack error (${res.status})`;
    const e: any = new Error(msg);
    e.status = res.status;
    e.payload = data;
    throw e;
  }

  return data;
}

async function requirePayoutColumns(conn: any) {
  const required = [
    "paid_by_internal_user_id",
    "paystack_transfer_code",
    "paystack_reference",
    "paid_at",
  ];
  const [rows]: any = await conn.query(
    `
      SELECT COLUMN_NAME
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'linescout_user_payout_requests'
        AND COLUMN_NAME IN (?)
    `,
    [required]
  );
  const present = new Set((rows || []).map((r: any) => String(r.COLUMN_NAME)));
  const missing = required.filter((c) => !present.has(c));
  if (missing.length) {
    const msg = `Missing columns on linescout_user_payout_requests: ${missing.join(", ")}`;
    const e: any = new Error(msg);
    e.code = "MISSING_SCHEMA_COLUMNS";
    throw e;
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const id = Number(body?.id || 0);
  if (!id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });

  const conn = await db.getConnection();
  try {
    await requirePayoutColumns(conn);
    await conn.beginTransaction();

    const [rows]: any = await conn.query(
      `SELECT id, user_id, amount, status
       FROM linescout_user_payout_requests
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [id]
    );
    if (!rows?.length) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (rows[0].status !== "approved") {
      return NextResponse.json({ ok: false, error: "Only approved requests can be marked paid" }, { status: 400 });
    }

    const pr = rows[0];
    const userId = Number(pr.user_id || 0);
    const amount = Number(pr.amount || 0);
    if (!userId || amount <= 0) {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "Bad payout request data" }, { status: 500 });
    }

    const [acctRows]: any = await conn.query(
      `SELECT bank_code, account_number, account_name, paystack_ref, verified_at, status
       FROM linescout_user_payout_accounts
       WHERE user_id = ?
       LIMIT 1
       FOR UPDATE`,
      [userId]
    );

    if (!acctRows?.length) {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "No payout account on file" }, { status: 409 });
    }

    const acct = acctRows[0];
    const bankCode = clean(acct.bank_code);
    const accountNumber = clean(acct.account_number);
    const accountName = clean(acct.account_name);
    const paystackRef = clean(acct.paystack_ref);
    const verifiedAt = acct.verified_at;
    const acctStatus = String(acct.status || "");

    const bankVerified = !!verifiedAt || acctStatus === "verified";
    if (!bankVerified) {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "Payout account not verified" }, { status: 409 });
    }
    if (!bankCode || !accountNumber) {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "Payout account details incomplete" }, { status: 409 });
    }

    // DEV ONLY mock
    const mockTransfers =
      process.env.NODE_ENV !== "production" &&
      String(process.env.PAYSTACK_MOCK_TRANSFERS || "") === "1";

    if (mockTransfers) {
      const transferCode = `MOCK_USER_TRF_${id}`;
      const reference = `MOCK_USER_REF_${id}`;

      await conn.query(
        `
        UPDATE linescout_user_payout_requests
        SET
          status = 'paid',
          paid_at = NOW(),
          paid_by_internal_user_id = ?,
          paystack_transfer_code = ?,
          paystack_reference = ?,
          updated_at = NOW()
        WHERE id = ?
          AND status = 'approved'
        LIMIT 1
        `,
        [auth.adminId, transferCode, reference, id]
      );

      await conn.commit();
      return NextResponse.json({ ok: true, mock: true });
    }

    // Ensure transfer recipient exists
    let recipientCode = paystackRef && paystackRef.startsWith("RCP_") ? paystackRef : "";
    if (!recipientCode) {
      const createRecipient = await paystackRequest("https://api.paystack.co/transferrecipient", {
        method: "POST",
        body: {
          type: "nuban",
          name: accountName || `User ${userId}`,
          account_number: accountNumber,
          bank_code: bankCode,
          currency: "NGN",
        },
      });
      recipientCode = String(createRecipient?.data?.recipient_code || "").trim();
      if (!recipientCode) throw new Error("Paystack recipient_code missing");

      await conn.query(
        `UPDATE linescout_user_payout_accounts
         SET paystack_ref = ?, updated_at = NOW()
         WHERE user_id = ?
         LIMIT 1`,
        [recipientCode, userId]
      );
    }

    const transfer = await paystackRequest("https://api.paystack.co/transfer", {
      method: "POST",
      body: {
        source: "balance",
        amount: Math.round(amount * 100),
        recipient: recipientCode,
        reason: `User payout request #${id}`,
      },
    });

    const transferCode = String(transfer?.data?.transfer_code || "").trim();
    const reference = String(transfer?.data?.reference || "").trim();

    await conn.query(
      `UPDATE linescout_user_payout_requests
       SET status = 'paid',
           paid_at = NOW(),
           paid_by_internal_user_id = ?,
           paystack_transfer_code = ?,
           paystack_reference = ?,
           updated_at = NOW()
       WHERE id = ?
         AND status = 'approved'
       LIMIT 1`,
      [auth.adminId, transferCode || null, reference || null, id]
    );

    await conn.commit();

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    try {
      await conn.rollback();
    } catch {}
    const msg = String(e?.message || "Failed to pay user payout");
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  } finally {
    conn.release();
  }
}
