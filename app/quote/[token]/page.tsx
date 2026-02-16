import { Suspense } from "react";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { selectPaymentProvider } from "@/lib/payment-provider";
import QuoteClient from "./QuoteClient";

export default async function QuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token: rawToken } = await params;
  const token = String(rawToken || "").trim();
  if (!token) return notFound();

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `SELECT
         q.*,
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
       LEFT JOIN linescout_handoffs h ON h.id = q.handoff_id
       WHERE q.token = ?
       LIMIT 1`,
      [token]
    );

    if (!rows?.length) return notFound();

    const quote = rows[0];
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

    const exchangeRmb = Number(settings?.exchange_rate_rmb || quote.exchange_rate_rmb || 0);
    const exchangeUsd = Number(settings?.exchange_rate_usd || quote.exchange_rate_usd || 0);
    const markupPercent = Number(settings?.markup_percent || quote.markup_percent || 0);

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
           GROUP BY shipping_type_id
         ) latest ON latest.max_id = r.id
         WHERE r.is_active = 1
         ORDER BY t.name ASC, r.id DESC`
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

    let providerDefault: "paystack" | "providus" = "paystack";
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

    let provider = providerDefault;
    if (providerAllowOverrides) {
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

    return (
      <Suspense fallback={null}>
        <QuoteClient
          token={quote.token}
          customerName={quote.customer_name}
          agentNote={quote.agent_note}
          items={items}
          exchangeRmb={exchangeRmb}
          exchangeUsd={exchangeUsd}
          markupPercent={markupPercent}
          shippingRates={shippingRates}
          defaultShippingTypeId={quote.shipping_type_id}
          depositEnabled={!!quote.deposit_enabled}
          depositPercent={Number(quote.deposit_percent || 0)}
          commitmentDueNgn={Number(quote.commitment_due_ngn || 0)}
          provider={provider}
        />
      </Suspense>
    );
  } finally {
    conn.release();
  }
}
