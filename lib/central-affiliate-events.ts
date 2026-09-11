/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import { db } from "@/lib/db";
import { getHistoricalUsdRate } from "@/lib/fx";

export type CentralAffiliateEvent = {
  eventId: string;
  eventType: "REFERRAL_CLAIMED" | "PAYMENT_STATUS_CHANGED";
  occurredAt: string;
  customerReference: string;
  referralCode?: string | null;
  payment?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export async function enqueueCentralAffiliateEvent(conn: PoolConnection, event: CentralAffiliateEvent) {
  const payload = JSON.stringify(event);
  await conn.query(
    `INSERT INTO linescout_affiliate_event_outbox
      (event_id, event_type, aggregate_key, payload_json, status, next_attempt_at)
     VALUES (?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE event_id = event_id`,
    [event.eventId, event.eventType, event.customerReference, payload],
  );
}

function endpoint() {
  return (process.env.SUREIMPORTS_LEDGER_ENDPOINT || "https://www.sureimports.com/api/internal/payments/linescout").trim();
}

export async function drainCentralAffiliateOutbox(limit = 50) {
  const secret = process.env.LINESCOUT_LEDGER_SECRET?.trim();
  if (!secret) throw new Error("LINESCOUT_LEDGER_SECRET is not configured.");
  const conn = await db.getConnection();
  let delivered = 0;
  let failed = 0;
  try {
    const [rows]: any = await conn.query(
      `SELECT id, event_id, payload_json
       FROM linescout_affiliate_event_outbox
       WHERE status IN ('pending', 'failed') AND next_attempt_at <= CURRENT_TIMESTAMP
       ORDER BY id ASC LIMIT ?`,
      [Math.max(1, Math.min(100, limit))],
    );
    for (const row of rows || []) {
      const payload = typeof row.payload_json === "string" ? row.payload_json : JSON.stringify(row.payload_json);
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = crypto.createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
      try {
        const response = await fetch(endpoint(), {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-sureimports-timestamp": timestamp,
            "x-sureimports-signature": signature,
          },
          body: payload,
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) throw new Error(`Central ledger returned ${response.status}.`);
        await conn.query(
          `UPDATE linescout_affiliate_event_outbox SET status = 'delivered', delivered_at = CURRENT_TIMESTAMP, last_error = NULL WHERE id = ?`,
          [row.id],
        );
        delivered += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 500) : "Delivery failed.";
        await conn.query(
          `UPDATE linescout_affiliate_event_outbox
           SET status = 'failed', attempts = attempts + 1, last_error = ?,
               next_attempt_at = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL LEAST(60, POW(2, LEAST(attempts, 5))) MINUTE)
           WHERE id = ?`,
          [message, row.id],
        );
        failed += 1;
      }
    }
  } finally {
    conn.release();
  }
  return { delivered, failed };
}

function centralStatus(value: unknown) {
  const status = String(value || "").trim().toLowerCase();
  if (["paid", "verified", "success", "successful", "completed"].includes(status)) return "COMPLETED";
  if (["refunded", "reversed", "disputed", "chargeback"].includes(status)) return status.toUpperCase();
  if (["failed", "cancelled", "canceled"].includes(status)) return "FAILED";
  return "PENDING";
}

async function usdSettlement(conn: PoolConnection, currencyValue: unknown, amountValue: unknown, occurredAt: Date) {
  const currency = String(currencyValue || "NGN").trim().toUpperCase();
  const amount = Number(amountValue || 0);
  if (currency === "NGN") return { settlementCurrency: "NGN", settlementAmount: amount, fxRate: 1, fxSource: "IDENTITY", fxCapturedAt: new Date().toISOString() };
  if (currency === "USD") return { settlementCurrency: "USD", settlementAmount: amount, fxRate: 1, fxSource: "IDENTITY", fxCapturedAt: new Date().toISOString() };
  const snapshot = await getHistoricalUsdRate(conn, currency, occurredAt);
  const fxRate = snapshot?.rate || null;
  return { settlementCurrency: "USD", settlementAmount: fxRate ? Number((amount * fxRate).toFixed(2)) : null, fxRate, fxSource: snapshot?.source || null, fxCapturedAt: fxRate ? new Date().toISOString() : null };
}

export async function reconcileLineScoutPaymentEvents(limit = 500) {
  const conn = await db.getConnection();
  let queued = 0;
  try {
    const statusSql = `CASE
      WHEN LOWER(p.status) IN ('paid','verified','success','successful','completed') THEN 'COMPLETED'
      WHEN LOWER(p.status) IN ('refunded','reversed','disputed','chargeback') THEN UPPER(p.status)
      WHEN LOWER(p.status) IN ('failed','cancelled','canceled') THEN 'FAILED'
      ELSE 'PENDING' END`;
    const referralSql = (userExpression: string) => `COALESCE(
      (SELECT cr.referral_code FROM linescout_central_affiliate_referrals cr WHERE cr.referred_user_id = ${userExpression} LIMIT 1),
      (SELECT a.referral_code FROM linescout_affiliate_referrals ar JOIN linescout_affiliates a ON a.id = ar.affiliate_id WHERE ar.referred_user_id = ${userExpression} LIMIT 1)
    )`;
    const [quotePayments]: any = await conn.query(
      `SELECT p.*, q.shipping_actual_rate_unit, q.shipping_actual_weight_kg, q.shipping_actual_cbm,
              COALESCE(c.name, 'NIGERIA') AS destination_country, COALESCE(st.name, 'AIR') AS shipping_mode,
              COALESCE(p.user_id, u.id) AS ledger_user_id,
              ${referralSql('COALESCE(p.user_id, u.id)')} AS referral_code
       FROM linescout_quote_payments p
       JOIN linescout_quotes q ON q.id = p.quote_id
       LEFT JOIN linescout_handoffs h ON h.id = p.handoff_id
       LEFT JOIN users u ON u.email_normalized = LOWER(h.email)
       LEFT JOIN linescout_countries c ON c.id = q.country_id
       LEFT JOIN linescout_shipping_types st ON st.id = p.shipping_type_id
       LEFT JOIN linescout_affiliate_event_outbox o
         ON o.event_id COLLATE utf8mb4_unicode_ci = CONCAT('linescout:sync:linescout_quote_payments:', p.id, ':', ${statusSql}) COLLATE utf8mb4_unicode_ci
       WHERE o.id IS NULL
       ORDER BY p.id ASC LIMIT ?`, [limit]
    );
    for (const row of quotePayments || []) {
      const purpose = String(row.purpose || "").toLowerCase() === "shipping_payment" ? "SHIPPING_PAYMENT" : "PROJECT_PAYMENT";
      const billingUnit = String(row.shipping_actual_rate_unit || "").toLowerCase() === "per_cbm" ? "CBM" : "KG";
      const quantity = Number(billingUnit === "CBM" ? row.shipping_actual_cbm : row.shipping_actual_weight_kg) || null;
      const eventStatus = centralStatus(row.status);
      const occurredAt = new Date(row.paid_at || row.created_at || Date.now());
      const settlement = await usdSettlement(conn, row.currency, row.amount, occurredAt);
      if (eventStatus === "COMPLETED" && settlement.settlementAmount == null) continue;
      await enqueueCentralAffiliateEvent(conn, {
        eventId: `linescout:sync:linescout_quote_payments:${row.id}:${eventStatus}`,
        eventType: "PAYMENT_STATUS_CHANGED", occurredAt: occurredAt.toISOString(),
        customerReference: row.ledger_user_id ? `linescout:user:${row.ledger_user_id}` : `linescout:guest:quote-payment:${row.id}`, referralCode: row.referral_code || null,
        payment: { type: "linescout_quote_payments", id: String(row.id), orderReference: `quote:${row.quote_id}`, purpose,
          status: eventStatus, provider: row.method || null, providerReference: row.provider_ref || null,
          currency: String(row.currency || "NGN").toUpperCase(), amount: Number(row.amount || 0), eligibleAmount: Number(row.base_amount ?? row.amount ?? 0),
          ...settlement,
          billingUnit: purpose === "SHIPPING_PAYMENT" ? billingUnit : null, eligibleQuantity: purpose === "SHIPPING_PAYMENT" ? quantity : null,
          destinationCountry: purpose === "SHIPPING_PAYMENT" ? String(row.destination_country || "NIGERIA").toUpperCase() : null,
          shippingMode: purpose === "SHIPPING_PAYMENT" && String(row.shipping_mode || "").toUpperCase().includes("SEA") ? "SEA" : purpose === "SHIPPING_PAYMENT" ? "AIR" : null },
      });
      queued += 1;
    }

    const [shippingPayments]: any = await conn.query(
      `SELECT p.*, q.shipping_rate_unit, q.total_weight_kg, q.total_cbm,
              COALESCE(c.name, 'NIGERIA') AS destination_country, COALESCE(st.name, 'AIR') AS shipping_mode,
              ${referralSql('p.user_id')} AS referral_code
       FROM linescout_shipping_quote_payments p
       JOIN linescout_shipping_quotes q ON q.id = p.shipping_quote_id
       LEFT JOIN linescout_countries c ON c.id = q.country_id
       LEFT JOIN linescout_shipping_types st ON st.id = q.shipping_type_id
       LEFT JOIN linescout_affiliate_event_outbox o
         ON o.event_id COLLATE utf8mb4_unicode_ci = CONCAT('linescout:sync:linescout_shipping_quote_payments:', p.id, ':', ${statusSql}) COLLATE utf8mb4_unicode_ci
       WHERE o.id IS NULL
       ORDER BY p.id ASC LIMIT ?`, [limit]
    );
    for (const row of shippingPayments || []) {
      const billingUnit = String(row.shipping_rate_unit || "").toLowerCase() === "per_cbm" ? "CBM" : "KG";
      const quantity = Number(billingUnit === "CBM" ? row.total_cbm : row.total_weight_kg) || null;
      const eventStatus = centralStatus(row.status);
      const occurredAt = new Date(row.paid_at || row.created_at || Date.now());
      const settlement = await usdSettlement(conn, row.currency, row.amount, occurredAt);
      if (eventStatus === "COMPLETED" && settlement.settlementAmount == null) continue;
      await enqueueCentralAffiliateEvent(conn, {
        eventId: `linescout:sync:linescout_shipping_quote_payments:${row.id}:${eventStatus}`,
        eventType: "PAYMENT_STATUS_CHANGED", occurredAt: occurredAt.toISOString(),
        customerReference: row.user_id ? `linescout:user:${row.user_id}` : `linescout:guest:shipping-payment:${row.id}`, referralCode: row.referral_code || null,
        payment: { type: "linescout_shipping_quote_payments", id: String(row.id), orderReference: `shipping-quote:${row.shipping_quote_id}`, purpose: "SHIPPING_PAYMENT",
          status: eventStatus, provider: row.method || null, providerReference: row.provider_ref || null,
          currency: String(row.currency || "NGN").toUpperCase(), amount: Number(row.amount || 0), eligibleAmount: Number(row.base_amount ?? row.amount ?? 0),
          ...settlement,
          billingUnit, eligibleQuantity: quantity, destinationCountry: String(row.destination_country || "NIGERIA").toUpperCase(),
          shippingMode: String(row.shipping_mode || "").toUpperCase().includes("SEA") ? "SEA" : "AIR" },
      });
      queued += 1;
    }

    const [attempts]: any = await conn.query(
      `SELECT p.*, ${referralSql('p.user_id')} AS referral_code
       FROM linescout_payment_attempts p
       LEFT JOIN linescout_affiliate_event_outbox o ON o.event_id = CONCAT('linescout:sync:linescout_payment_attempts:', p.id, ':', ${statusSql})
       WHERE o.id IS NULL ORDER BY p.id ASC LIMIT ?`, [limit]
    );
    for (const row of attempts || []) {
      const eventStatus = centralStatus(row.status);
      const occurredAt = new Date(row.verified_at || row.created_at || Date.now());
      const settlement = await usdSettlement(conn, row.currency, row.amount, occurredAt);
      if (eventStatus === "COMPLETED" && settlement.settlementAmount == null) continue;
      await enqueueCentralAffiliateEvent(conn, {
        eventId: `linescout:sync:linescout_payment_attempts:${row.id}:${eventStatus}`,
        eventType: "PAYMENT_STATUS_CHANGED", occurredAt: occurredAt.toISOString(),
        customerReference: `linescout:user:${row.user_id}`, referralCode: row.referral_code || null,
        payment: { type: "linescout_payment_attempts", id: String(row.id), orderReference: row.reference, purpose: "COMMITMENT_FEE",
          status: eventStatus, provider: row.provider || null, providerReference: row.reference,
          currency: String(row.currency || "NGN").toUpperCase(), amount: Number(row.amount || 0), eligibleAmount: Number(row.amount || 0),
          ...settlement },
      });
      queued += 1;
    }
  } finally {
    conn.release();
  }
  return { queued };
}
