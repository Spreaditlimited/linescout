import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPaystackSignature } from "@/lib/paystack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toNaira(amount: any) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  return Math.round(n / 100);
}

function pickAccountNumber(data: any) {
  const candidates = [
    data?.dedicated_account?.account_number,
    data?.authorization?.account_number,
    data?.metadata?.account_number,
    data?.metadata?.dedicated_account?.account_number,
  ];
  for (const c of candidates) {
    const s = String(c || "").trim();
    if (s) return s;
  }
  return null;
}

function pickCustomerCode(data: any) {
  const candidates = [
    data?.customer?.customer_code,
    data?.customer?.id,
    data?.metadata?.customer_code,
  ];
  for (const c of candidates) {
    const s = String(c || "").trim();
    if (s) return s;
  }
  return null;
}

export async function POST(req: Request) {
  const rawBody = await req.text().catch(() => "");
  const signature = req.headers.get("x-paystack-signature") || "";

  const sig = verifyPaystackSignature(rawBody, signature);
  if (!sig.ok) {
    return NextResponse.json({ ok: false, error: sig.error }, { status: 500 });
  }
  if (!sig.valid) {
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
  }

  let payload: any = null;
  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    payload = null;
  }

  const event = String(payload?.event || "").trim();
  const data = payload?.data || {};

  if (event !== "charge.success") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const reference = String(data?.reference || data?.transaction_reference || data?.id || "").trim();
  const amountNgn = toNaira(data?.amount);
  const currency = String(data?.currency || "NGN").trim().toUpperCase();
  const accountNumber = pickAccountNumber(data);
  const customerCode = pickCustomerCode(data);

  if (!amountNgn || amountNgn <= 0) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    if (reference) {
      const [dupRows]: any = await conn.query(
        `SELECT id FROM linescout_provider_transactions WHERE provider = 'paystack' AND reference = ? LIMIT 1`,
        [reference]
      );
      if (dupRows?.length) {
        await conn.rollback();
        return NextResponse.json({ ok: true, duplicate: true });
      }
    }

    let virtualAccount: any = null;
    if (accountNumber) {
      const [rows]: any = await conn.query(
        `SELECT id, owner_type, owner_id
         FROM linescout_virtual_accounts
         WHERE provider = 'paystack' AND account_number = ?
         LIMIT 1`,
        [accountNumber]
      );
      virtualAccount = rows?.[0] || null;
    }

    if (!virtualAccount && customerCode) {
      const [rows]: any = await conn.query(
        `SELECT id, owner_type, owner_id
         FROM linescout_virtual_accounts
         WHERE provider = 'paystack' AND provider_ref = ?
         LIMIT 1`,
        [customerCode]
      );
      virtualAccount = rows?.[0] || null;
    }

    if (!virtualAccount) {
      await conn.rollback();
      return NextResponse.json({ ok: true, ignored: true, error: "No matching virtual account" });
    }

    const ownerType = String(virtualAccount.owner_type || "");
    const ownerId = Number(virtualAccount.owner_id || 0);

    const [walletRows]: any = await conn.query(
      `SELECT id, balance FROM linescout_wallets WHERE owner_type = ? AND owner_id = ? LIMIT 1`,
      [ownerType, ownerId]
    );

    if (!walletRows?.length) {
      await conn.query(
        `INSERT INTO linescout_wallets (owner_type, owner_id, currency, balance, status)
         VALUES (?, ?, 'NGN', 0, 'active')`,
        [ownerType, ownerId]
      );
    }

    const [walletFinal]: any = await conn.query(
      `SELECT id, balance FROM linescout_wallets WHERE owner_type = ? AND owner_id = ? LIMIT 1`,
      [ownerType, ownerId]
    );

    const walletId = Number(walletFinal[0].id);
    const currentBalance = Number(walletFinal[0].balance || 0);
    const nextBalance = currentBalance + amountNgn;

    await conn.query(
      `INSERT INTO linescout_provider_transactions
        (provider, reference, amount, currency, status, raw_json)
       VALUES ('paystack', ?, ?, ?, 'received', ?)`,
      [reference || null, amountNgn, currency || "NGN", rawBody || null]
    );

    await conn.query(
      `INSERT INTO linescout_wallet_transactions
        (wallet_id, type, amount, currency, reason, reference_type, reference_id)
       VALUES (?, 'credit', ?, ?, 'paystack_deposit', 'paystack', ?)`,
      [walletId, amountNgn, currency || "NGN", reference || null]
    );

    await conn.query(`UPDATE linescout_wallets SET balance = ?, updated_at = NOW() WHERE id = ?`, [
      nextBalance,
      walletId,
    ]);

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
