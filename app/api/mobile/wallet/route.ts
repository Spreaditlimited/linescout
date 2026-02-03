import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProvidusConfig, normalizeProvidusBaseUrl, providusHeaders } from "@/lib/providus";
import { paystackAssignDedicatedAccount, paystackCreateCustomer } from "@/lib/paystack";
import { selectPaymentProvider } from "@/lib/payment-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WalletRow = {
  id: number;
  balance: string;
  currency: string;
};

async function ensureWallet(conn: any, userId: number) {
  const [rows]: any = await conn.query(
    `SELECT id, balance, currency FROM linescout_wallets WHERE owner_type = 'user' AND owner_id = ? LIMIT 1`,
    [userId]
  );
  if (rows?.length) return rows[0] as WalletRow;

  await conn.query(
    `INSERT INTO linescout_wallets (owner_type, owner_id, currency, balance, status)
     VALUES ('user', ?, 'NGN', 0, 'active')`,
    [userId]
  );

  const [created]: any = await conn.query(
    `SELECT id, balance, currency FROM linescout_wallets WHERE owner_type = 'user' AND owner_id = ? LIMIT 1`,
    [userId]
  );
  return created?.[0] as WalletRow;
}

async function ensureVirtualAccount(
  conn: any,
  userId: number,
  accountName: string,
  provider: "providus" | "paystack",
  phone: string | null
) {
  const [rows]: any = await conn.query(
    `SELECT account_number, account_name
     FROM linescout_virtual_accounts
     WHERE owner_type = 'user' AND owner_id = ? AND provider = ?
     LIMIT 1`,
    [userId, provider]
  );
  if (rows?.length) return rows[0];

  if (provider === "paystack") {
    const [userRows]: any = await conn.query(
      `SELECT email, display_name FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );
    const email = String(userRows?.[0]?.email || "").trim();
    const displayName = String(userRows?.[0]?.display_name || "").trim();
    const phoneValue = String(phone || "").trim();
    if (!phoneValue) {
      throw new Error("Phone number is required to create a Paystack virtual account.");
    }
    const [firstName, ...rest] = displayName.split(" ");
    const lastName = rest.join(" ");

    const customerRes = await paystackCreateCustomer({
      email,
      first_name: firstName || undefined,
      last_name: lastName || undefined,
      phone: phoneValue,
    });
    if (!customerRes.ok) throw new Error(customerRes.error);

    const customerCode = String(customerRes.data?.customer_code || "").trim();
    if (!customerCode) throw new Error("Paystack customer_code missing");

    const dedicatedRes = await paystackAssignDedicatedAccount({ customer: customerCode });
    if (!dedicatedRes.ok) throw new Error(dedicatedRes.error);

    const accountNumber = String(dedicatedRes.data?.account_number || "").trim();
    const accountNameOut = String(dedicatedRes.data?.account_name || "").trim();
    const bankName = String(dedicatedRes.data?.bank?.name || "").trim();
    const bankCode = String(dedicatedRes.data?.bank?.slug || "").trim();

    if (!accountNumber) throw new Error("Paystack account_number missing");

    await conn.query(
      `INSERT INTO linescout_virtual_accounts
        (owner_type, owner_id, provider, account_number, account_name, bank_name, bank_code, provider_ref, meta_json)
       VALUES ('user', ?, 'paystack', ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        accountNumber,
        accountNameOut || accountName || `User ${userId}`,
        bankName || null,
        bankCode || null,
        customerCode,
        JSON.stringify(dedicatedRes.data || {}),
      ]
    );

    return { account_number: accountNumber, account_name: accountNameOut || accountName };
  }

  const cfg = getProvidusConfig();
  if (!cfg.ok) throw new Error(cfg.error);

  const headers = providusHeaders();
  if (!headers.ok) throw new Error(headers.error);

  const url = `${normalizeProvidusBaseUrl(cfg.baseUrl)}/PiPCreateReservedAccountNumber`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: headers.headers,
      body: JSON.stringify({ account_name: accountName || `User ${userId}`, bvn: "" }),
    });
  } catch (e: any) {
    throw new Error(`Providus fetch failed: ${e?.message || "network error"}`);
  }

  const raw = await res.text().catch(() => "");
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }

  if (!res.ok || !data?.requestSuccessful || !data?.account_number) {
    const msg = data?.responseMessage || raw || `Providus create account failed (${res.status})`;
    throw new Error(`Providus create account failed: ${msg}`);
  }

  await conn.query(
    `INSERT INTO linescout_virtual_accounts
      (owner_type, owner_id, provider, account_number, account_name, bvn, meta_json)
     VALUES ('user', ?, 'providus', ?, ?, ?, ?)`,
    [
      userId,
      String(data.account_number),
      String(data.account_name || accountName || ""),
      String(data.bvn || ""),
      JSON.stringify(data || {}),
    ]
  );

  return { account_number: String(data.account_number), account_name: String(data.account_name || "") };
}

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const conn = await db.getConnection();
    try {
      const [userRows]: any = await conn.query(
        `SELECT display_name, email FROM users WHERE id = ? LIMIT 1`,
        [user.id]
      );
      const displayName = String(userRows?.[0]?.display_name || "").trim();
      const accountName = displayName || (user.email ? user.email.split("@")[0] : `User ${user.id}`);

      const [leadRows]: any = await conn.query(
        `SELECT whatsapp
         FROM linescout_leads
         WHERE email = ?
           AND whatsapp IS NOT NULL
           AND whatsapp <> ''
           AND whatsapp <> 'unknown'
         ORDER BY updated_at DESC, created_at DESC
         LIMIT 1`,
        [user.email]
      );
      let leadPhone = String(leadRows?.[0]?.whatsapp || "").trim();
      if (!leadPhone) {
        const [fallbackRows]: any = await conn.query(
          `SELECT whatsapp
           FROM linescout_leads
           WHERE email = ?
           ORDER BY updated_at DESC, created_at DESC
           LIMIT 1`,
          [user.email]
        );
        leadPhone = String(fallbackRows?.[0]?.whatsapp || "").trim();
      }
      const phone = leadPhone && leadPhone !== "unknown" ? leadPhone : "";

      const wallet = await ensureWallet(conn, user.id);
      const { provider } = await selectPaymentProvider(conn, "user", user.id);
      const vAccount = await ensureVirtualAccount(conn, user.id, accountName, provider, phone || null);

      const [accountRows]: any = await conn.query(
        `SELECT provider, account_number, account_name, bank_name
         FROM linescout_virtual_accounts
         WHERE owner_type = 'user' AND owner_id = ?
         ORDER BY id DESC`,
        [user.id]
      );

      const [txRows]: any = await conn.query(
        `SELECT id, type, amount, currency, reason, reference_type, reference_id, created_at
         FROM linescout_wallet_transactions
         WHERE wallet_id = ?
         ORDER BY id DESC
         LIMIT 30`,
        [wallet.id]
      );

      const [payoutRows]: any = await conn.query(
        `SELECT id, amount, status, rejection_reason, created_at
         FROM linescout_user_payout_requests
         WHERE user_id = ?
         ORDER BY id DESC
         LIMIT 20`,
        [user.id]
      );

      const [bankRows]: any = await conn.query(
        `SELECT bank_code, account_number, status
         FROM linescout_user_payout_accounts
         WHERE user_id = ?
         LIMIT 1`,
        [user.id]
      );

      return NextResponse.json({
        ok: true,
        wallet: { id: wallet.id, balance: wallet.balance, currency: wallet.currency },
        virtual_account: vAccount,
        accounts: accountRows || [],
        provider_used: provider,
        transactions: txRows || [],
        payouts: payoutRows || [],
        payout_account: bankRows?.[0] || null,
      });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    const msg = e?.message || "Unauthorized";
    console.error("GET /api/mobile/wallet error:", msg);
    const status = msg === "Unauthorized" ? 401 : 500;
    if (String(msg).toLowerCase().includes("phone number is required")) {
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
