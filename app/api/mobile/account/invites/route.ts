import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { requireAccountUser } from "@/lib/auth";
import { sendNoticeEmail } from "@/lib/notice-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export async function GET(req: Request) {
  try {
    const user = await requireAccountUser(req);
    const conn = await db.getConnection();
    try {
      const [rows]: any = await conn.query(
        `
        SELECT
          i.id,
          i.email,
          i.email_normalized,
          i.role,
          i.expires_at,
          i.accepted_at,
          i.revoked_at,
          i.created_at,
          u.email AS invited_by_email
        FROM linescout_account_invites i
        LEFT JOIN users u ON u.id = i.invited_by_user_id
        WHERE i.account_id = ?
        ORDER BY i.id DESC
        LIMIT 100
        `,
        [Number(user.account_id)]
      );

      return NextResponse.json({
        ok: true,
        invites: (rows || []).map((r: any) => {
          const accepted = !!r.accepted_at;
          const revoked = !!r.revoked_at;
          const expired = !accepted && !revoked && r.expires_at ? Date.now() > new Date(r.expires_at).getTime() : false;
          const status = accepted ? "accepted" : revoked ? "revoked" : expired ? "expired" : "pending";
          return {
            id: Number(r.id || 0),
            email: String(r.email || ""),
            email_normalized: String(r.email_normalized || ""),
            role: String(r.role || "member"),
            status,
            expires_at: r.expires_at || null,
            accepted_at: r.accepted_at || null,
            revoked_at: r.revoked_at || null,
            invited_by_email: r.invited_by_email ? String(r.invited_by_email) : null,
            created_at: r.created_at || null,
          };
        }),
      });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    const msg = e?.message || "Unauthorized";
    const code = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAccountUser(req);
    if (String(user.account_role || "") !== "owner") {
      return NextResponse.json({ ok: false, error: "Only account owner can send invites." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const emailRaw = String(body?.email || "").trim();
    const email = normalizeEmail(emailRaw);
    const role = "member";

    if (!isValidEmail(email)) {
      return NextResponse.json({ ok: false, error: "Valid email is required." }, { status: 400 });
    }

    if (email === normalizeEmail(user.email)) {
      return NextResponse.json({ ok: false, error: "You are already on this account." }, { status: 400 });
    }

    const conn = await db.getConnection();
    try {
      const [userRows]: any = await conn.query(
        `SELECT id FROM users WHERE email_normalized = ? LIMIT 1`,
        [email]
      );
      const invitedUserId = Number(userRows?.[0]?.id || 0) || null;
      if (invitedUserId) {
        const [memberRows]: any = await conn.query(
          `
          SELECT id
          FROM linescout_account_members
          WHERE account_id = ?
            AND user_id = ?
            AND status = 'active'
          LIMIT 1
          `,
          [Number(user.account_id), invitedUserId]
        );
        if (memberRows?.length) {
          return NextResponse.json({ ok: false, error: "User is already a member." }, { status: 409 });
        }
      }

      const [pendingRows]: any = await conn.query(
        `
        SELECT id
        FROM linescout_account_invites
        WHERE account_id = ?
          AND email_normalized = ?
          AND accepted_at IS NULL
          AND revoked_at IS NULL
          AND expires_at > NOW()
        LIMIT 1
        `,
        [Number(user.account_id), email]
      );

      if (pendingRows?.length) {
        return NextResponse.json({ ok: false, error: "An active invite already exists for this email." }, { status: 409 });
      }

      const token = randomToken(32);
      const tokenHash = sha256(token);
      const [ins]: any = await conn.query(
        `
        INSERT INTO linescout_account_invites
          (account_id, email, email_normalized, role, token_hash, invited_by_user_id, expires_at)
        VALUES
          (?, ?, ?, ?, ?, ?, (NOW() + INTERVAL 7 DAY))
        `,
        [Number(user.account_id), emailRaw || email, email, role, tokenHash, Number(user.id)]
      );

      const [accountRows]: any = await conn.query(
        `
        SELECT name
        FROM linescout_accounts
        WHERE id = ?
        LIMIT 1
        `,
        [Number(user.account_id)]
      );
      const accountName = String(accountRows?.[0]?.name || "LineScout Account");
      const appUrl = String(process.env.NEXT_PUBLIC_APP_URL || "https://linescout.sureimports.com").replace(/\/+$/, "");
      const acceptUrl = `${appUrl}/profile?invite_token=${encodeURIComponent(token)}`;

      try {
        await sendNoticeEmail({
          to: email,
          subject: "You were invited to a LineScout account",
          title: "You have a new LineScout invite",
          lines: [
            `You were invited to join "${accountName}".`,
            "Sign in with this email, then accept the invite from your profile.",
            "This invite expires in 7 days.",
          ],
          ctaLabel: "Open invite",
          ctaUrl: acceptUrl,
          footerNote: "This email was sent because a LineScout account owner invited you.",
        });
      } catch {
        // non-fatal: invite still exists and can be copied manually by owner later
      }

      return NextResponse.json({
        ok: true,
        invite_id: Number(ins?.insertId || 0),
      });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    const msg = e?.message || "Unauthorized";
    const code = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
}

