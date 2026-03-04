import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { paypalCreatePayout } from "@/lib/paypal";

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
    const msg = String(data?.message || data?.error || "").trim() || `Paystack error (${res.status})`;
    const e: any = new Error(msg);
    e.status = res.status;
    e.payload = data;
    throw e;
  }

  return data;
}

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

    const [reqRows]: any = await conn.query(
      `
      SELECT id, affiliate_id, amount, currency, status
      FROM linescout_affiliate_payout_requests
      WHERE id = ?
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

    const affiliateId = Number(pr.affiliate_id || 0);
    const amount = Number(pr.amount || 0);
    const currency = String(pr.currency || "").toUpperCase();

    if (!affiliateId || amount <= 0) {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "Bad payout request data" }, { status: 500 });
    }

    const [acctRows]: any = await conn.query(
      `
      SELECT provider, provider_account, status, paystack_ref, meta_json
      FROM linescout_affiliate_payout_accounts
      WHERE affiliate_id = ?
      LIMIT 1
      FOR UPDATE
      `,
      [affiliateId]
    );

    if (!acctRows?.length) {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "No payout account on file" }, { status: 409 });
    }

    const acct = acctRows[0];
    const provider = String(acct.provider || "");
    const acctStatus = String(acct.status || "");
    if (acctStatus !== "verified") {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "Payout account not verified" }, { status: 409 });
    }

    const mockTransfers =
      process.env.NODE_ENV !== "production" && String(process.env.PAYSTACK_MOCK_TRANSFERS || "") === "1";

    if (provider === "paystack") {
      const accountNumber = clean(acct.provider_account);
      const meta = acct.meta_json ? JSON.parse(String(acct.meta_json)) : {};
      const bankCode = clean(meta?.bank_code);
      const accountName = clean(meta?.account_name) || `Affiliate ${affiliateId}`;
      const paystackRef = clean(acct.paystack_ref);

      if (!bankCode || !accountNumber) {
        await conn.rollback();
        return NextResponse.json({ ok: false, error: "Payout account details incomplete" }, { status: 409 });
      }

      if (mockTransfers) {
        const transferCode = `MOCK_TRF_${payoutRequestId}`;
        const reference = `MOCK_REF_${payoutRequestId}`;

        await conn.query(
          `
          UPDATE linescout_affiliate_payout_requests
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

      let recipientCode = paystackRef && paystackRef.startsWith("RCP_") ? paystackRef : "";

      if (!recipientCode) {
        const createRecipient = await paystackRequest("https://api.paystack.co/transferrecipient", {
          method: "POST",
          body: {
            type: "nuban",
            name: accountName || `Affiliate ${affiliateId}`,
            account_number: accountNumber,
            bank_code: bankCode,
            currency: "NGN",
          },
        });

        recipientCode = String(createRecipient?.data?.recipient_code || "").trim();
        if (!recipientCode) {
          throw new Error("Paystack recipient_code missing");
        }

        await conn.query(
          `
          UPDATE linescout_affiliate_payout_accounts
          SET paystack_ref = ?, updated_at = NOW()
          WHERE affiliate_id = ?
          LIMIT 1
          `,
          [recipientCode, affiliateId]
        );
      }

      const transferRes = await paystackRequest("https://api.paystack.co/transfer", {
        method: "POST",
        body: {
          source: "balance",
          amount: Math.round(amount * 100),
          recipient: recipientCode,
          reason: `Affiliate payout #${payoutRequestId}`,
        },
      });

      const transferCode = String(transferRes?.data?.transfer_code || "").trim();
      const reference = String(transferRes?.data?.reference || "").trim();

      if (!transferCode) throw new Error("Paystack transfer_code missing");

      await conn.query(
        `
        UPDATE linescout_affiliate_payout_requests
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
        [auth.adminId, transferCode, reference || null, payoutRequestId]
      );

      await conn.commit();

      return NextResponse.json({
        ok: true,
        payout_request_id: payoutRequestId,
        status: "paid",
        paystack_transfer_code: transferCode,
        paystack_reference: reference,
      });
    }

    if (provider === "paypal") {
      const paypalEmail = clean(acct.provider_account);
      if (!paypalEmail || !paypalEmail.includes("@")) {
        await conn.rollback();
        return NextResponse.json({ ok: false, error: "PayPal email missing" }, { status: 409 });
      }

      const payout = await paypalCreatePayout({
        receiverEmail: paypalEmail,
        amount: amount.toFixed(2),
        currency: currency || "USD",
        note: `Affiliate payout #${payoutRequestId}`,
      });

      await conn.query(
        `
        UPDATE linescout_affiliate_payout_requests
        SET
          status = 'paid',
          paid_at = NOW(),
          paid_by_internal_user_id = ?,
          paypal_payout_id = ?,
          updated_at = NOW()
        WHERE id = ?
          AND status = 'approved'
        LIMIT 1
        `,
        [auth.adminId, payout.payoutId, payoutRequestId]
      );

      await conn.commit();

      return NextResponse.json({
        ok: true,
        payout_request_id: payoutRequestId,
        status: "paid",
        paypal_payout_id: payout.payoutId,
      });
    }

    await conn.rollback();
    return NextResponse.json({ ok: false, error: "Unsupported payout provider" }, { status: 400 });
  } catch (e: any) {
    try {
      await conn.rollback();
    } catch {
      // ignore
    }
    const msg = String(e?.message || "Failed to pay payout request");
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  } finally {
    conn.release();
  }
}

