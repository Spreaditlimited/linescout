import { Suspense } from "react";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import crypto from "crypto";
import { db } from "@/lib/db";
import { getFxRate } from "@/lib/fx";
import { resolveCountryCurrency } from "@/lib/country-config";
import { ensureCountryConfig, ensureShippingRateCountryColumn, getNigeriaDefaults } from "@/lib/country-config";
import QuoteClient from "@/app/quote/[token]/QuoteClient";
import { ensureShippingQuoteTables } from "@/lib/shipping-quotes";

export const dynamic = "force-dynamic";

export default async function ShippingQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token: rawToken } = await params;
  const token = String(rawToken || "").trim();
  if (!token) return notFound();

  const conn = await db.getConnection();
  try {
    await ensureCountryConfig(conn);
    await ensureShippingRateCountryColumn(conn);
    await ensureShippingQuoteTables(conn);

    const [rows]: any = await conn.query(
      `SELECT
         q.*,
         c.iso2 AS country_iso2
       FROM linescout_shipping_quotes q
       LEFT JOIN linescout_countries c ON c.id = q.country_id
       WHERE q.token = ?
       LIMIT 1`,
      [token]
    );

    if (!rows?.length) return notFound();

    const quote = rows[0];
    const defaults = await getNigeriaDefaults(conn);
    const quoteCountryId = Number(quote.country_id || defaults.country_id || 0);
    let items: any[] = [];
    try {
      if (Array.isArray(quote.items_json)) {
        items = quote.items_json;
      } else if (typeof quote.items_json === "string") {
        items = JSON.parse(quote.items_json || "[]");
      } else if (quote.items_json && typeof quote.items_json === "object") {
        items = Array.isArray(quote.items_json.items) ? quote.items_json.items : [];
      }
    } catch {
      items = [];
    }

    const [settingsRows]: any = await conn.query("SELECT * FROM linescout_settings ORDER BY id DESC LIMIT 1");
    const settings = settingsRows?.[0] || null;

    const exchangeRmb = (await getFxRate(conn, "RMB", "NGN")) || 0;
    const exchangeUsd = (await getFxRate(conn, "USD", "NGN")) || 0;
    const markupPercent = Number(settings?.markup_percent || quote.markup_percent || 0);

    const resolved = await resolveCountryCurrency(conn, quote.country_id, null);

    let userCurrencyCode = "";
    let userDisplayName = "";
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("linescout_session")?.value || "";
    if (sessionToken) {
      const tokenHash = crypto.createHash("sha256").update(sessionToken).digest("hex");
      const [sessionRows]: any = await conn.query(
        `
        SELECT user_id
        FROM linescout_user_sessions
        WHERE refresh_token_hash = ?
          AND revoked_at IS NULL
          AND expires_at > NOW()
        LIMIT 1
        `,
        [tokenHash]
      );
      const userId = Number(sessionRows?.[0]?.user_id || 0);
      if (userId) {
        const [colRows]: any = await conn.query(
          `
          SELECT COLUMN_NAME
          FROM information_schema.columns
          WHERE table_schema = DATABASE()
            AND table_name = 'users'
            AND column_name IN ('first_name', 'last_name')
          `
        );
        const colSet = new Set((colRows || []).map((r: any) => String(r.COLUMN_NAME || "")));
        const selectCols = [
          "u.display_currency_code",
          "u.display_name",
          colSet.has("first_name") ? "u.first_name" : "NULL AS first_name",
          colSet.has("last_name") ? "u.last_name" : "NULL AS last_name",
          "cur.code AS currency_code",
          "c.settlement_currency_code",
        ];
        const [userRows]: any = await conn.query(
          `
          SELECT ${selectCols.join(", ")}
          FROM users u
          LEFT JOIN linescout_countries c ON c.id = u.country_id
          LEFT JOIN linescout_currencies cur ON cur.id = c.default_currency_id
          WHERE u.id = ?
          LIMIT 1
          `,
          [userId]
        );
        userCurrencyCode = String(
          userRows?.[0]?.display_currency_code ||
            userRows?.[0]?.settlement_currency_code ||
            userRows?.[0]?.currency_code ||
            ""
        ).toUpperCase();
        const fn = String(userRows?.[0]?.first_name || "").trim();
        const ln = String(userRows?.[0]?.last_name || "").trim();
        const fullName = [fn, ln].filter(Boolean).join(" ").trim();
        userDisplayName = String(userRows?.[0]?.display_name || fullName || "").trim();
      }
    }

    const displayCurrencyCode = String(
      userCurrencyCode || resolved?.display_currency_code || "NGN"
    ).toUpperCase();
    const displayFxRate =
      displayCurrencyCode === "NGN" ? 1 : (await getFxRate(conn, "NGN", displayCurrencyCode)) || 0;
    const shippingFxRate =
      displayCurrencyCode === "NGN" ? 0 : (await getFxRate(conn, "USD", displayCurrencyCode)) || 0;
    const productFxRate =
      displayCurrencyCode === "NGN" ? 0 : (await getFxRate(conn, "RMB", displayCurrencyCode)) || 0;

    let shippingRates: any[] = [];
    try {
      const [rateRows]: any = await conn.query(
        `SELECT r.id, r.shipping_type_id, r.rate_value, r.rate_unit, r.currency,
                t.name AS shipping_type_name
         FROM linescout_shipping_rates r
         JOIN linescout_shipping_types t ON t.id = r.shipping_type_id
         JOIN (
           SELECT shipping_type_id, MAX(id) AS max_id
           FROM linescout_shipping_rates
           WHERE is_active = 1
             AND country_id = ?
           GROUP BY shipping_type_id
         ) latest ON latest.max_id = r.id
         WHERE r.is_active = 1
           AND r.country_id = ?
         ORDER BY t.name ASC, r.id DESC`,
        [quoteCountryId, quoteCountryId]
      );
      shippingRates = Array.isArray(rateRows) ? rateRows : [];
    } catch {
      shippingRates = [];
    }
    const quotedRateValue = Number(quote.shipping_rate_usd || 0);
    const quotedRateUnit = String(quote.shipping_rate_unit || "per_kg");
    const quotedShippingTypeId = Number(quote.shipping_type_id || 0);
    if (quotedRateValue > 0) {
      const matchingType = shippingRates.find((rate) => Number(rate.shipping_type_id || 0) === quotedShippingTypeId);
      const hasExactQuotedRate = shippingRates.some(
        (rate) =>
          Number(rate.shipping_type_id || 0) === quotedShippingTypeId &&
          Number(rate.rate_value || 0) === quotedRateValue &&
          String(rate.rate_unit || "per_kg") === quotedRateUnit
      );
      if (!hasExactQuotedRate) {
        shippingRates.unshift({
          id: -1,
          shipping_type_id: quotedShippingTypeId,
          shipping_type_name: matchingType?.shipping_type_name || "Quoted shipping",
          rate_value: quotedRateValue,
          rate_unit: quotedRateUnit,
          currency: "USD",
        });
      }
    }

    return (
      <Suspense fallback={null}>
        <QuoteClient
          token={quote.token}
          customerName={userDisplayName || quote.customer_name}
          customerEmail={quote.email}
          customerPhone={quote.customer_phone}
          agentNote={quote.agent_note}
          items={items}
          exchangeRmb={exchangeRmb}
          exchangeUsd={exchangeUsd}
          markupPercent={markupPercent}
          agentPercent={0}
          lineScoutMarginPercent={0}
          serviceChargePercent={0}
          shippingRates={shippingRates}
          defaultShippingTypeId={quote.shipping_type_id}
          depositEnabled={!!quote.deposit_enabled}
          depositPercent={Number(quote.deposit_percent || 0)}
          commitmentDueNgn={Number(quote.commitment_due_ngn || 0)}
          provider={quote.country_iso2 && String(quote.country_iso2).toUpperCase() !== "NG" ? "paypal" : "paystack"}
          displayCurrencyCode={displayCurrencyCode}
          displayFxRate={displayFxRate}
          shippingFxRate={shippingFxRate}
          productFxRate={productFxRate}
          shippingOnly
          apiBase="/api/shipping-quote"
          verifyApiBase="/api/shipping-quote"
        />
      </Suspense>
    );
  } finally {
    conn.release();
  }
}
