import { notFound } from "next/navigation";
import { db } from "@/lib/db";

function fmtNaira(value: number) {
  if (!Number.isFinite(value)) return "NGN 0";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `NGN ${Math.round(value).toLocaleString()}`;
  }
}

function fmtUsd(value: number) {
  if (!Number.isFinite(value)) return "$0";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `$${value.toFixed(2)}`;
  }
}

function computeTotals(items: any[], exchangeRmb: number, exchangeUsd: number, shippingRateUsd: number, shippingUnit: string, markupPercent: number) {
  let totalProductRmb = 0;
  let totalWeightKg = 0;
  let totalCbm = 0;

  for (const item of items) {
    const qty = Number(item.quantity || 0);
    const unitPrice = Number(item.unit_price_rmb || 0);
    const unitWeight = Number(item.unit_weight_kg || 0);
    const unitCbm = Number(item.unit_cbm || 0);

    totalProductRmb += qty * unitPrice;
    totalWeightKg += qty * unitWeight;
    totalCbm += qty * unitCbm;
  }

  const totalProductNgn = totalProductRmb * exchangeRmb;
  const shippingUnits = shippingUnit === "per_cbm" ? totalCbm : totalWeightKg;
  const totalShippingUsd = shippingUnits * shippingRateUsd;
  const totalShippingNgn = totalShippingUsd * exchangeUsd;
  const totalMarkupNgn = (totalProductNgn * markupPercent) / 100;
  const totalDueNgn = totalProductNgn + totalShippingNgn + totalMarkupNgn;

  return {
    totalProductRmb,
    totalProductNgn,
    totalWeightKg,
    totalCbm,
    totalShippingUsd,
    totalShippingNgn,
    totalMarkupNgn,
    totalDueNgn,
  };
}

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

    let shippingRateUsd = Number(quote.shipping_rate_usd || 0);
    let shippingRateUnit = String(quote.shipping_rate_unit || "per_kg");

    if (quote.shipping_type_id) {
      const [rateRows]: any = await conn.query(
        `SELECT rate_value, rate_unit
         FROM linescout_shipping_rates
         WHERE shipping_type_id = ?
           AND is_active = 1
         ORDER BY id DESC
         LIMIT 1`,
        [quote.shipping_type_id]
      );
      if (rateRows?.length) {
        shippingRateUsd = Number(rateRows[0].rate_value || shippingRateUsd);
        shippingRateUnit = String(rateRows[0].rate_unit || shippingRateUnit);
      }
    }

    const totals = computeTotals(items, exchangeRmb, exchangeUsd, shippingRateUsd, shippingRateUnit, markupPercent);

    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100">
        <div className="mx-auto w-full max-w-3xl px-4 py-10">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-2xl font-semibold">Quote</h1>
                <p className="mt-1 text-sm text-neutral-400">
                  Customer: <span className="text-neutral-200">{quote.customer_name || "Customer"}</span>
                </p>
                <p className="text-xs text-neutral-500">Token: {quote.token}</p>
              </div>
              <div className="text-right">
                <div className="text-xs text-neutral-400">Total due</div>
                <div className="text-2xl font-semibold text-emerald-200">
                  {fmtNaira(totals.totalDueNgn)}
                </div>
              </div>
            </div>

            <div className="mt-6 overflow-x-auto rounded-2xl border border-neutral-800">
              <table className="min-w-full text-sm">
                <thead className="bg-neutral-900/70 text-neutral-300">
                  <tr>
                    <th className="px-4 py-3 text-left">Item</th>
                    <th className="px-4 py-3 text-left">Qty</th>
                    <th className="px-4 py-3 text-left">Unit RMB</th>
                    <th className="px-4 py-3 text-left">Total RMB</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item: any, idx: number) => (
                    <tr key={`${idx}`} className="border-t border-neutral-800">
                      <td className="px-4 py-3 text-neutral-200">{item.product_name}</td>
                      <td className="px-4 py-3 text-neutral-400">{item.quantity}</td>
                      <td className="px-4 py-3 text-neutral-400">{item.unit_price_rmb}</td>
                      <td className="px-4 py-3 text-neutral-200">
                        {Number(item.quantity || 0) * Number(item.unit_price_rmb || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                <div className="text-xs text-neutral-500">Product total (NGN)</div>
                <div className="text-lg font-semibold">{fmtNaira(totals.totalProductNgn)}</div>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                <div className="text-xs text-neutral-500">Shipping (USD)</div>
                <div className="text-lg font-semibold">{fmtUsd(totals.totalShippingUsd)}</div>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                <div className="text-xs text-neutral-500">Shipping (NGN)</div>
                <div className="text-lg font-semibold">{fmtNaira(totals.totalShippingNgn)}</div>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                <div className="text-xs text-neutral-500">Markup (NGN)</div>
                <div className="text-lg font-semibold">{fmtNaira(totals.totalMarkupNgn)}</div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="text-xs text-neutral-500">Total due (NGN)</div>
              <div className="text-xl font-semibold text-emerald-200">
                {fmtNaira(totals.totalDueNgn)}
              </div>
              <p className="mt-2 text-xs text-neutral-500">
                Amounts are recalculated using current rates and settings. Payment link will be attached here once enabled.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  } finally {
    conn.release();
  }
}
