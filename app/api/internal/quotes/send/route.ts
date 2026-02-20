import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
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

async function canAccessQuote(conn: any, user: { id: number; role: string }, quoteId: number) {
  if (user.role === "admin") return true;
  const [rows]: any = await conn.query(
    `SELECT q.id
     FROM linescout_quotes q
     JOIN linescout_conversations c ON c.handoff_id = q.handoff_id
     WHERE q.id = ?
       AND c.assigned_agent_id = ?
     LIMIT 1`,
    [quoteId, user.id]
  );
  if (rows?.length) return true;

  const [createdRows]: any = await conn.query(
    `SELECT id
     FROM linescout_quotes
     WHERE id = ?
       AND created_by = ?
     LIMIT 1`,
    [quoteId, user.id]
  );
  return !!createdRows?.length;
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
  const quoteId = Number(body?.quote_id || 0);
  if (!quoteId) return NextResponse.json({ ok: false, error: "quote_id is required" }, { status: 400 });

  const conn = await db.getConnection();
  try {
    const allowed = await canAccessQuote(conn, auth.user, quoteId);
    if (!allowed) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    const [rows]: any = await conn.query(
      `
      SELECT q.id, q.token, q.handoff_id, h.email, h.customer_name
      FROM linescout_quotes q
      LEFT JOIN linescout_handoffs h ON h.id = q.handoff_id
      WHERE q.id = ?
      LIMIT 1
      `,
      [quoteId]
    );

    if (!rows?.length) {
      return NextResponse.json({ ok: false, error: "Quote not found" }, { status: 404 });
    }

    const q = rows[0];
    const to = String(q.email || "").trim();
    if (!to) {
      return NextResponse.json({ ok: false, error: "Customer email is missing for this handoff." }, { status: 400 });
    }

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://linescout.sureimports.com").replace(/\/$/, "");
    const quoteLink = `${baseUrl}/quote/${q.token}`;
    const recipientLabel = q.customer_name || `Handoff #${q.handoff_id}`;

    const mail = buildNoticeEmail({
      subject: `Your LineScout quote is ready – ${recipientLabel}`,
      title: "Your quote is ready",
      lines: [
        "Your LineScout quote is ready to review.",
        `Project: ${recipientLabel}`,
        `Open quote: ${quoteLink}`,
      ],
      footerNote: "This email was sent because a quote was shared with you by your LineScout agent.",
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
          "Quote ready",
          "Your LineScout quote is ready to review.",
          JSON.stringify({ type: "quote_ready", quote_token: q.token, handoff_id: q.handoff_id }),
        ]
      );
    }

    return NextResponse.json({ ok: true, quote_link: quoteLink });
  } finally {
    conn.release();
  }
}
