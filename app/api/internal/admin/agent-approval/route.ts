import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildNoticeEmail } from "@/lib/otp-email";
import type { Transporter } from "nodemailer";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodemailer = require("nodemailer");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function num(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
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

function safeFirstName(name: string | null) {
  const raw = String(name || "").trim();
  if (!raw) return "";
  return raw.split(" ")[0] || raw;
}

function normalizeChinaPhone(value: string) {
  const raw = String(value || "").trim().replace(/[\s-]/g, "");
  if (!raw) return "";
  if (raw.startsWith("+86")) return raw;
  if (raw.startsWith("86")) return `+${raw}`;
  return raw;
}

function isValidChinaMobile(value: string) {
  return /^\+86(1[3-9]\d{9})$/.test(value);
}

function buildApprovalEmail(params: { firstName: string | null }) {
  const firstName = safeFirstName(params.firstName) || "there";
  const link = "https://linescout.sureimports.com/agents";
  return buildNoticeEmail({
    subject: "Your LineScout Agent Account Has Been Approved",
    title: "Agent account approved",
    lines: [
      `Dear ${firstName},`,
      "Congratulations.",
      "We have approved your LineScout Agent account. You can now start claiming projects.",
      "Please, ensure to follow our guidelines and chat politely with customers.",
      `Please, take your time to read our Agents' Terms and Conditions: ${link}`,
      "Thank you.",
      "Kind Regards,",
      "LineScout Approval Team",
    ],
    footerNote: "This email was sent because your LineScout Agent account was approved.",
  });
}

function buildRejectionEmail(params: { firstName: string | null; reason: string }) {
  const firstName = safeFirstName(params.firstName) || "there";
  const reason = String(params.reason || "").trim();
  return buildNoticeEmail({
    subject: "Your LineScout Agent Application Has Been Rejected.",
    title: "Agent application rejected",
    lines: [
      `Dear ${firstName},`,
      reason || "Your application was rejected.",
      "Kind regards,",
      "LineScout Approval Team",
    ],
    footerNote: "This email was sent because your LineScout Agent application was rejected.",
  });
}

async function requireAdminSession(req: Request) {
  const primaryCookieName = (process.env.INTERNAL_AUTH_COOKIE_NAME || "").trim();
  const cookieNames = [
    primaryCookieName,
    "linescout_internal_session",
    "linescout_admin_session",
  ].filter(Boolean);
  if (!cookieNames.length) {
    return { ok: false as const, status: 500 as const, error: "Missing INTERNAL_AUTH_COOKIE_NAME" };
  }

  const bearer = req.headers.get("authorization") || "";
  const bearerToken = bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : "";

  const cookieHeader = req.headers.get("cookie") || "";
  const cookieToken =
    cookieHeader
      .split(/[;,]/)
      .map((c) => c.trim())
      .map((c) => {
        const [name, ...rest] = c.split("=");
        return { name, value: rest.join("=") };
      })
      .find((c) => cookieNames.includes(String(c.name || "")))
      ?.value || "";

  const token = bearerToken || cookieToken;
  if (!token) {
    return {
      ok: false as const,
      status: 401 as const,
      error: "Not signed in",
      debug: {
        cookie_header: cookieHeader,
        cookie_names: cookieNames,
        bearer_present: !!bearerToken,
        app_header: req.headers.get("x-linescout-app") || "",
        referer: req.headers.get("referer") || "",
      },
    };
  }

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `
      SELECT u.id, u.role, u.is_active
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
    if (String(rows[0].role || "") !== "admin") return { ok: false as const, status: 403 as const, error: "Forbidden" };

    return { ok: true as const, adminId: Number(rows[0].id) };
  } finally {
    conn.release();
  }
}

/**
 * GET /api/internal/admin/agent-approval?page=1&page_size=25
 */
export async function GET(req: Request) {
  const auth = await requireAdminSession(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error, debug: (auth as any).debug },
      { status: auth.status }
    );
  }

  const url = new URL(req.url);
  const page = Math.max(1, num(url.searchParams.get("page"), 1));
  const pageSize = Math.min(100, Math.max(10, num(url.searchParams.get("page_size"), 25)));
  const offset = (page - 1) * pageSize;

  const conn = await db.getConnection();
  try {
    const [totalRows]: any = await conn.query(`SELECT COUNT(*) AS total FROM linescout_agent_profiles`);
    const total = Number(totalRows?.[0]?.total || 0);

    const [rows]: any = await conn.query(
      `
      SELECT
        ap.id AS agent_profile_id,
        ap.internal_user_id,

        iu.username,
        iu.role,
        iu.is_active,

        ap.first_name,
        ap.last_name,
        ap.email,
        ap.china_phone,
        ap.china_phone_verified_at,
        ap.china_city,
        ap.nationality,

        ap.nin,
        ap.nin_verified_at,
        ap.full_address,

        ap.approval_status,
        ap.approved_at,
        ap.approved_by_internal_user_id,
        ap.rejection_reason,

        pa.status AS bank_status,
        pa.verified_at AS bank_verified_at,

        ap.created_at,
        ap.updated_at
      FROM linescout_agent_profiles ap
      JOIN internal_users iu ON iu.id = ap.internal_user_id
      LEFT JOIN linescout_agent_payout_accounts pa ON pa.internal_user_id = ap.internal_user_id
      ORDER BY ap.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [pageSize, offset]
    );

    return NextResponse.json({
      ok: true,
      page,
      page_size: pageSize,
      total,
      items: rows || [],
    });
  } catch (e: any) {
    console.error("GET /api/internal/admin/agent-approval error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to load agents" }, { status: 500 });
  } finally {
    conn.release();
  }
}

/**
 * POST /api/internal/admin/agent-approval
 * body: { internal_user_id: number, action: "approve" | "block" | "pending" }
 */
export async function POST(req: Request) {
  const auth = await requireAdminSession(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error, debug: (auth as any).debug },
      { status: auth.status }
    );
  }

  const body = await req.json().catch(() => null);
  const internalUserId = Number(body?.internal_user_id);
  const action = String(body?.action || "").toLowerCase();
  const reason = String(body?.reason || "").trim();

  if (!Number.isFinite(internalUserId) || internalUserId <= 0) {
    return NextResponse.json({ ok: false, error: "Invalid internal_user_id" }, { status: 400 });
  }
  if (!["approve", "block", "pending"].includes(action)) {
    return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });
  }
  if (action === "block" && !reason) {
    return NextResponse.json({ ok: false, error: "Rejection reason is required" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Pull profile readiness fields + bank existence
    const [pRows]: any = await conn.query(
      `
      SELECT
        ap.id,
        ap.internal_user_id,
        ap.first_name,
        ap.email,
        ap.china_phone_verified_at,
        ap.nin,
        ap.nin_verified_at,
        ap.full_address,
        pa.status AS bank_status,
        pa.verified_at AS bank_verified_at
      FROM linescout_agent_profiles ap
      LEFT JOIN linescout_agent_payout_accounts pa ON pa.internal_user_id = ap.internal_user_id
      WHERE ap.internal_user_id = ?
      LIMIT 1
      `,
      [internalUserId]
    );

    if (!pRows?.length) {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "Agent profile not found" }, { status: 404 });
    }

    const p = pRows[0];

    const phoneOk =
      !!p.china_phone_verified_at ||
      isValidChinaMobile(normalizeChinaPhone(p.china_phone || ""));
    const ninProvided = !!(p.nin && String(p.nin).trim());
    const ninOk = !!p.nin_verified_at;
    const addressOk = !!(p.full_address && String(p.full_address).trim());
    const bankVerifiedAt = p.bank_verified_at ? String(p.bank_verified_at) : "";
    const bankStatus = String(p.bank_status || "").toLowerCase();
    const bankOk = !!bankVerifiedAt || bankStatus === "verified";

    const ready = phoneOk && ninProvided && ninOk && addressOk && bankOk;

    if (action === "approve" && !ready) {
      await conn.rollback();
      return NextResponse.json(
        {
          ok: false,
          error:
            "Cannot approve agent. Missing readiness requirements (China phone, NIN provided + verified, address, bank verified).",
        },
        { status: 400 }
      );
    }

    if (action === "approve") {
      await conn.query(
        `
        UPDATE linescout_agent_profiles
        SET approval_status = 'approved',
            approved_at = NOW(),
            approved_by_internal_user_id = ?,
            rejection_reason = NULL
        WHERE internal_user_id = ?
        `,
        [auth.adminId, internalUserId]
      );
    }

    if (action === "block") {
      await conn.query(
        `
        UPDATE linescout_agent_profiles
        SET approval_status = 'blocked',
            approved_at = NULL,
            approved_by_internal_user_id = NULL,
            rejection_reason = ?
        WHERE internal_user_id = ?
        `,
        [reason, internalUserId]
      );
    }

    if (action === "pending") {
      await conn.query(
        `
        UPDATE linescout_agent_profiles
        SET approval_status = 'pending',
            approved_at = NULL,
            approved_by_internal_user_id = NULL,
            rejection_reason = NULL
        WHERE internal_user_id = ?
        `,
        [internalUserId]
      );
    }

    const allowView = action === "approve" ? 1 : 0;
    await conn.query(
      `
      INSERT INTO internal_user_permissions (user_id, can_view_handoffs, can_view_leads)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        can_view_handoffs = VALUES(can_view_handoffs),
        can_view_leads = VALUES(can_view_leads)
      `,
      [internalUserId, allowView, allowView]
    );

    await conn.commit();

    let emailResult: any = null;
    const agentEmail = String(p.email || "").trim();
    if ((action === "approve" || action === "block") && agentEmail.includes("@")) {
      try {
        const mail = action === "approve"
          ? buildApprovalEmail({ firstName: p.first_name })
          : buildRejectionEmail({ firstName: p.first_name, reason });
        emailResult = await sendEmail({
          to: agentEmail,
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
        });
      } catch (e: any) {
        emailResult = { ok: false, error: e?.message || "Failed to send email" };
      }
    }

    // Return updated row for UI patching
    const [rows]: any = await conn.query(
      `
      SELECT
        ap.id AS agent_profile_id,
        ap.internal_user_id,

        iu.username,
        iu.role,
        iu.is_active,

        ap.first_name,
        ap.last_name,
        ap.email,
        ap.china_phone,
        ap.china_phone_verified_at,
        ap.china_city,
        ap.nationality,

        ap.nin,
        ap.nin_verified_at,
        ap.full_address,

        ap.approval_status,
        ap.approved_at,
        ap.approved_by_internal_user_id,
        ap.rejection_reason,

        pa.status AS bank_status,
        pa.verified_at AS bank_verified_at,

        ap.created_at,
        ap.updated_at
      FROM linescout_agent_profiles ap
      JOIN internal_users iu ON iu.id = ap.internal_user_id
      LEFT JOIN linescout_agent_payout_accounts pa ON pa.internal_user_id = ap.internal_user_id
      WHERE ap.internal_user_id = ?
      LIMIT 1
      `,
      [internalUserId]
    );

    return NextResponse.json({
      ok: true,
      item: rows?.[0] || null,
      email_sent: emailResult?.ok === true,
      email_error: emailResult && emailResult.ok !== true ? emailResult : null,
    });
  } catch (e: any) {
    try {
      await conn.rollback();
    } catch {}
    console.error("POST /api/internal/admin/agent-approval error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to update agent" }, { status: 500 });
  } finally {
    conn.release();
  }
}
