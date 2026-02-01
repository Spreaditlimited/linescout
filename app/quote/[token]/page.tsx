import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import QuoteClient from "./QuoteClient";

export default async function QuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token: rawToken } = await params;
  const token = String(rawToken || "").trim();
  if (!token) return notFound();

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `SELECT q.*, h.customer_name
       FROM linescout_quotes q
       LEFT JOIN linescout_handoffs h ON h.id = q.handoff_id
       WHERE q.token = ?
       LIMIT 1`,
      [token]
    );

    if (!rows?.length) return notFound();

    const quote = rows[0];
    const items = JSON.parse(quote.items_json || "[]");

    const [settingsRows]: any = await conn.query("SELECT * FROM linescout_settings ORDER BY id DESC LIMIT 1");
    const settings = settingsRows?.[0] || null;

    const exchangeRmb = Number(settings?.exchange_rate_rmb || quote.exchange_rate_rmb || 0);
    const exchangeUsd = Number(settings?.exchange_rate_usd || quote.exchange_rate_usd || 0);
    const markupPercent = Number(settings?.markup_percent || quote.markup_percent || 0);

    const [rateRows]: any = await conn.query(
      `SELECT r.id, r.shipping_type_id, r.rate_value, r.rate_unit, r.currency,
              t.name AS shipping_type_name
       FROM linescout_shipping_rates r
       JOIN linescout_shipping_types t ON t.id = r.shipping_type_id
       WHERE r.is_active = 1
         AND r.id IN (
           SELECT MAX(id)
           FROM linescout_shipping_rates
           WHERE is_active = 1
           GROUP BY shipping_type_id
         )
       ORDER BY t.name ASC, r.id DESC`
    );

    const shippingRates = Array.isArray(rateRows) ? rateRows : [];
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

    return (
      <QuoteClient
        token={quote.token}
        customerName={quote.customer_name}
        items={items}
        exchangeRmb={exchangeRmb}
        exchangeUsd={exchangeUsd}
        markupPercent={markupPercent}
        shippingRates={shippingRates}
        defaultShippingTypeId={quote.shipping_type_id}
      />
    );
  } finally {
    conn.release();
  }
}
