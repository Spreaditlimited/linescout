import { NextResponse } from "next/server";
import { headers } from "next/headers";
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

async function requireInternalAgent() {
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
  if (!token) return { ok: false as const, status: 401 as const, error: "Unauthorized" };

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `SELECT u.id, u.role, u.is_active
       FROM internal_sessions s
       JOIN internal_users u ON u.id = s.user_id
       WHERE s.session_token = ?
         AND s.revoked_at IS NULL
         AND u.is_active = 1
       LIMIT 1`,
      [token]
    );

    if (!rows?.length) return { ok: false as const, status: 401 as const, error: "Unauthorized" };

    const role = String(rows[0].role || "");
    if (role !== "agent") return { ok: false as const, status: 403 as const, error: "Forbidden" };

    return { ok: true as const, id: Number(rows[0].id) };
  } finally {
    conn.release();
  }
}

async function ensureWallet(conn: any, agentId: number) {
  const [rows]: any = await conn.query(
    `SELECT id, balance, currency FROM linescout_wallets WHERE owner_type = 'agent' AND owner_id = ? LIMIT 1`,
    [agentId]
  );
  if (rows?.length) return rows[0] as WalletRow;

  await conn.query(
    `INSERT INTO linescout_wallets (owner_type, owner_id, currency, balance, status)
     VALUES ('agent', ?, 'NGN', 0, 'active')`,
    [agentId]
  );

  const [created]: any = await conn.query(
    `SELECT id, balance, currency FROM linescout_wallets WHERE owner_type = 'agent' AND owner_id = ? LIMIT 1`,
    [agentId]
  );
  return created?.[0] as WalletRow;
}

async function ensureVirtualAccount(
  conn: any,
  agentId: number,
  accountName: string,
  provider: "providus" | "paystack",
  profile: { email: string; first_name: string; last_name: string; phone?: string }
) {
  const [rows]: any = await conn.query(
    `SELECT account_number, account_name
     FROM linescout_virtual_accounts
     WHERE owner_type = 'agent' AND owner_id = ? AND provider = ?
     LIMIT 1`,
    [agentId, provider]
  );
  if (rows?.length) return rows[0];

  if (provider === "paystack") {
    const phoneValue = String(profile?.phone || "").trim();
    if (!phoneValue) {
      throw new Error("Phone number is required to create a Paystack virtual account.");
    }

    const customerRes = await paystackCreateCustomer({
      email: profile.email,
      first_name: profile.first_name || undefined,
      last_name: profile.last_name || undefined,
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
       VALUES ('agent', ?, 'paystack', ?, ?, ?, ?, ?, ?)`,
      [
        agentId,
        accountNumber,
        accountNameOut || accountName || `Agent ${agentId}`,
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
  const res = await fetch(url, {
    method: "POST",
    headers: headers.headers,
    body: JSON.stringify({ account_name: accountName || `Agent ${agentId}`, bvn: "" }),
  });
  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.requestSuccessful || !data?.account_number) {
    const msg = data?.responseMessage || `Providus create account failed (${res.status})`;
    throw new Error(msg);
  }

  await conn.query(
    `INSERT INTO linescout_virtual_accounts
      (owner_type, owner_id, provider, account_number, account_name, bvn, meta_json)
     VALUES ('agent', ?, 'providus', ?, ?, ?, ?)`,
    [
      agentId,
      String(data.account_number),
      String(data.account_name || accountName || ""),
      String(data.bvn || ""),
      JSON.stringify(data || {}),
    ]
  );

  return { account_number: String(data.account_number), account_name: String(data.account_name || "") };
}

export async function GET() {
  try {
    const auth = await requireInternalAgent();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const conn = await db.getConnection();
    try {
      const [profileRows]: any = await conn.query(
        `SELECT first_name, last_name, email, ng_phone
         FROM linescout_agent_profiles
         WHERE internal_user_id = ?
         LIMIT 1`,
        [auth.id]
      );
      const first = String(profileRows?.[0]?.first_name || "").trim();
      const last = String(profileRows?.[0]?.last_name || "").trim();
      const email = String(profileRows?.[0]?.email || "").trim();
      const phone = String(profileRows?.[0]?.ng_phone || "").trim();
      const accountName = `${first} ${last}`.trim() || email || `Agent ${auth.id}`;

      const wallet = await ensureWallet(conn, auth.id);
      const { provider } = await selectPaymentProvider(conn, "agent", auth.id);
      const vAccount = await ensureVirtualAccount(conn, auth.id, accountName, provider, {
        email,
        first_name: first,
        last_name: last,
        phone,
      });

      const [accountRows]: any = await conn.query(
        `SELECT provider, account_number, account_name, bank_name
         FROM linescout_virtual_accounts
         WHERE owner_type = 'agent' AND owner_id = ?
         ORDER BY id DESC`,
        [auth.id]
      );

      const [txRows]: any = await conn.query(
        `SELECT id, type, amount, currency, reason, reference_type, reference_id, created_at
         FROM linescout_wallet_transactions
         WHERE wallet_id = ?
         ORDER BY id DESC
         LIMIT 30`,
        [wallet.id]
      );

      return NextResponse.json({
        ok: true,
        wallet: { id: wallet.id, balance: wallet.balance, currency: wallet.currency },
        virtual_account: vAccount,
        accounts: accountRows || [],
        provider_used: provider,
        transactions: txRows || [],
      });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    const msg = e?.message || "Unauthorized";
    const status = msg === "Unauthorized" ? 401 : 500;
    if (String(msg).toLowerCase().includes("phone number is required")) {
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
