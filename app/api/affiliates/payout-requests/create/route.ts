import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  ensureAffiliateSettingsColumns,
  ensureAffiliateTables,
  getAffiliateEarningsSnapshot,
  resolveCountryCurrency,
} from "@/lib/affiliates";
import { requireAffiliate } from "@/lib/affiliate-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const affiliate = await requireAffiliate(req);
    const body = await req.json().catch(() => ({}));
    const amount = Number(body?.amount || 0);

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid amount" }, { status: 400 });
    }

    const conn = await db.getConnection();
    try {
      await ensureAffiliateTables(conn);
      await ensureAffiliateSettingsColumns(conn);

      const [settingsRows]: any = await conn.query(
        `
        SELECT affiliate_min_payout_amount, affiliate_min_payout_currency, affiliate_min_payouts_json
        FROM linescout_settings
        ORDER BY id DESC
        LIMIT 1
        `
      );

      const legacyMinAmount = Number(settingsRows?.[0]?.affiliate_min_payout_amount || 0);
      const legacyMinCurrency = String(settingsRows?.[0]?.affiliate_min_payout_currency || "").toUpperCase();
      let minMap: Record<string, number> | null = null;
      const minRaw = settingsRows?.[0]?.affiliate_min_payouts_json;
      if (minRaw) {
        try {
          const parsed = typeof minRaw === "string" ? JSON.parse(minRaw) : minRaw;
          if (parsed && typeof parsed === "object") {
            minMap = {};
            Object.entries(parsed).forEach(([code, value]) => {
              const currency = String(code || "").trim().toUpperCase();
              const amount = Number(value);
              if (!currency || !Number.isFinite(amount)) return;
              minMap![currency] = amount;
            });
          }
        } catch {}
      }

      const resolved = await resolveCountryCurrency(conn, affiliate.country_id || null);
      const payoutCurrency = String(
        resolved?.currency_code || affiliate.payout_currency || legacyMinCurrency || "NGN"
      ).toUpperCase();

      let minAmount = Number.isFinite(minMap?.[payoutCurrency] as number)
        ? Number(minMap?.[payoutCurrency])
        : null;
      if (minAmount == null || !Number.isFinite(minAmount)) {
        if (legacyMinCurrency && legacyMinCurrency === payoutCurrency) {
          minAmount = legacyMinAmount;
        } else {
          minAmount = 0;
        }
      }

      if (Number.isFinite(minAmount) && minAmount > 0 && amount < minAmount) {
        return NextResponse.json(
          { ok: false, error: `Minimum payout is ${minAmount} ${payoutCurrency}` },
          { status: 400 }
        );
      }

      const [acctRows]: any = await conn.query(
        `
        SELECT provider, provider_account, status
        FROM linescout_affiliate_payout_accounts
        WHERE affiliate_id = ?
        LIMIT 1
        `,
        [affiliate.id]
      );

      if (!acctRows?.length) {
        return NextResponse.json({ ok: false, error: "Add a payout account first." }, { status: 409 });
      }

      const acct = acctRows[0];
      const acctStatus = String(acct.status || "");
      if (acctStatus !== "verified") {
        return NextResponse.json({ ok: false, error: "Payout account not verified." }, { status: 409 });
      }

      const earnings = await getAffiliateEarningsSnapshot(conn, affiliate.id);
      const available = Number(earnings?.available || 0);

      if (!Number.isFinite(available) || available <= 0) {
        return NextResponse.json({ ok: false, error: "No available earnings to withdraw yet." }, { status: 400 });
      }

      if (amount > available) {
        return NextResponse.json({ ok: false, error: "Requested amount exceeds your available earnings." }, { status: 400 });
      }

      const [ins]: any = await conn.query(
        `
        INSERT INTO linescout_affiliate_payout_requests
          (affiliate_id, amount, currency, status, requested_note)
        VALUES
          (?, ?, ?, 'pending', ?)
        `,
        [affiliate.id, amount, payoutCurrency, String(body?.note || "").trim() || null]
      );

      return NextResponse.json({ ok: true, payout_request_id: Number(ins.insertId || 0) });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    const msg = e?.message || "Unauthorized";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
