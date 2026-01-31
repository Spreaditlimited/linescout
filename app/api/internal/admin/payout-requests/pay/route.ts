import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(v: any) {
  return String(v ?? "").trim();
}

async function requirePayAdminSession() {
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
      SELECT
        u.id,
        u.role,
        u.is_active,
        COALESCE(p.can_pay_payouts, 0) AS can_pay_payouts
      FROM internal_sessions s
      JOIN internal_users u ON u.id = s.user_id
      LEFT JOIN internal_user_permissions p ON p.user_id = u.id
      WHERE s.session_token = ?
        AND s.revoked_at IS NULL
      LIMIT 1
      `,
      [token]
    );

    if (!rows?.length) return { ok: false as const, status: 401 as const, error: "Invalid session" };
    if (!rows[0].is_active) return { ok: false as const, status: 403 as const, error: "Account disabled" };

    const role = String(rows[0].role || "");
    if (role !== "admin") return { ok: false as const, status: 403 as const, error: "Forbidden" };

    const canPay = !!rows[0].can_pay_payouts;
    if (!canPay) return { ok: false as const, status: 403 as const, error: "PAY_PERMISSION_REQUIRED" };

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

/**
 * POST /api/internal/admin/payout-requests/pay
 * body: { payout_request_id:number }
 *
 * Rules:
 * - Admin only + must have can_pay_payouts
 * - Request must be approved
 * - Must have verified payout account
 * - Creates transfer recipient if missing, then initiates Paystack transfer
 * - Marks request as paid only after Paystack success
 */
export async function POST(req: Request) {
  const auth = await requirePayAdminSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const payoutRequestId = Number(body?.payout_request_id || 0);

  if (!payoutRequestId) {
    return NextResponse.json({ ok: false, error: "payout_request_id is required" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Lock payout request row
    const [reqRows]: any = await conn.query(
      `
      SELECT
        pr.id,
        pr.internal_user_id,
        pr.amount_kobo,
        pr.currency,
        pr.status,
        pr.requested_note
      FROM linescout_agent_payout_requests pr
      WHERE pr.id = ?
      LIMIT 1
      FOR UPDATE
      `,
      [payoutRequestId]
    );

    if (!reqRows?.length) {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "Payout request not found" }, { status: 404 });
    }

    const pr = reqRows[0];
    const status = String(pr.status || "");
    if (status !== "approved") {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: `Cannot pay a ${status} request` }, { status: 409 });
    }

    const internalUserId = Number(pr.internal_user_id || 0);
    const amountKobo = Number(pr.amount_kobo || 0);
    const currency = String(pr.currency || "NGN");

    if (!internalUserId || amountKobo <= 0) {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "Bad payout request data" }, { status: 500 });
    }

    // Fetch payout account (must be verified)
    const [acctRows]: any = await conn.query(
      `
      SELECT
        bank_code,
        account_number,
        account_name,
        paystack_ref,
        verified_at,
        status
      FROM linescout_agent_payout_accounts
      WHERE internal_user_id = ?
      LIMIT 1
      FOR UPDATE
      `,
      [internalUserId]
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

    // DEV ONLY: allow testing payout flow without hitting Paystack test limits.
    // Enable by setting PAYSTACK_MOCK_TRANSFERS=1 in local env.
    // Never use this in production.
    const mockTransfers =
      process.env.NODE_ENV !== "production" &&
      String(process.env.PAYSTACK_MOCK_TRANSFERS || "") === "1";

    if (mockTransfers) {
      const transferCode = `MOCK_TRF_${payoutRequestId}`;
      const reference = `MOCK_REF_${payoutRequestId}`;

      await conn.query(
        `
        UPDATE linescout_agent_payout_requests
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
        [auth.adminId, transferCode, reference, payoutRequestId]
      );

      await conn.commit();

      return NextResponse.json({
        ok: true,
        payout_request_id: payoutRequestId,
        status: "paid",
        paystack_transfer_code: transferCode,
        paystack_reference: reference,
        mock: true,
      });
    }

    // 1) Ensure transfer recipient exists (store recipient_code in paystack_ref)
    // paystack_ref is supposed to store recipient_code (RCP_xxx).
    // If it doesn't look like one, ignore it and re-create recipient.
    let recipientCode = paystackRef && paystackRef.startsWith("RCP_") ? paystackRef : "";

    if (!recipientCode) {
      const createRecipient = await paystackRequest("https://api.paystack.co/transferrecipient", {
        method: "POST",
        body: {
          type: "nuban",
          name: accountName || `Agent ${internalUserId}`,
          account_number: accountNumber,
          bank_code: bankCode,
          // NOTE: omit currency in test mode to avoid "cannot resolve account" edge-cases
        },
      });

      recipientCode = clean(createRecipient?.data?.recipient_code);

      if (!recipientCode) {
        await conn.rollback();
        return NextResponse.json({ ok: false, error: "Paystack recipient creation failed" }, { status: 502 });
      }

      await conn.query(
        `
        UPDATE linescout_agent_payout_accounts
        SET paystack_ref = ?, updated_at = NOW()
        WHERE internal_user_id = ?
        LIMIT 1
        `,
        [recipientCode, internalUserId]
      );
    }

    // 2) Initiate transfer
    const reason = clean(pr.requested_note) || `Payout request #${payoutRequestId}`;

    const transfer = await paystackRequest("https://api.paystack.co/transfer", {
      method: "POST",
      body: {
        source: "balance",
        amount: amountKobo,
        recipient: recipientCode,
        reason,
      },
    });

    const transferCode = clean(transfer?.data?.transfer_code);
    const reference = clean(transfer?.data?.reference);

    if (!transferCode && !reference) {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "Paystack transfer did not return identifiers" }, { status: 502 });
    }

    // Mark paid (audit)
    await conn.query(
      `
      UPDATE linescout_agent_payout_requests
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
      [auth.adminId, transferCode || null, reference || null, payoutRequestId]
    );

    await conn.commit();

    return NextResponse.json({
      ok: true,
      payout_request_id: payoutRequestId,
      status: "paid",
      paystack_transfer_code: transferCode || null,
      paystack_reference: reference || null,
    });
  } catch (e: any) {
    try { await conn.rollback(); } catch {}

    const msg = String(e?.message || "Failed to pay payout request");
    console.error("POST /api/internal/admin/payout-requests/pay error:", msg);

    return NextResponse.json(
      { ok: false, error: msg },
      { status: Number(e?.status) || 500 }
    );
  } finally {
    conn.release();
  }
}