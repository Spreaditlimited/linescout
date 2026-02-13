import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  ensureMarketingTables,
  logCampaignSend,
  sendMarketingEmail,
} from "@/lib/marketing-emails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isCronRequest(req: Request) {
  const vercelCron = String(req.headers.get("x-vercel-cron") || "").trim();
  if (vercelCron === "1") return true;
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  const headerSecret = String(req.headers.get("x-cron-secret") || "").trim();
  return headerSecret && headerSecret === secret;
}

function firstNameFrom(displayName?: string | null, email?: string | null) {
  const name = String(displayName || "").trim().replace(/\s+/g, " ");
  if (name) return name.split(" ")[0];
  const emailRaw = String(email || "").trim();
  if (emailRaw.includes("@")) return emailRaw.split("@")[0];
  return null;
}

export async function GET(req: Request) {
  if (!isCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const conn = await db.getConnection();
  try {
    await ensureMarketingTables(conn);

    const MAX_PER_CAMPAIGN = 80;
    const results: Record<string, number> = {};

    // 3) White-label viewed, no start
    const [wlRows]: any = await conn.query(
      `
      SELECT u.id, u.email, u.display_name
      FROM users u
      WHERE u.email IS NOT NULL AND u.email <> ''
        AND EXISTS (
          SELECT 1
          FROM linescout_marketing_events e
          WHERE e.user_id = u.id
            AND e.event_type = 'white_label_view'
            AND e.created_at <= (NOW() - INTERVAL 24 HOUR)
        )
        AND NOT EXISTS (
          SELECT 1
          FROM linescout_marketing_events e
          WHERE e.user_id = u.id
            AND e.event_type = 'start_sourcing_view'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM linescout_marketing_events e
          WHERE e.user_id = u.id
            AND e.event_type = 'paystack_verified'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM linescout_marketing_email_log l
          WHERE l.user_id = u.id
            AND l.campaign_key = 'wl_view_no_start'
        )
      LIMIT ?
      `,
      [MAX_PER_CAMPAIGN]
    );
    let sent = 0;
    for (const row of wlRows || []) {
      const email = String(row.email || "").trim();
      if (!email) continue;
      const firstName = firstNameFrom(row.display_name, email);
      const res = await sendMarketingEmail({
        to: email,
        firstName,
        campaign: "wl_view_no_start",
      });
      if (res?.ok === false) continue;
      await logCampaignSend(conn, Number(row.id), "wl_view_no_start");
      sent += 1;
    }
    results.wl_view_no_start = sent;

    // 4) Started sourcing, no payment init
    const [startRows]: any = await conn.query(
      `
      SELECT u.id, u.email, u.display_name
      FROM users u
      WHERE u.email IS NOT NULL AND u.email <> ''
        AND EXISTS (
          SELECT 1
          FROM linescout_marketing_events e
          WHERE e.user_id = u.id
            AND e.event_type = 'start_sourcing_view'
            AND e.created_at <= (NOW() - INTERVAL 6 HOUR)
        )
        AND NOT EXISTS (
          SELECT 1
          FROM linescout_marketing_events e
          WHERE e.user_id = u.id
            AND e.event_type IN ('paystack_init','paystack_verified')
        )
        AND NOT EXISTS (
          SELECT 1
          FROM linescout_marketing_email_log l
          WHERE l.user_id = u.id
            AND l.campaign_key = 'start_no_pay'
        )
      LIMIT ?
      `,
      [MAX_PER_CAMPAIGN]
    );
    sent = 0;
    for (const row of startRows || []) {
      const email = String(row.email || "").trim();
      if (!email) continue;
      const firstName = firstNameFrom(row.display_name, email);
      const res = await sendMarketingEmail({
        to: email,
        firstName,
        campaign: "start_no_pay",
      });
      if (res?.ok === false) continue;
      await logCampaignSend(conn, Number(row.id), "start_no_pay");
      sent += 1;
    }
    results.start_no_pay = sent;

    // 5) Paystack init, not completed
    const [initRows]: any = await conn.query(
      `
      SELECT e.user_id AS id, u.email, u.display_name, e.related_id
      FROM linescout_marketing_events e
      JOIN users u ON u.id = e.user_id
      WHERE e.event_type = 'paystack_init'
        AND e.created_at <= (NOW() - INTERVAL 1 HOUR)
        AND e.related_id IS NOT NULL
        AND e.related_id <> ''
        AND NOT EXISTS (
          SELECT 1
          FROM linescout_tokens t
          WHERE t.paystack_ref = e.related_id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM linescout_marketing_email_log l
          WHERE l.campaign_key = 'paystack_init_incomplete'
            AND l.related_id = e.related_id
        )
      LIMIT ?
      `,
      [MAX_PER_CAMPAIGN]
    );
    sent = 0;
    for (const row of initRows || []) {
      const email = String(row.email || "").trim();
      if (!email) continue;
      const firstName = firstNameFrom(row.display_name, email);
      const relatedId = String(row.related_id || "").trim();
      const res = await sendMarketingEmail({
        to: email,
        firstName,
        campaign: "paystack_init_incomplete",
      });
      if (res?.ok === false) continue;
      await logCampaignSend(conn, Number(row.id), "paystack_init_incomplete", relatedId || null);
      sent += 1;
    }
    results.paystack_init_incomplete = sent;

    // 6) Payment verified follow-up
    const [verifiedRows]: any = await conn.query(
      `
      SELECT e.user_id AS id, u.email, u.display_name, e.related_id
      FROM linescout_marketing_events e
      JOIN users u ON u.id = e.user_id
      WHERE e.event_type = 'paystack_verified'
        AND e.created_at <= (NOW() - INTERVAL 30 MINUTE)
        AND e.related_id IS NOT NULL
        AND e.related_id <> ''
        AND NOT EXISTS (
          SELECT 1
          FROM linescout_marketing_email_log l
          WHERE l.campaign_key = 'payment_verified'
            AND l.related_id = e.related_id
        )
      LIMIT ?
      `,
      [MAX_PER_CAMPAIGN]
    );
    sent = 0;
    for (const row of verifiedRows || []) {
      const email = String(row.email || "").trim();
      if (!email) continue;
      const firstName = firstNameFrom(row.display_name, email);
      const relatedId = String(row.related_id || "").trim();
      const res = await sendMarketingEmail({
        to: email,
        firstName,
        campaign: "payment_verified",
      });
      if (res?.ok === false) continue;
      await logCampaignSend(conn, Number(row.id), "payment_verified", relatedId || null);
      sent += 1;
    }
    results.payment_verified = sent;

    // 9) Quote ready but unpaid
    const [quoteRows]: any = await conn.query(
      `
      SELECT
        q.id AS quote_id,
        u.id AS user_id,
        u.email,
        u.display_name,
        COALESCE(q.total_product_ngn, 0) +
        COALESCE(q.total_markup_ngn, 0) +
        COALESCE(q.total_shipping_ngn, 0) -
        COALESCE(q.commitment_due_ngn, 0) AS total_due,
        COALESCE(SUM(CASE
          WHEN p.status = 'paid'
           AND p.purpose IN ('deposit','product_balance','full_product_payment','shipping_payment')
          THEN p.amount ELSE 0 END), 0) AS total_paid
      FROM linescout_quotes q
      JOIN linescout_handoffs h ON h.id = q.handoff_id
      JOIN linescout_conversations c ON c.handoff_id = h.id
      JOIN users u ON u.id = c.user_id
      LEFT JOIN linescout_quote_payments p ON p.quote_id = q.id
      WHERE q.created_at <= (NOW() - INTERVAL 3 DAY)
        AND u.email IS NOT NULL AND u.email <> ''
        AND NOT EXISTS (
          SELECT 1
          FROM linescout_marketing_email_log l
          WHERE l.campaign_key = 'quote_unpaid'
            AND l.related_id = q.id
        )
      GROUP BY q.id
      HAVING total_due > total_paid
      LIMIT ?
      `,
      [MAX_PER_CAMPAIGN]
    );
    sent = 0;
    for (const row of quoteRows || []) {
      const email = String(row.email || "").trim();
      if (!email) continue;
      const firstName = firstNameFrom(row.display_name, email);
      const quoteId = String(row.quote_id || "").trim();
      const res = await sendMarketingEmail({
        to: email,
        firstName,
        campaign: "quote_unpaid",
      });
      if (res?.ok === false) continue;
      await logCampaignSend(conn, Number(row.user_id), "quote_unpaid", quoteId || null);
      sent += 1;
    }
    results.quote_unpaid = sent;

    // 10) Handoff shipped
    const [shippedRows]: any = await conn.query(
      `
      SELECT h.id AS handoff_id, u.id AS user_id, u.email, u.display_name, h.status
      FROM linescout_handoffs h
      JOIN linescout_conversations c ON c.handoff_id = h.id
      JOIN users u ON u.id = c.user_id
      WHERE u.email IS NOT NULL AND u.email <> ''
        AND (LOWER(h.status) = 'shipped' OR h.shipped_at IS NOT NULL)
        AND (LOWER(h.status) <> 'delivered')
        AND COALESCE(h.shipped_at, h.updated_at) >= (NOW() - INTERVAL 30 DAY)
        AND NOT EXISTS (
          SELECT 1
          FROM linescout_marketing_email_log l
          WHERE l.campaign_key = 'handoff_shipped'
            AND l.related_id = h.id
        )
      LIMIT ?
      `,
      [MAX_PER_CAMPAIGN]
    );
    sent = 0;
    for (const row of shippedRows || []) {
      const email = String(row.email || "").trim();
      if (!email) continue;
      const firstName = firstNameFrom(row.display_name, email);
      const handoffId = String(row.handoff_id || "").trim();
      const res = await sendMarketingEmail({
        to: email,
        firstName,
        campaign: "handoff_shipped",
        statusLabel: row.status ? String(row.status) : "shipped",
      });
      if (res?.ok === false) continue;
      await logCampaignSend(conn, Number(row.user_id), "handoff_shipped", handoffId || null);
      sent += 1;
    }
    results.handoff_shipped = sent;

    // 11) Handoff delivered
    const [deliveredRows]: any = await conn.query(
      `
      SELECT h.id AS handoff_id, u.id AS user_id, u.email, u.display_name, h.status
      FROM linescout_handoffs h
      JOIN linescout_conversations c ON c.handoff_id = h.id
      JOIN users u ON u.id = c.user_id
      WHERE u.email IS NOT NULL AND u.email <> ''
        AND (LOWER(h.status) = 'delivered' OR h.delivered_at IS NOT NULL)
        AND COALESCE(h.delivered_at, h.updated_at) >= (NOW() - INTERVAL 60 DAY)
        AND NOT EXISTS (
          SELECT 1
          FROM linescout_marketing_email_log l
          WHERE l.campaign_key = 'handoff_delivered'
            AND l.related_id = h.id
        )
      LIMIT ?
      `,
      [MAX_PER_CAMPAIGN]
    );
    sent = 0;
    for (const row of deliveredRows || []) {
      const email = String(row.email || "").trim();
      if (!email) continue;
      const firstName = firstNameFrom(row.display_name, email);
      const handoffId = String(row.handoff_id || "").trim();
      const res = await sendMarketingEmail({
        to: email,
        firstName,
        campaign: "handoff_delivered",
        statusLabel: row.status ? String(row.status) : "delivered",
      });
      if (res?.ok === false) continue;
      await logCampaignSend(conn, Number(row.user_id), "handoff_delivered", handoffId || null);
      sent += 1;
    }
    results.handoff_delivered = sent;

    // Reorder eligible
    const [reorderRows]: any = await conn.query(
      `
      SELECT h.id AS handoff_id, u.id AS user_id, u.email, u.display_name
      FROM linescout_handoffs h
      JOIN linescout_conversations c ON c.handoff_id = h.id
      JOIN users u ON u.id = c.user_id
      WHERE u.email IS NOT NULL AND u.email <> ''
        AND (LOWER(h.status) = 'delivered' OR h.delivered_at IS NOT NULL)
        AND COALESCE(h.delivered_at, h.updated_at) <= (NOW() - INTERVAL 7 DAY)
        AND COALESCE(h.delivered_at, h.updated_at) >= (NOW() - INTERVAL 180 DAY)
        AND NOT EXISTS (
          SELECT 1
          FROM linescout_reorder_requests r
          WHERE r.source_handoff_id = h.id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM linescout_marketing_email_log l
          WHERE l.campaign_key = 'reorder_eligible'
            AND l.related_id = h.id
        )
      LIMIT ?
      `,
      [MAX_PER_CAMPAIGN]
    );
    sent = 0;
    for (const row of reorderRows || []) {
      const email = String(row.email || "").trim();
      if (!email) continue;
      const firstName = firstNameFrom(row.display_name, email);
      const handoffId = String(row.handoff_id || "").trim();
      const res = await sendMarketingEmail({
        to: email,
        firstName,
        campaign: "reorder_eligible",
      });
      if (res?.ok === false) continue;
      await logCampaignSend(conn, Number(row.user_id), "reorder_eligible", handoffId || null);
      sent += 1;
    }
    results.reorder_eligible = sent;

    return NextResponse.json({ ok: true, results });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 500 });
  } finally {
    conn.release();
  }
}
