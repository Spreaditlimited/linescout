// app/api/mobile/paid-chat/escalate/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  conversation_id?: number | string;
  kind?: "report" | "escalate";
  reason?: string;
};

function safeInt(v: any): number {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function clampText(s: any, max = 800) {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return t.length > max ? t.slice(0, max) + "…" : t;
}

// basic phone redaction (Nigeria + general digits)
// not perfect, but prevents obvious numbers being forwarded around
function redactPhones(s: string) {
  return s
    .replace(/\b(\+?\d[\d\s().-]{7,}\d)\b/g, "[redacted number]")
    .replace(/\b0\d{10}\b/g, "[redacted number]"); // NG common 11 digits
}

function formatTranscript(rows: any[]) {
  // rows come in DESC; we’ll reverse for reading order
  const ordered = [...rows].reverse();

  const lines: string[] = [];
  for (const r of ordered) {
    const who =
      r.sender_type === "user"
        ? "Customer"
        : r.sender_type === "agent"
        ? "Agent"
        : r.sender_type === "ai"
        ? "AI"
        : String(r.sender_type || "Unknown");

    const raw = String(r.message_text || "");
    const text = redactPhones(clampText(raw, 800));
    const at = r.created_at ? new Date(r.created_at).toISOString() : "";

    lines.push(`[${who}] ${at}\n${text}\n`);
  }

  return lines.join("\n");
}

export async function POST(req: Request) {
  try {
    const u = await requireUser(req);
    const userId = Number((u as any)?.id || 0);
    const customerEmail = String((u as any)?.email || "").trim();

    const body: Body = await req.json().catch(() => ({}));
    const conversationId = safeInt(body.conversation_id);
    const kind = body.kind === "report" ? "report" : "escalate";
    const reason = clampText(body.reason, 2000);

    if (!conversationId) {
      return NextResponse.json(
        { ok: false, error: "conversation_id is required" },
        { status: 400 }
      );
    }

    if (!customerEmail) {
      return NextResponse.json(
        { ok: false, error: "User email missing on account" },
        { status: 400 }
      );
    }

    const SMTP_HOST = process.env.SMTP_HOST?.trim();
    const SMTP_PORT = Number(process.env.SMTP_PORT || 0);
    const SMTP_USER = process.env.SMTP_USER?.trim();
    const SMTP_PASS = process.env.SMTP_PASS?.trim();
    const SMTP_FROM = (process.env.SMTP_FROM || "no-reply@sureimports.com").trim();

    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
      return NextResponse.json(
        { ok: false, error: "SMTP is not configured (SMTP_HOST/PORT/USER/PASS)" },
        { status: 500 }
      );
    }

    const conn = await db.getConnection();
    try {
      // Ensure user owns conversation and fetch assigned agent + handoff
      const [crows]: any = await conn.query(
        `
        SELECT
          c.id,
          c.user_id,
          c.handoff_id,
          c.assigned_agent_id,
          c.chat_mode,
          c.payment_status,
          c.project_status
        FROM linescout_conversations c
        WHERE c.id = ? AND c.user_id = ?
        LIMIT 1
        `,
        [conversationId, userId]
      );

      if (!crows?.length) {
        return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      }

      const c = crows[0];

      // Pull agent username (internal_users)
      let agentUsername: string | null = null;
      if (c.assigned_agent_id) {
        const [arows]: any = await conn.query(
          `
          SELECT username
          FROM internal_users
          WHERE id = ?
            AND is_active = 1
          LIMIT 1
          `,
          [c.assigned_agent_id]
        );
        agentUsername = arows?.[0]?.username ? String(arows[0].username) : null;
      }

      // Transcript snapshot (last 12 messages)
      const [mrows]: any = await conn.query(
        `
        SELECT sender_type, message_text, created_at
        FROM linescout_messages
        WHERE conversation_id = ?
        ORDER BY id DESC
        LIMIT 12
        `,
        [conversationId]
      );

      const transcript = formatTranscript(Array.isArray(mrows) ? mrows : []);

      const subject = `[LineScout][${kind.toUpperCase()}] conversation_id=${conversationId}${
        c.handoff_id ? ` handoff_id=${c.handoff_id}` : ""
      }`;

      const text = [
        `Type: ${kind}`,
        `Customer: ${customerEmail} (user_id=${userId})`,
        `Conversation ID: ${conversationId}`,
        `Handoff ID: ${c.handoff_id ?? "N/A"}`,
        `Agent: ${agentUsername ?? "Unassigned"}`,
        `chat_mode=${String(c.chat_mode)} payment_status=${String(c.payment_status)} project_status=${String(
          c.project_status
        )}`,
        ``,
        `Reason:`,
        reason ? redactPhones(reason) : "(no reason provided)",
        ``,
        `Transcript snapshot (latest 12):`,
        transcript || "(no messages found)",
      ].join("\n");

      // NOTE: require() avoids TS type errors for nodemailer
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const nodemailer = require("nodemailer") as any;

      const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465, // true for 465, false for 587/25
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS,
        },
      });

      await transporter.sendMail({
        to: "hello@sureimports.com",
        from: SMTP_FROM,
        replyTo: customerEmail, // IMPORTANT: this is the reliable “sender = customer” behavior
        subject,
        text,
      });

      return NextResponse.json({ ok: true });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    console.error("paid-chat/escalate error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to escalate" }, { status: 500 });
  }
}