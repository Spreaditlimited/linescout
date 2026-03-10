import { Suspense } from "react";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import crypto from "crypto";
import { db } from "@/lib/db";
import { getFxRate } from "@/lib/fx";
import { resolveCountryCurrency } from "@/lib/country-config";
import { ensureCountryConfig, ensureShippingRateCountryColumn, getNigeriaDefaults } from "@/lib/country-config";
import { selectPaymentProvider } from "@/lib/payment-provider";
import { ensureQuotePaymentProviderTable, resolveQuotePaymentProvider } from "@/lib/quote-payment-provider";
import { getQuoteAddonLines } from "@/lib/quote-addons";
import QuoteClient from "./QuoteClient";

export const dynamic = "force-dynamic";

export default async function QuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token: rawToken } = await params;
  const token = String(rawToken || "").trim();
  if (!token) return notFound();

  const conn = await db.getConnection();
  try {
    await ensureCountryConfig(conn);
    await ensureShippingRateCountryColumn(conn);
    const [rows]: any = await conn.query(
      `SELECT
         q.*,
         c.iso2 AS country_iso2,
         h.email AS handoff_email,
         COALESCE(
           NULLIF(TRIM(h.customer_name), ''),
           NULLIF(
             TRIM((
               SELECT l.name
               FROM linescout_conversations c2
               JOIN users u2 ON u2.id = c2.user_id
               LEFT JOIN linescout_leads l ON l.email = u2.email
               WHERE c2.handoff_id = h.id
               ORDER BY l.created_at DESC, l.id DESC
               LIMIT 1
             )),
             ''
           ),
           NULLIF(
             TRIM((
               SELECT u2.display_name
               FROM linescout_conversations c2
               JOIN users u2 ON u2.id = c2.user_id
               WHERE c2.handoff_id = h.id
               ORDER BY c2.id DESC
               LIMIT 1
             )),
             ''
           ),
           'Customer'
         ) AS customer_name
       FROM linescout_quotes q
       LEFT JOIN linescout_countries c ON c.id = q.country_id
       LEFT JOIN linescout_handoffs h ON h.id = q.handoff_id
       WHERE q.token = ?
       LIMIT 1`,
      [token]
    );

    if (!rows?.length) return notFound();

    const quote = rows[0];
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
          "u.display_name",
          colSet.has("first_name") ? "u.first_name" : "NULL AS first_name",
          colSet.has("last_name") ? "u.last_name" : "NULL AS last_name",
        ];
        const [userRows]: any = await conn.query(
          `
          SELECT ${selectCols.join(", ")}
          FROM users u
          WHERE u.id = ?
          LIMIT 1
          `,
          [userId]
        );
        const fn = String(userRows?.[0]?.first_name || "").trim();
        const ln = String(userRows?.[0]?.last_name || "").trim();
        const fullName = [fn, ln].filter(Boolean).join(" ").trim();
        userDisplayName = String(userRows?.[0]?.display_name || fullName || "").trim();
      }
    }
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
    const resolved = await resolveCountryCurrency(conn, quote.country_id, null);
    const displayCurrencyCode = String(resolved?.display_currency_code || "NGN").toUpperCase();
    const markupPercent = Number(settings?.markup_percent || quote.markup_percent || 0);
    const agentPercent = Number(quote.agent_percent || settings?.agent_percent || 0);
    const lineScoutMarginPercent = Math.max(0, markupPercent - agentPercent);
    const rawService = quote.service_charge_percent;
    const parsedService = Number(rawService);
    const fallbackService =
      rawService == null || rawService === "" || !Number.isFinite(parsedService)
        ? lineScoutMarginPercent
        : parsedService;
    const serviceChargePercent =
      displayCurrencyCode === "NGN"
        ? 0
        : Math.max(0, Math.min(fallbackService, lineScoutMarginPercent));
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
    if (!shippingRates.length && Number(quote.shipping_rate_usd || 0) > 0) {
      shippingRates.push({
        id: 0,
        shipping_type_id: Number(quote.shipping_type_id || 0),
        shipping_type_name: "Shipping",
        rate_value: Number(quote.shipping_rate_usd || 0),
        rate_unit: String(quote.shipping_rate_unit || "per_kg"),
        currency: "USD",
      });
    }

    let providerDefault: "paystack" | "providus" | "paypal" = "paystack";
    let providerAllowOverrides = true;
    const [providerRows]: any = await conn.query(
      `SELECT provider_default, allow_overrides
       FROM linescout_payment_settings
       ORDER BY id DESC
       LIMIT 1`
    );
    if (providerRows?.length) {
      const raw = String(providerRows[0]?.provider_default || "").trim().toLowerCase();
      if (raw === "paystack" || raw === "providus") providerDefault = raw;
      if (providerRows[0]?.allow_overrides != null) {
        providerAllowOverrides = !!providerRows[0]?.allow_overrides;
      }
    }

    let provider: "paystack" | "providus" | "paypal" = providerDefault;
    const countryIso2 = String(quote.country_iso2 || "").toUpperCase();
    if (countryIso2 && countryIso2 !== "NG") {
      await ensureQuotePaymentProviderTable(conn);
      const mapped = await resolveQuotePaymentProvider(conn, quote.country_id);
      provider = "paypal";
    } else if (providerAllowOverrides) {
      const email = String(quote.handoff_email || quote.email || "").trim().toLowerCase();
      if (email) {
        const [userRows]: any = await conn.query(
          `SELECT id
           FROM users
           WHERE email_normalized = ? OR email = ?
           LIMIT 1`,
          [email, email]
        );
        const userId = Number(userRows?.[0]?.id || 0);
        if (userId) {
          const selected = await selectPaymentProvider(conn, "user", userId);
          if (selected?.provider) provider = selected.provider;
        }
      }
    }

    const addonLines = await getQuoteAddonLines(conn, Number(quote.id || 0));

    return (
      <Suspense fallback={null}>
        <QuoteClient
          token={quote.token}
          customerName={userDisplayName || quote.customer_name}
          agentNote={quote.agent_note}
          items={items}
          addonLines={addonLines}
          totalAddonsNgn={Number(quote.total_addons_ngn || 0)}
          totalVatNgn={Number(quote.total_vat_ngn || 0)}
          vatRatePercent={Number(quote.vat_rate_percent || 0)}
          exchangeRmb={exchangeRmb}
          exchangeUsd={exchangeUsd}
          markupPercent={markupPercent}
          agentPercent={agentPercent}
          lineScoutMarginPercent={lineScoutMarginPercent}
          serviceChargePercent={serviceChargePercent}
          shippingRates={shippingRates}
          defaultShippingTypeId={quote.shipping_type_id}
          depositEnabled={!!quote.deposit_enabled}
          depositPercent={Number(quote.deposit_percent || 0)}
          commitmentDueNgn={Number(quote.commitment_due_ngn || 0)}
          provider={provider}
          displayCurrencyCode={displayCurrencyCode}
          displayFxRate={displayFxRate}
          shippingFxRate={shippingFxRate}
          productFxRate={productFxRate}
        />
      </Suspense>
    );
  } finally {
    conn.release();
  }
}
