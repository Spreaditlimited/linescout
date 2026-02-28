import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { getFxRate } from "@/lib/fx";
import type { Transporter } from "nodemailer";
import { buildNoticeEmail } from "@/lib/otp-email";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodemailer = require("nodemailer");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireInternalSession() {
  const cookieName = process.env.INTERNAL_AUTH_COOKIE_NAME;
  if (!cookieName) {
    return { ok: false as const, status: 500 as const, error: "Missing INTERNAL_AUTH_COOKIE_NAME" };
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
        u.is_active
      FROM internal_sessions s
      JOIN internal_users u ON u.id = s.user_id
      WHERE s.session_token = ?
        AND s.revoked_at IS NULL
      LIMIT 1
      `,
      [token]
    );

    if (!rows?.length) return { ok: false as const, status: 401 as const, error: "Invalid session" };
    if (!rows[0].is_active) return { ok: false as const, status: 403 as const, error: "Account disabled" };

    return {
      ok: true as const,
      user: {
        id: Number(rows[0].id),
        username: String(rows[0].username || ""),
        role: String(rows[0].role || "") as "admin" | "agent",
      },
    };
  } finally {
    conn.release();
  }
}

function getSmtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || 0);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = (process.env.SMTP_FROM || "no-reply@sureimports.com").trim();

  if (!host || !port || !user || !pass) {
    return { ok: false as const, error: "Missing SMTP env vars (SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS)." };
  }

  return { ok: true as const, host, port, user, pass, from };
}

async function sendEmail(opts: { to: string; subject: string; text: string; html: string }) {
  const smtp = getSmtpConfig();
  if (!smtp.ok) return { ok: false as const, error: smtp.error };

  const transporter: Transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: { user: smtp.user, pass: smtp.pass },
  });

  await transporter.sendMail({
    from: smtp.from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });

  return { ok: true as const };
}

export async function POST(req: Request) {
  const auth = await requireInternalSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const quoteId = Number(body?.shipping_quote_id || 0);
  const quoteToken = String(body?.quote_token || "").trim();
  const shipmentId = Number(body?.shipment_id || 0);
  if (!quoteId && !quoteToken && !shipmentId) {
    return NextResponse.json(
      { ok: false, error: "shipping_quote_id or quote_token or shipment_id is required" },
      { status: 400 }
    );
  }

  const conn = await db.getConnection();
  try {
    const whereClause = quoteId
      ? "q.id = ?"
      : quoteToken
      ? "q.token = ?"
      : "q.shipment_id = ?";
    const param = quoteId || quoteToken || shipmentId;
    const [rows]: any = await conn.query(
      `
      SELECT q.*
      FROM linescout_shipping_quotes q
      WHERE ${whereClause}
      ORDER BY q.id DESC
      LIMIT 1
      `,
      [param]
    );
    if (!rows?.length) {
      return NextResponse.json({ ok: false, error: "Shipping quote not found" }, { status: 404 });
    }

    const q = rows[0];
    const to = String(q.email || "").trim();
    if (!to) {
      return NextResponse.json({ ok: false, error: "Customer email is missing for this shipment." }, { status: 400 });
    }

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://linescout.sureimports.com").replace(/\/$/, "");
    const quoteLink = `${baseUrl}/shipping-quote/${q.token}`;
    const recipientLabel = q.customer_name || `Shipment #${q.shipment_id || q.id}`;

    let items: any[] = [];
    try {
      if (Array.isArray(q.items_json)) {
        items = q.items_json;
      } else if (typeof q.items_json === "string") {
        items = JSON.parse(q.items_json || "[]");
      } else if (q.items_json && typeof q.items_json === "object") {
        items = Array.isArray(q.items_json.items) ? q.items_json.items : [];
      }
    } catch {
      items = [];
    }

    const displayCurrency = String(q.display_currency_code || "USD").toUpperCase();
    const totalShippingUsd = Number(q.total_shipping_usd || 0);
    const totalWeightKg = Number(q.total_weight_kg || 0);
    const totalCbm = Number(q.total_cbm || 0);
    const rateValue = Number(q.shipping_rate_usd || 0);
    const rateUnit = String(q.shipping_rate_unit || "per_kg");
    const unitsLabel = rateUnit === "per_cbm" ? "CBM" : "KG";
    let displayAmount = "";
    try {
      if (displayCurrency === "USD" || !totalShippingUsd) {
        displayAmount = totalShippingUsd ? `USD ${totalShippingUsd.toFixed(2)}` : "";
      } else {
        const fx = await getFxRate(conn, "USD", displayCurrency);
        if (fx) {
          displayAmount = `${displayCurrency} ${(totalShippingUsd * fx).toFixed(2)}`;
        }
      }
    } catch {}

    const mail = buildNoticeEmail({
      subject: `Your LineScout shipping invoice is ready – ${recipientLabel}`,
      title: "Your shipping invoice is ready",
      lines: [
        "Your LineScout shipping invoice is ready to review.",
        `Shipment: ${recipientLabel}`,
        `Open invoice: ${quoteLink}`,
        `Amount (USD): ${totalShippingUsd ? `USD ${totalShippingUsd.toFixed(2)}` : "—"}`,
        displayAmount ? `Amount (${displayCurrency}): ${displayAmount}` : null,
        `Rate: ${rateValue ? `USD ${rateValue.toFixed(2)}` : "—"} / ${unitsLabel}`,
        `Units: ${rateUnit === "per_cbm" ? totalCbm.toFixed(2) : totalWeightKg.toFixed(2)} ${unitsLabel}`,
        items.length
          ? `Items: ${items
              .map((i) => `${i.product_name || "Item"} (${i.product_description || "Shipping only"})`)
              .join(", ")}`
          : null,
      ].filter(Boolean) as string[],
      footerNote: "This email was sent because a shipping invoice was shared with you by your LineScout team.",
    });

    await sendEmail({ to, subject: mail.subject, text: mail.text, html: mail.html });

    const [userRows]: any = await conn.query(
      `SELECT id FROM users WHERE email = ? OR email_normalized = ? LIMIT 1`,
      [to, to.toLowerCase()]
    );
    if (userRows?.length) {
      await conn.query(
        `INSERT INTO linescout_notifications
         (target, user_id, title, body, data_json)
         VALUES ('user', ?, ?, ?, ?)`,
        [
          Number(userRows[0].id),
          "Shipping invoice ready",
          "Your LineScout shipping invoice is ready to review.",
          JSON.stringify({ type: "shipping_invoice_ready", quote_token: q.token, shipment_id: q.shipment_id }),
        ]
      );
    }

    return NextResponse.json({ ok: true, quote_link: quoteLink });
  } finally {
    conn.release();
  }
}
