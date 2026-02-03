import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildNoticeEmail } from "@/lib/otp-email";

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

function datePartsInTz(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const grab = (type: string) => parts.find((p) => p.type === type)?.value || "";
  return {
    year: Number(grab("year")),
    month: Number(grab("month")),
    day: Number(grab("day")),
  };
}

function toMysql(dt: Date) {
  return dt.toISOString().slice(0, 19).replace("T", " ");
}

function getYesterdayRangeLagos() {
  // Lagos is UTC+1 (no DST)
  const offsetMinutes = 60;
  const now = new Date();
  const parts = datePartsInTz(now, "Africa/Lagos");
  const todayLagosUtc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0));
  const todayStartUtc = new Date(todayLagosUtc.getTime() - offsetMinutes * 60 * 1000);
  const yesterdayStartUtc = new Date(todayStartUtc.getTime() - 24 * 60 * 60 * 1000);

  const label = `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(
    parts.day
  ).padStart(2, "0")}`;

  return {
    startUtc: yesterdayStartUtc,
    endUtc: todayStartUtc,
    label,
  };
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

export async function GET(req: Request) {
  if (!isCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { startUtc, endUtc, label } = getYesterdayRangeLagos();

  const conn = await db.getConnection();
  try {
    const [settingsRows]: any = await conn.query(
      `SELECT payout_summary_email
       FROM linescout_settings
       ORDER BY id DESC
       LIMIT 1`
    );
    const settingsEmail = String(settingsRows?.[0]?.payout_summary_email || "").trim();
    const adminEmail = settingsEmail || "hello@sureimports.com";

    const [userRows]: any = await conn.query(
      `
      SELECT
        pr.id,
        pr.user_id,
        pr.amount,
        pr.status,
        pr.created_at,
        u.email,
        u.display_name
      FROM linescout_user_payout_requests pr
      JOIN users u ON u.id = pr.user_id
      WHERE pr.created_at >= ? AND pr.created_at < ?
      ORDER BY pr.id DESC
      `,
      [toMysql(startUtc), toMysql(endUtc)]
    );

    const [agentRows]: any = await conn.query(
      `
      SELECT
        r.id,
        r.internal_user_id,
        r.amount_kobo,
        r.currency,
        r.status,
        r.requested_at,
        u.username,
        ap.first_name,
        ap.last_name,
        ap.email
      FROM linescout_agent_payout_requests r
      JOIN internal_users u ON u.id = r.internal_user_id
      LEFT JOIN linescout_agent_profiles ap ON ap.internal_user_id = r.internal_user_id
      WHERE r.requested_at >= ? AND r.requested_at < ?
      ORDER BY r.id DESC
      `,
      [toMysql(startUtc), toMysql(endUtc)]
    );

    const userTotal = (userRows || []).reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
    const agentTotal = (agentRows || []).reduce(
      (sum: number, r: any) => sum + Number(r.amount_kobo || 0) / 100,
      0
    );

    const userLines = (userRows || []).length
      ? [
          `Total requests: ${(userRows || []).length}`,
          `Total amount: NGN ${userTotal.toLocaleString()}`,
          "Requests:",
          ...(userRows || []).map((r: any) => {
            const name = String(r.display_name || r.email || `User ${r.user_id}`);
            const amount = Number(r.amount || 0).toLocaleString();
            return `#${r.id} • ${name} • NGN ${amount} • ${r.status}`;
          }),
        ]
      : ["No user payout requests were created yesterday."];

    const agentLines = (agentRows || []).length
      ? [
          `Total requests: ${(agentRows || []).length}`,
          `Total amount: NGN ${agentTotal.toLocaleString()}`,
          "Requests:",
          ...(agentRows || []).map((r: any) => {
            const nameRaw =
              `${String(r.first_name || "").trim()} ${String(r.last_name || "").trim()}`.trim() ||
              String(r.email || "").trim() ||
              String(r.username || `Agent ${r.internal_user_id}`);
            const amount = (Number(r.amount_kobo || 0) / 100).toLocaleString();
            return `#${r.id} • ${nameRaw} • NGN ${amount} • ${r.status}`;
          }),
        ]
      : ["No agent payout requests were created yesterday."];

    const userEmail = buildNoticeEmail({
      subject: `LineScout User Payout Requests — ${label}`,
      title: "User payout requests (yesterday)",
      lines: userLines,
      footerNote: "This email was sent as a daily payout summary.",
    });

    const agentEmail = buildNoticeEmail({
      subject: `LineScout Agent Payout Requests — ${label}`,
      title: "Agent payout requests (yesterday)",
      lines: agentLines,
      footerNote: "This email was sent as a daily payout summary.",
    });

    await sendEmail({ to: adminEmail, subject: userEmail.subject, text: userEmail.text, html: userEmail.html });
    await sendEmail({ to: adminEmail, subject: agentEmail.subject, text: agentEmail.text, html: agentEmail.html });

    return NextResponse.json({ ok: true, user_count: userRows?.length || 0, agent_count: agentRows?.length || 0 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 500 });
  } finally {
    conn.release();
  }
}
