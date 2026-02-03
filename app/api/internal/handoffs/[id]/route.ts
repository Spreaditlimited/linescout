// app/api/internal/handoffs/[id]/route.ts
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { buildNoticeEmail } from "@/lib/otp-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function num(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
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
        ia.username AS assigned_agent_username
      FROM linescout_handoffs h
      LEFT JOIN linescout_banks b ON b.id = h.bank_id
      LEFT JOIN linescout_shipping_companies sc ON sc.id = h.shipping_company_id
      LEFT JOIN linescout_conversations c ON c.handoff_id = h.id
      LEFT JOIN internal_users ia ON ia.id = c.assigned_agent_id
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

    return NextResponse.json({
      ok: true,
      item: {
        id: Number(item.id),
        token: String(item.token || ""),
        handoff_type: String(item.handoff_type || ""),
        status: String(item.status || ""),

        customer_name: item.customer_name ?? null,
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
 * action=request_shipping_payment (admin only)
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireInternalSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (auth.user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "").trim();
  if (action !== "request_shipping_payment") {
    return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });
  }

  const { id } = await ctx.params;
  const handoffId = num(id, 0);
  if (!handoffId) {
    return NextResponse.json({ ok: false, error: "Invalid handoff id" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
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
      `SELECT id, token, items_json, exchange_rate_usd, shipping_rate_usd, shipping_rate_unit, shipping_type_id
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

    if (shipTypeId) {
      const [rateRows]: any = await conn.query(
        `SELECT rate_value, rate_unit
         FROM linescout_shipping_rates
         WHERE shipping_type_id = ?
           AND is_active = 1
         ORDER BY id DESC
         LIMIT 1`,
        [shipTypeId]
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
      "Your shipment has arrived in Nigeria and is ready for delivery.",
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
