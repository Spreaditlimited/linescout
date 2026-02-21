import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { buildNoticeEmail } from "@/lib/otp-email";
import type { Transporter } from "nodemailer";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodemailer = require("nodemailer");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

async function requireInternalAccess() {
  const cookieName = process.env.INTERNAL_AUTH_COOKIE_NAME;
  if (!cookieName) {
    return { ok: false as const, status: 500 as const, error: "Missing INTERNAL_AUTH_COOKIE_NAME" };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;
  if (!token) return { ok: false as const, status: 401 as const, error: "Not signed in" };

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `SELECT
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
         AND u.is_active = 1
       LIMIT 1`,
      [token]
    );

    if (!rows?.length) return { ok: false as const, status: 401 as const, error: "Invalid session" };
    const role = String(rows[0].role || "");
    const canView = role === "admin" ? true : !!rows[0].can_view_handoffs;
    if (!canView) return { ok: false as const, status: 403 as const, error: "Forbidden" };

    return {
      ok: true as const,
      user: {
        id: Number(rows[0].id),
        username: String(rows[0].username || ""),
        role,
      },
    };
  } finally {
    conn.release();
  }
}

/**
 * POST /api/internal/handoffs/request-country
 * body: { handoff_id: number }
 */
export async function POST(req: Request) {
  const auth = await requireInternalAccess();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const handoffId = Number(body?.handoff_id || 0);
  if (!handoffId) {
    return NextResponse.json({ ok: false, error: "handoff_id is required" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `SELECT h.id, h.token, h.customer_name, h.email
       FROM linescout_handoffs h
       WHERE h.id = ?
       LIMIT 1`,
      [handoffId]
    );
    if (!rows?.length) return NextResponse.json({ ok: false, error: "Handoff not found" }, { status: 404 });

    const handoff = rows[0];
    const email = String(handoff.email || "").trim();
    if (!email) return NextResponse.json({ ok: false, error: "Customer email is missing" }, { status: 400 });

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://linescout.sureimports.com").replace(/\/$/, "");
    const profileUrl = `${baseUrl}/profile`;
    const customerLabel = String(handoff.customer_name || "").trim() || "Customer";
    const handoffLabel = String(handoff.token || "").trim() || `Handoff #${handoffId}`;

    const mail = buildNoticeEmail({
      subject: "Please set your country for an accurate quote",
      title: "Set your country in LineScout",
      lines: [
        `Your LineScout agent needs your country to prepare an accurate quote for ${handoffLabel}.`,
        "Please open your profile and set your country.",
        `Update your profile here: ${profileUrl}`,
        "After setting your country, let your agent know in the LineScout app.",
      ],
      footerNote: `This email was sent at the request of your LineScout agent for ${customerLabel}.`,
    });

    const sendResult = await sendEmail({
      to: email,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    if (!sendResult.ok) {
      return NextResponse.json({ ok: false, error: sendResult.error }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("POST /api/internal/handoffs/request-country error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to send email" }, { status: 500 });
  } finally {
    conn.release();
  }
}
