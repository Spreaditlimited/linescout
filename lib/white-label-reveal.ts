import type { PoolConnection } from "mysql2/promise";
import { ensureWhiteLabelSettings, ensureWhiteLabelUserColumns } from "@/lib/white-label-access";
import { refreshKeepaProducts } from "@/lib/keepa-refresh";
import { ensureWhiteLabelProductsReady } from "@/lib/white-label-products";

type RevealResult =
  | {
      ok: true;
      product: any;
      reveal_limit: number;
      reveals_used: number;
      reveals_left: number;
      display: {
        marketplace: "UK" | "CA" | null;
        currency: "GBP" | "CAD" | null;
        price_low: number | null;
        price_high: number | null;
        note?: string | null;
      };
    }
  | { ok: false; error: string; code?: string };

function toInt(value: any, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

export async function revealWhiteLabelAmazonPrice(conn: PoolConnection, userId: number, productId: number): Promise<RevealResult> {
  await ensureWhiteLabelProductsReady(conn);
  await ensureWhiteLabelSettings(conn);
  await ensureWhiteLabelUserColumns(conn);

  const [[settingsRow]]: any = await conn.query(
    `SELECT white_label_trial_days, white_label_daily_reveals, white_label_subscription_countries
     FROM linescout_settings
     ORDER BY id DESC LIMIT 1`
  );
  const trialDays = toInt(settingsRow?.white_label_trial_days, 3);
  const dailyLimit = Math.max(1, toInt(settingsRow?.white_label_daily_reveals, 10));
  const allowedCountries = String(settingsRow?.white_label_subscription_countries || "GB,CA")
    .split(",")
    .map((c: string) => c.trim().toUpperCase())
    .filter(Boolean)
    .map((c: string) => (c === "UK" ? "GB" : c));
  const allowedSet = new Set(allowedCountries);

  const [[userRow]]: any = await conn.query(
    `SELECT u.id, u.white_label_trial_ends_at, u.white_label_plan, u.white_label_subscription_status,
            u.white_label_reveals_used, u.white_label_reveals_date,
            c.iso2 AS country_iso2,
            cur.code AS currency_code
     FROM users u
     LEFT JOIN linescout_countries c ON c.id = u.country_id
     LEFT JOIN linescout_currencies cur ON cur.id = c.default_currency_id
     WHERE u.id = ?
     LIMIT 1`,
    [userId]
  );

  if (!userRow?.id) return { ok: false, error: "User not found" };
  const userCountry = String(userRow?.country_iso2 || "").trim().toUpperCase();
  if (userCountry && !allowedSet.has(userCountry)) {
    return { ok: false, code: "subscription_unavailable", error: "Amazon comparison is not available in your country." };
  }

  const now = new Date();
  let trialEnds = userRow.white_label_trial_ends_at ? new Date(userRow.white_label_trial_ends_at) : null;
  if (!trialEnds && trialDays > 0) {
    const next = new Date();
    next.setDate(next.getDate() + trialDays);
    trialEnds = next;
    await conn.query(
      `UPDATE users SET white_label_trial_ends_at = ? WHERE id = ? LIMIT 1`,
      [trialEnds, userId]
    );
  }

  const plan = String(userRow.white_label_plan || "").toLowerCase();
  const status = String(userRow.white_label_subscription_status || "").toLowerCase();
  const subscriptionActive = plan === "paid" && status === "active";
  const trialActive = trialEnds ? now <= trialEnds : false;
  if (!subscriptionActive && !trialActive) {
    return { ok: false, code: "subscription_required", error: "Subscription required" };
  }

  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const revealsDate = userRow.white_label_reveals_date
    ? String(userRow.white_label_reveals_date).slice(0, 10)
    : null;
  let revealsUsed = Number(userRow.white_label_reveals_used || 0);
  if (revealsDate !== todayKey) {
    revealsUsed = 0;
    await conn.query(
      `UPDATE users SET white_label_reveals_date = ?, white_label_reveals_used = 0 WHERE id = ? LIMIT 1`,
      [todayKey, userId]
    );
  }

  if (revealsUsed >= dailyLimit) {
    return {
      ok: false,
      code: "limit_reached",
      error: "Daily reveal limit reached",
    };
  }

  const [[productRow]]: any = await conn.query(
    `SELECT id, product_name, category, amazon_uk_asin, amazon_ca_asin
     FROM linescout_white_label_products
     WHERE id = ?
     LIMIT 1`,
    [productId]
  );
  if (!productRow?.id) return { ok: false, error: "Product not found" };

  const refresh = await refreshKeepaProducts(conn, [productRow], {
    allowSearch: true,
    marketplaces: ["UK", "CA"],
    maxProducts: 1,
  });
  if (refresh.errors > 0 && refresh.updated === 0) {
    return { ok: false, error: refresh.lastError || "Keepa refresh failed" };
  }

  await conn.query(
    `UPDATE users SET white_label_reveals_used = white_label_reveals_used + 1 WHERE id = ? LIMIT 1`,
    [userId]
  );
  revealsUsed += 1;

  const [[updatedRow]]: any = await conn.query(
    `SELECT id, product_name, category,
            amazon_uk_asin, amazon_uk_url, amazon_uk_currency, amazon_uk_price_low, amazon_uk_price_high, amazon_uk_last_checked_at,
            amazon_ca_asin, amazon_ca_url, amazon_ca_currency, amazon_ca_price_low, amazon_ca_price_high, amazon_ca_last_checked_at
     FROM linescout_white_label_products
     WHERE id = ?
     LIMIT 1`,
    [productId]
  );

  const userCurrency = String(userRow?.currency_code || "").toUpperCase();
  const displayCurrency = userCurrency === "CAD" ? "CAD" : "GBP";
  const ukLow = updatedRow?.amazon_uk_price_low != null ? Number(updatedRow.amazon_uk_price_low) : null;
  const ukHigh = updatedRow?.amazon_uk_price_high != null ? Number(updatedRow.amazon_uk_price_high) : null;
  const caLow = updatedRow?.amazon_ca_price_low != null ? Number(updatedRow.amazon_ca_price_low) : null;
  const caHigh = updatedRow?.amazon_ca_price_high != null ? Number(updatedRow.amazon_ca_price_high) : null;
  const hasUk = Number.isFinite(ukLow) || Number.isFinite(ukHigh);
  const hasCa = Number.isFinite(caLow) || Number.isFinite(caHigh);
  const useCa = displayCurrency === "CAD" && hasCa;
  const useUk = !useCa && hasUk;

  return {
    ok: true,
    product: updatedRow,
    reveal_limit: dailyLimit,
    reveals_used: revealsUsed,
    reveals_left: Math.max(0, dailyLimit - revealsUsed),
    display: {
      marketplace: useCa ? "CA" : useUk ? "UK" : null,
      currency: useCa ? "CAD" : useUk ? "GBP" : null,
      price_low: useCa ? caLow : useUk ? ukLow : null,
      price_high: useCa ? caHigh : useUk ? ukHigh : null,
      note:
        displayCurrency === "CAD" && !hasCa && hasUk
          ? "Amazon CA price not available at this time for this product."
          : null,
    },
  };
}
