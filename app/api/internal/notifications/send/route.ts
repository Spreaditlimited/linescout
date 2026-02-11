import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import type { Transporter } from "nodemailer";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodemailer = require("nodemailer");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Target = "agent" | "user";
type Audience = "single" | "all";

async function sendExpoPush(tokens: string[], payload: { title: string; body: string; data?: any }) {
  const clean = (tokens || []).map((t) => String(t || "").trim()).filter(Boolean);
  if (!clean.length) return;

  const chunkSize = 100;
  for (let i = 0; i < clean.length; i += chunkSize) {
    const batch = clean.slice(i, i + chunkSize);
    const messages = batch.map((to) => ({
      to,
      sound: "default",
      title: payload.title,
      body: payload.body,
      data: payload.data || {},
    }));

    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(messages),
    }).catch(() => {});
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

async function sendEmail(to: string, subject: string, text: string, html?: string) {
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
    to,
    subject,
    text,
    html: html || text,
  });

  return { ok: true as const };
}

async function requireAdmin() {
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
      `SELECT u.id, u.role, u.is_active
       FROM internal_sessions s
       JOIN internal_users u ON u.id = s.user_id
       WHERE s.session_token = ?
         AND s.revoked_at IS NULL
         AND u.is_active = 1
       LIMIT 1`,
      [token]
    );

    if (!rows?.length) return { ok: false as const, status: 401 as const, error: "Invalid session" };

    const role = String(rows[0].role || "");
    if (role !== "admin") return { ok: false as const, status: 403 as const, error: "Forbidden" };

    return { ok: true as const, id: Number(rows[0].id) };
  } finally {
    conn.release();
  }
}

function isTarget(x: any): x is Target {
  return x === "agent" || x === "user";
}

function isAudience(x: any): x is Audience {
  return x === "single" || x === "all";
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const target = body?.target;
  const audience = body?.audience;
  const recipientId = body?.recipient_id ? Number(body.recipient_id) : null;
  const title = String(body?.title || "").trim();
  const message = String(body?.body || "").trim();
  const data = body?.data ?? null;

  if (!isTarget(target)) {
    return NextResponse.json({ ok: false, error: "target must be 'agent' or 'user'" }, { status: 400 });
  }
  if (!isAudience(audience)) {
    return NextResponse.json({ ok: false, error: "audience must be 'single' or 'all'" }, { status: 400 });
  }
  if (!title) return NextResponse.json({ ok: false, error: "Title is required" }, { status: 400 });
  if (!message) return NextResponse.json({ ok: false, error: "Message is required" }, { status: 400 });

  if (audience === "single" && (!recipientId || Number.isNaN(recipientId))) {
    return NextResponse.json({ ok: false, error: "recipient_id is required" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    const dataJson = data ? JSON.stringify(data) : null;

    let inserted = 0;
    if (audience === "single") {
      if (target === "agent") {
        await conn.query(
          `INSERT INTO linescout_notifications
            (target, agent_id, title, body, data_json, sent_by_internal_user_id)
           VALUES ('agent', ?, ?, ?, ?, ?)`,
          [recipientId, title, message, dataJson, auth.id]
        );
      } else {
        await conn.query(
          `INSERT INTO linescout_notifications
            (target, user_id, title, body, data_json, sent_by_internal_user_id)
           VALUES ('user', ?, ?, ?, ?, ?)`,
          [recipientId, title, message, dataJson, auth.id]
        );
      }
      inserted = 1;
    } else {
      if (target === "agent") {
        const [res]: any = await conn.query(
          `INSERT INTO linescout_notifications
            (target, agent_id, title, body, data_json, sent_by_internal_user_id)
           SELECT 'agent', u.id, ?, ?, ?, ?
           FROM internal_users u
           WHERE u.role = 'agent' AND u.is_active = 1`,
          [title, message, dataJson, auth.id]
        );
        inserted = Number(res?.affectedRows || 0);
      } else {
        const [res]: any = await conn.query(
          `INSERT INTO linescout_notifications
            (target, user_id, title, body, data_json, sent_by_internal_user_id)
           SELECT 'user', u.id, ?, ?, ?, ?
           FROM users u`,
          [title, message, dataJson, auth.id]
        );
        inserted = Number(res?.affectedRows || 0);
      }
    }

    const [tokenRows]: any =
      target === "agent"
        ? await conn.query(
            `SELECT token FROM linescout_agent_device_tokens WHERE is_active = 1${
              audience === "single" ? " AND agent_id = ?" : ""
            }`,
            audience === "single" ? [recipientId] : []
          )
        : await conn.query(
            `SELECT token FROM linescout_device_tokens WHERE is_active = 1${
              audience === "single" ? " AND user_id = ?" : ""
            }`,
            audience === "single" ? [recipientId] : []
          );

    const tokens = (tokenRows || []).map((r: any) => r.token).filter(Boolean);
    await sendExpoPush(tokens, { title, body: message, data: data || {} });

    if (audience === "single" && target === "agent") {
      const [emailRows]: any = await conn.query(
        `
        SELECT COALESCE(ap.email, u.email) AS email
        FROM internal_users u
        LEFT JOIN linescout_agent_profiles ap ON ap.internal_user_id = u.id
        WHERE u.id = ?
        LIMIT 1
        `,
        [recipientId]
      );
      const email = String(emailRows?.[0]?.email || "").trim();
      if (email) {
        await sendEmail(email, title, message).catch(() => null);
      }
    }

    return NextResponse.json({ ok: true, inserted, sent: tokens.length });
  } finally {
    conn.release();
  }
}
