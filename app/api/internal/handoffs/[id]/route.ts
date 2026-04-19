// app/api/internal/handoffs/[id]/route.ts
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import {
  ensureCountryConfig,
  ensureHandoffCountryColumns,
  backfillHandoffDefaults,
  ensureShippingRateCountryColumn,
  getNigeriaDefaults,
} from "@/lib/country-config";
import { buildNoticeEmail } from "@/lib/otp-email";
import { creditAgentCommissionForQuotePayment } from "@/lib/agent-commission";
import { creditAffiliateEarning, ensureAffiliateTables } from "@/lib/affiliates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function num(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseJsonSafe(raw: any) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

function quotePurposeToHandoffPurpose(purpose: string) {
  const p = String(purpose || "").trim().toLowerCase();
  if (p === "deposit") return "downpayment";
  if (p === "shipping_payment") return "shipping_payment";
  if (p === "product_balance") return "additional_payment";
  return "full_payment";
}

async function ensureReleaseAuditTable(conn: any) {
  await conn.query(
    `
    CREATE TABLE IF NOT EXISTS linescout_handoff_release_audits (
      id INT AUTO_INCREMENT PRIMARY KEY,
      handoff_id INT NOT NULL,
      conversation_id INT NULL,
      released_by_id INT NULL,
      released_by_name VARCHAR(120) NULL,
      released_by_role VARCHAR(32) NULL,
      previous_status VARCHAR(32) NULL,
      product_paid DECIMAL(18,2) NULL,
      shipping_paid DECIMAL(18,2) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_handoff_release_handoff (handoff_id),
      INDEX idx_handoff_release_created (created_at)
    )
    `
  );
}

async function ensureClaimAuditTable(conn: any) {
  await conn.query(
    `
    CREATE TABLE IF NOT EXISTS linescout_handoff_claim_audits (
      id INT AUTO_INCREMENT PRIMARY KEY,
      handoff_id INT NOT NULL,
      conversation_id INT NULL,
      claimed_by_id INT NULL,
      claimed_by_name VARCHAR(120) NULL,
      claimed_by_role VARCHAR(32) NULL,
      previous_status VARCHAR(32) NULL,
      new_status VARCHAR(32) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_handoff_claim_handoff (handoff_id),
      INDEX idx_handoff_claim_created (created_at)
    )
    `
  );
}

function pickItems(raw: any) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object" && Array.isArray(raw.items)) return raw.items;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function computeShippingNgn(
  items: any[],
  exchangeUsd: number,
  shippingRateUsd: number,
  shippingUnit: "per_kg" | "per_cbm"
) {
  let totalWeightKg = 0;
  let totalCbm = 0;

  for (const item of items) {
    const qty = num(item.quantity || 0);
    const unitWeight = num(item.unit_weight_kg || 0);
    const unitCbm = num(item.unit_cbm || 0);
    totalWeightKg += qty * unitWeight;
    totalCbm += qty * unitCbm;
  }

  const shippingUnits = shippingUnit === "per_cbm" ? totalCbm : totalWeightKg;
  const totalShippingUsd = shippingUnits * shippingRateUsd;
  const totalShippingNgn = totalShippingUsd * exchangeUsd;
  return Math.round(totalShippingNgn);
}

async function sendEmail(opts: { to: string; subject: string; text: string; html: string }) {
  const nodemailer = require("nodemailer") as any;
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || 0);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = (process.env.SMTP_FROM || "no-reply@sureimports.com").trim();

  if (!host || !port || !user || !pass) {
    return { ok: false as const, error: "Missing SMTP env vars (SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS)." };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });

  return { ok: true as const };
}

async function requireInternalSession() {
  const cookieName = process.env.INTERNAL_AUTH_COOKIE_NAME;
  if (!cookieName) {
    return {
      ok: false as const,
      status: 500 as const,
      error: "Missing INTERNAL_AUTH_COOKIE_NAME",
    };
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
  if (!token) return { ok: false as const, status: 401 as const, error: "Not signed in" };

  const conn = await db.getConnection();
  try {
    await ensureCountryConfig(conn);
    await ensureHandoffCountryColumns(conn);
    await backfillHandoffDefaults(conn);
    await ensureReleaseAuditTable(conn);
    await ensureClaimAuditTable(conn);
    const [rows]: any = await conn.query(
      `
      SELECT
        u.id,
        u.username,
        u.role,
        u.is_active,
        COALESCE(p.can_view_handoffs, 0) AS can_view_handoffs
      FROM internal_sessions s
      JOIN internal_users u ON u.id = s.user_id
      LEFT JOIN internal_user_permissions p ON p.user_id = u.id
      WHERE s.session_token = ?
        AND s.revoked_at IS NULL
      LIMIT 1
      `,
      [token]
    );

    if (!rows?.length) return { ok: false as const, status: 401 as const, error: "Invalid session" };
    if (!rows[0].is_active) return { ok: false as const, status: 403 as const, error: "Account disabled" };

    const role = String(rows[0].role || "");
    const canView = role === "admin" ? true : !!rows[0].can_view_handoffs;

    if (!canView) return { ok: false as const, status: 403 as const, error: "Forbidden" };

    return {
      ok: true as const,
      user: {
        id: Number(rows[0].id),
        username: String(rows[0].username || ""),
        role: role as "admin" | "agent",
      },
    };
  } finally {
    conn.release();
  }
}

/**
 * GET /api/internal/handoffs/:id
 * Admin (and handoffs-permitted agents) only.
 * Returns handoff details + useful joined labels.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireInternalSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;
  const handoffId = num(id, 0);
  if (!handoffId) {
    return NextResponse.json({ ok: false, error: "Invalid handoff id" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `
      SELECT
        h.*,
        b.name AS bank_name,
        sc.name AS shipping_company_name,
        c.assigned_agent_id,
        ia.username AS assigned_agent_username,
        hc.name AS country_name,
        hc.iso2 AS country_iso2,
        u.id AS user_id,
        u.email AS user_email,
        u.display_name AS user_display_name,
        u.created_at AS user_created_at,
        u.country_id AS user_country_id,
        uc.name AS user_country_name,
        uc.iso2 AS user_country_iso2,
        u.display_currency_code AS user_display_currency_code,
        ucc.code AS user_country_currency_code,
        sAgg.last_seen_at AS user_last_seen_at,
        sAgg.active_sessions AS user_active_sessions,
        lprof.name AS lead_name,
        lprof.whatsapp AS lead_whatsapp,
        COALESCE(
          NULLIF(TRIM(h.customer_name), ''),
          NULLIF(
            TRIM((
              SELECT l.name
              FROM linescout_leads l
              WHERE l.email = u.email
              ORDER BY l.created_at DESC
              LIMIT 1
            )),
            ''
          ),
          NULLIF(TRIM(u.display_name), ''),
          'Customer'
        ) AS resolved_customer_name
      FROM linescout_handoffs h
      LEFT JOIN linescout_banks b ON b.id = h.bank_id
      LEFT JOIN linescout_shipping_companies sc ON sc.id = h.shipping_company_id
      LEFT JOIN linescout_conversations c ON c.handoff_id = h.id
      LEFT JOIN users u ON u.id = c.user_id OR (c.user_id IS NULL AND h.email IS NOT NULL AND u.email_normalized = LOWER(TRIM(h.email)))
      LEFT JOIN (
        SELECT
          user_id,
          MAX(last_seen_at) AS last_seen_at,
          SUM(CASE WHEN revoked_at IS NULL AND expires_at > NOW() THEN 1 ELSE 0 END) AS active_sessions
        FROM linescout_user_sessions
        GROUP BY user_id
      ) sAgg ON sAgg.user_id = u.id
      LEFT JOIN (
        SELECT l1.email, l1.name, l1.whatsapp, LOWER(TRIM(l1.email)) AS email_norm
        FROM linescout_leads l1
        JOIN (
          SELECT LOWER(TRIM(email)) AS email_norm, MAX(id) AS max_id
          FROM linescout_leads
          WHERE email IS NOT NULL AND TRIM(email) <> ''
          GROUP BY LOWER(TRIM(email))
        ) latest ON latest.email_norm = LOWER(TRIM(l1.email)) AND latest.max_id = l1.id
      ) lprof ON lprof.email_norm = COALESCE(u.email_normalized, LOWER(TRIM(h.email)))
      LEFT JOIN internal_users ia ON ia.id = c.assigned_agent_id
      LEFT JOIN linescout_countries hc ON hc.id = h.country_id
      LEFT JOIN linescout_countries uc ON uc.id = u.country_id
      LEFT JOIN linescout_currencies ucc ON ucc.id = uc.default_currency_id
      WHERE h.id = ?
      LIMIT 1
      `,
      [handoffId]
    );

    if (!rows?.length) {
      return NextResponse.json({ ok: false, error: "Handoff not found" }, { status: 404 });
    }

    const item = rows[0];

    const [auditRows]: any = await conn.query(
      `SELECT id, changed_by_id, changed_by_name, changed_by_role,
              previous_manufacturer_name, previous_manufacturer_address, previous_manufacturer_contact_name,
              previous_manufacturer_contact_email, previous_manufacturer_contact_phone,
              new_manufacturer_name, new_manufacturer_address, new_manufacturer_contact_name,
              new_manufacturer_contact_email, new_manufacturer_contact_phone,
              created_at
       FROM linescout_handoff_manufacturer_audits
       WHERE handoff_id = ?
       ORDER BY created_at DESC
       LIMIT 10`,
      [handoffId]
    );

    const [releaseRows]: any = await conn.query(
      `SELECT id, conversation_id, released_by_id, released_by_name, released_by_role,
              previous_status, product_paid, shipping_paid, created_at
       FROM linescout_handoff_release_audits
       WHERE handoff_id = ?
       ORDER BY created_at DESC
       LIMIT 10`,
      [handoffId]
    );

    const [claimRows]: any = await conn.query(
      `SELECT id, conversation_id, claimed_by_id, claimed_by_name, claimed_by_role,
              previous_status, new_status, created_at
       FROM linescout_handoff_claim_audits
       WHERE handoff_id = ?
       ORDER BY created_at DESC
       LIMIT 10`,
      [handoffId]
    );

    return NextResponse.json({
      ok: true,
      item: {
        id: Number(item.id),
        token: String(item.token || ""),
        handoff_type: String(item.handoff_type || ""),
        status: String(item.status || ""),

        customer_name: item.resolved_customer_name ?? item.customer_name ?? null,
        email: item.email ?? null,
        whatsapp_number: item.whatsapp_number ?? null,
        context: item.context ?? null,

        claimed_by: item.claimed_by ?? null,
        claimed_at: item.claimed_at ?? null,

        created_at: item.created_at ?? null,
        paid_at: item.paid_at ?? null,
        manufacturer_found_at: item.manufacturer_found_at ?? null,
        manufacturer_name: item.manufacturer_name ?? null,
        manufacturer_address: item.manufacturer_address ?? null,
        manufacturer_contact_name: item.manufacturer_contact_name ?? null,
        manufacturer_contact_email: item.manufacturer_contact_email ?? null,
        manufacturer_contact_phone: item.manufacturer_contact_phone ?? null,
        manufacturer_details_updated_at: item.manufacturer_details_updated_at ?? null,
        manufacturer_details_updated_by: item.manufacturer_details_updated_by ?? null,
        shipped_at: item.shipped_at ?? null,
        delivered_at: item.delivered_at ?? null,
        cancelled_at: item.cancelled_at ?? null,
        cancel_reason: item.cancel_reason ?? null,
        resolved_at: item.resolved_at ?? null,

        bank_id: item.bank_id ?? null,
        bank_name: item.bank_name ?? null,

        shipping_company_id: item.shipping_company_id ?? null,
        shipping_company_name: item.shipping_company_name ?? null,
        shipper: item.shipper ?? null,
        tracking_number: item.tracking_number ?? null,

        conversation_id: item.conversation_id ?? null,
        assigned_agent_id: item.assigned_agent_id ?? null,
        assigned_agent_username: item.assigned_agent_username ?? null,
        user_id: item.user_id ?? null,
        user_email: item.user_email ?? null,
        user_display_name: item.user_display_name ?? null,
        user_created_at: item.user_created_at ?? null,
        user_last_seen_at: item.user_last_seen_at ?? null,
        user_active_sessions: item.user_active_sessions ?? null,
        user_lead_name: item.lead_name ?? null,
        user_whatsapp: item.lead_whatsapp ?? null,
        user_country_id: item.user_country_id ?? null,
        user_country_name: item.user_country_name ?? null,
        user_country_iso2: item.user_country_iso2 ?? null,
        user_display_currency_code: item.user_display_currency_code ?? null,
        user_country_currency_code: item.user_country_currency_code ?? null,

        manufacturer_audit: (auditRows || []).map((row: any) => ({
          id: Number(row.id),
          changed_by_id: row.changed_by_id ?? null,
          changed_by_name: row.changed_by_name ?? null,
          changed_by_role: row.changed_by_role ?? null,
          previous: {
            manufacturer_name: row.previous_manufacturer_name ?? null,
            manufacturer_address: row.previous_manufacturer_address ?? null,
            manufacturer_contact_name: row.previous_manufacturer_contact_name ?? null,
            manufacturer_contact_email: row.previous_manufacturer_contact_email ?? null,
            manufacturer_contact_phone: row.previous_manufacturer_contact_phone ?? null,
          },
          next: {
            manufacturer_name: row.new_manufacturer_name ?? null,
            manufacturer_address: row.new_manufacturer_address ?? null,
            manufacturer_contact_name: row.new_manufacturer_contact_name ?? null,
            manufacturer_contact_email: row.new_manufacturer_contact_email ?? null,
            manufacturer_contact_phone: row.new_manufacturer_contact_phone ?? null,
          },
          created_at: row.created_at ?? null,
        })),
        release_audit: (releaseRows || []).map((row: any) => ({
          id: Number(row.id),
          conversation_id: row.conversation_id ?? null,
          released_by_id: row.released_by_id ?? null,
          released_by_name: row.released_by_name ?? null,
          released_by_role: row.released_by_role ?? null,
          previous_status: row.previous_status ?? null,
          product_paid: row.product_paid ?? null,
          shipping_paid: row.shipping_paid ?? null,
          created_at: row.created_at ?? null,
        })),
        claim_audit: (claimRows || []).map((row: any) => ({
          id: Number(row.id),
          conversation_id: row.conversation_id ?? null,
          claimed_by_id: row.claimed_by_id ?? null,
          claimed_by_name: row.claimed_by_name ?? null,
          claimed_by_role: row.claimed_by_role ?? null,
          previous_status: row.previous_status ?? null,
          new_status: row.new_status ?? null,
          created_at: row.created_at ?? null,
        })),
      },
    });
  } catch (e: any) {
    console.error("GET /api/internal/handoffs/[id] error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to load handoff" }, { status: 500 });
  } finally {
    conn.release();
  }
}

/**
 * POST /api/internal/handoffs/:id
 * action=request_shipping_payment|approve_quote_payment|clear_unpaid_quotes (admin only)
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireInternalSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (auth.user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "").trim();
  if (
    action !== "request_shipping_payment" &&
    action !== "approve_quote_payment" &&
    action !== "clear_unpaid_quotes"
  ) {
    return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });
  }

  const { id } = await ctx.params;
  const handoffId = num(id, 0);
  if (!handoffId) {
    return NextResponse.json({ ok: false, error: "Invalid handoff id" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    if (action === "clear_unpaid_quotes") {
      await conn.beginTransaction();
      try {
        const [quoteRows]: any = await conn.query(
          `SELECT q.id
           FROM linescout_quotes q
           LEFT JOIN (
             SELECT quote_id, SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid_count
             FROM linescout_quote_payments
             GROUP BY quote_id
           ) ps ON ps.quote_id = q.id
           WHERE q.handoff_id = ?
             AND COALESCE(ps.paid_count, 0) = 0`,
          [handoffId]
        );
        const quoteIds = (quoteRows || []).map((r: any) => Number(r.id)).filter(Boolean);
        if (!quoteIds.length) {
          await conn.rollback();
          return NextResponse.json({ ok: true, deleted_quotes: 0, deleted_quote_payments: 0 });
        }

        const placeholders = quoteIds.map(() => "?").join(",");
        let deletedAddonLines = 0;
        try {
          const [delAddonLines]: any = await conn.query(
            `DELETE FROM linescout_quote_addon_lines
             WHERE quote_id IN (${placeholders})`,
            quoteIds
          );
          deletedAddonLines = Number(delAddonLines?.affectedRows || 0);
        } catch {
          deletedAddonLines = 0;
        }
        const [delPayments]: any = await conn.query(
          `DELETE FROM linescout_quote_payments
           WHERE quote_id IN (${placeholders})
             AND status <> 'paid'`,
          quoteIds
        );
        const [delQuotes]: any = await conn.query(
          `DELETE FROM linescout_quotes
           WHERE id IN (${placeholders})`,
          quoteIds
        );

        await conn.commit();
        return NextResponse.json({
          ok: true,
          deleted_quotes: Number(delQuotes?.affectedRows || 0),
          deleted_quote_addon_lines: deletedAddonLines,
          deleted_quote_payments: Number(delPayments?.affectedRows || 0),
        });
      } catch (err) {
        try {
          await conn.rollback();
        } catch {}
        throw err;
      }
    }

    if (action === "approve_quote_payment") {
      const paymentId = num(body?.payment_id, 0);
      if (!paymentId) {
        return NextResponse.json({ ok: false, error: "payment_id is required" }, { status: 400 });
      }

      const [rows]: any = await conn.query(
        `SELECT
           qp.id,
           qp.quote_id,
           qp.handoff_id,
           qp.user_id,
           qp.purpose,
           qp.method,
           qp.status,
           qp.amount,
           COALESCE(qp.base_amount, qp.amount) AS base_amount,
           qp.currency,
           qp.provider_ref,
           qp.processing_fee_meta_json,
           q.total_product_ngn,
           q.total_markup_ngn,
           q.commitment_due_ngn,
           h.status AS handoff_status,
           h.token AS handoff_token,
           h.email AS customer_email,
           h.customer_name AS customer_name
         FROM linescout_quote_payments qp
         JOIN linescout_quotes q ON q.id = qp.quote_id
         JOIN linescout_handoffs h ON h.id = qp.handoff_id
         WHERE qp.id = ?
           AND qp.handoff_id = ?
         LIMIT 1`,
        [paymentId, handoffId]
      );
      const p = rows?.[0];
      if (!p?.id) {
        return NextResponse.json({ ok: false, error: "Payment not found for this handoff." }, { status: 404 });
      }
      if (String(p.status || "").toLowerCase() !== "pending") {
        return NextResponse.json({ ok: false, error: "Only pending payments can be approved." }, { status: 400 });
      }

      const meta = parseJsonSafe(p.processing_fee_meta_json) || {};
      const directTransfer =
        !!meta?.direct_bank_transfer || String(p.provider_ref || "").trim().toUpperCase().startsWith("DBT_");
      if (!directTransfer) {
        return NextResponse.json(
          { ok: false, error: "Only direct bank transfer payments can be approved here." },
          { status: 400 }
        );
      }

      await conn.query(
        `UPDATE linescout_quote_payments
         SET status = 'paid',
             paid_at = NOW()
         WHERE id = ?`,
        [paymentId]
      );

      await ensureAffiliateTables(conn);

      const amountNgn = Number(p.base_amount || p.amount || 0);
      const handoffPurpose = quotePurposeToHandoffPurpose(String(p.purpose || ""));
      const bankLabel = String(meta?.bank_name || p.provider_ref || p.method || "Direct bank transfer").trim();
      await conn.query(
        `INSERT INTO linescout_handoff_payments
         (handoff_id, amount, currency, purpose, note, paid_at, created_at)
         VALUES (?, ?, 'NGN', ?, ?, NOW(), NOW())`,
        [handoffId, amountNgn, handoffPurpose, `Quote payment approved (${bankLabel})`]
      );

      if (paymentId && handoffId) {
        await creditAgentCommissionForQuotePayment(conn, {
          quotePaymentId: Number(paymentId),
          quoteId: Number(p.quote_id),
          handoffId: Number(handoffId),
          purpose: String(p.purpose || ""),
          amountNgn,
          currency: "NGN",
        }).catch(() => null);
      }

      if (paymentId && p.user_id) {
        const affiliateType =
          String(p.purpose || "") === "shipping_payment" ? "shipping_payment" : "project_payment";
        await creditAffiliateEarning(conn, {
          referred_user_id: Number(p.user_id),
          transaction_type: affiliateType,
          source_table: "linescout_quote_payments",
          source_id: Number(paymentId),
          base_amount: amountNgn,
          currency: "NGN",
        }).catch(() => null);
      }

      const [productPayRows]: any = await conn.query(
        `SELECT COALESCE(
            SUM(
              CASE
                WHEN purpose IN ('deposit','product_balance','full_product_payment')
                 AND status = 'paid'
                THEN COALESCE(base_amount, amount)
                ELSE 0
              END
            ),
            0
          ) AS paid
         FROM linescout_quote_payments
         WHERE quote_id = ?`,
        [Number(p.quote_id)]
      );
      const productPaid = Number(productPayRows?.[0]?.paid || 0);
      const productDue = Math.max(
        0,
        Math.round(
          Number(p.total_product_ngn || 0) +
            Number(p.total_markup_ngn || 0) -
            Number(p.commitment_due_ngn || 0)
        )
      );

      const currentStatus = String(p.handoff_status || "").trim().toLowerCase();
      let nextStatus = currentStatus;
      if (currentStatus === "manufacturer_found" && productDue > 0 && productPaid >= productDue) {
        await conn.query(
          `UPDATE linescout_handoffs
           SET status = 'paid', paid_at = COALESCE(paid_at, NOW())
           WHERE id = ?`,
          [handoffId]
        );
        nextStatus = "paid";
      }

      if (String(p.customer_email || "").includes("@")) {
        const emailPack = buildNoticeEmail({
          subject: `Payment confirmed – ${String(p.handoff_token || `Handoff #${handoffId}`)}`,
          title: "Payment confirmed",
          lines: [
            `Amount: NGN ${Number(amountNgn || 0).toLocaleString()}`,
            `Purpose: ${handoffPurpose.replace(/_/g, " ")}`,
            nextStatus === "paid" && currentStatus !== "paid"
              ? "Your project milestone has been updated to Paid."
              : "Your payment has been confirmed and applied to your project.",
          ],
        });
        await sendEmail({
          to: String(p.customer_email),
          subject: emailPack.subject,
          text: emailPack.text,
          html: emailPack.html,
        }).catch(() => null);
      }

      return NextResponse.json({
        ok: true,
        payment_id: Number(paymentId),
        handoff_status: nextStatus,
      });
    }

    await ensureCountryConfig(conn);
    await ensureShippingRateCountryColumn(conn);
    const [handoffRows]: any = await conn.query(
      `SELECT id, token, email, customer_name
       FROM linescout_handoffs
       WHERE id = ?
       LIMIT 1`,
      [handoffId]
    );
    if (!handoffRows?.length) {
      return NextResponse.json({ ok: false, error: "Handoff not found" }, { status: 404 });
    }

    const handoff = handoffRows[0];
    const [quoteRows]: any = await conn.query(
      `SELECT id, token, items_json, exchange_rate_usd, shipping_rate_usd, shipping_rate_unit, shipping_type_id, country_id
       FROM linescout_quotes
       WHERE handoff_id = ?
       ORDER BY id DESC
       LIMIT 1`,
      [handoffId]
    );
    if (!quoteRows?.length) {
      return NextResponse.json({ ok: false, error: "No quote found for this handoff" }, { status: 400 });
    }

    const quote = quoteRows[0];
    const items = pickItems(quote.items_json);
    const exchangeUsd = num(quote.exchange_rate_usd, 0);
    let shippingRateUsd = num(quote.shipping_rate_usd, 0);
    let shippingRateUnit = String(quote.shipping_rate_unit || "per_kg");
    const shipTypeId = Number(quote.shipping_type_id || 0);
    const defaults = await getNigeriaDefaults(conn);
    const quoteCountryId = Number(quote.country_id || defaults.country_id || 0);

    if (shipTypeId) {
      const [rateRows]: any = await conn.query(
        `SELECT rate_value, rate_unit
         FROM linescout_shipping_rates
         WHERE shipping_type_id = ?
           AND is_active = 1
           AND country_id = ?
         ORDER BY id DESC
         LIMIT 1`,
        [shipTypeId, quoteCountryId]
      );
      if (rateRows?.length) {
        shippingRateUsd = num(rateRows[0].rate_value, shippingRateUsd);
        shippingRateUnit = String(rateRows[0].rate_unit || shippingRateUnit);
      }
    }

    const totalShippingNgn = computeShippingNgn(
      items,
      exchangeUsd,
      shippingRateUsd,
      shippingRateUnit === "per_cbm" ? "per_cbm" : "per_kg"
    );

    const [paidRows]: any = await conn.query(
      `SELECT COALESCE(SUM(amount),0) AS paid
       FROM linescout_quote_payments
       WHERE handoff_id = ?
         AND purpose = 'shipping_payment'
         AND status = 'paid'`,
      [handoffId]
    );
    const shippingPaid = num(paidRows?.[0]?.paid, 0);
    const shippingRemaining = Math.max(0, totalShippingNgn - shippingPaid);
    if (shippingRemaining <= 0) {
      return NextResponse.json({ ok: false, error: "Shipping payment already completed" }, { status: 400 });
    }

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://linescout.sureimports.com").replace(/\/$/, "");
    const quoteLink = `${baseUrl}/quote/${quote.token}?pay=shipping`;
    const recipientLabel = handoff.token || handoff.customer_name || `Handoff #${handoffId}`;

    const title = "Shipping payment required";
    const subject = `Pay for shipping – ${recipientLabel}`;
    const bodyLines = [
      "Your shipment has arrived and is ready for delivery.",
      "Please pay the shipping fee to proceed with final delivery.",
      `Amount due: NGN ${shippingRemaining.toLocaleString()}`,
      `Project: ${recipientLabel}`,
      `Pay now: ${quoteLink}`,
    ];

    if (handoff.email) {
      const emailPack = buildNoticeEmail({
        subject,
        title,
        lines: bodyLines,
        footerNote: "This email was sent because a shipping payment was requested for your LineScout project.",
        footerLines: [
          "LineScout is a registered trademark of Sure Importers Limited in Nigeria.",
          "Address: 5 Olutosin Ajayi Street, Ajao Estate, Lagos, Nigeria.",
          "Email: hello@sureimports.com",
        ],
      });
      await sendEmail({ to: handoff.email, subject: emailPack.subject, text: emailPack.text, html: emailPack.html });
    }

    const [userRows]: any = await conn.query(
      `SELECT id
       FROM users
       WHERE email = ? OR email_normalized = ?
       LIMIT 1`,
      [handoff.email, String(handoff.email || "").toLowerCase()]
    );
    if (userRows?.length) {
      await conn.query(
        `INSERT INTO linescout_notifications
         (target, user_id, title, body, data_json)
         VALUES ('user', ?, ?, ?, ?)`,
        [
          Number(userRows[0].id),
          title,
          `Shipping payment of NGN ${shippingRemaining.toLocaleString()} is required.`,
          JSON.stringify({ type: "shipping_payment_request", quote_token: quote.token, handoff_id: handoffId }),
        ]
      );
    }

    return NextResponse.json({
      ok: true,
      amount_due: shippingRemaining,
      quote_token: quote.token,
      quote_link: quoteLink,
    });
  } finally {
    conn.release();
  }
}
