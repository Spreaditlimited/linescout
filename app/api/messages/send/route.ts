import { NextResponse } from "next/server";
import crypto from "crypto";
import mysql from "mysql2/promise";

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

async function getDb() {
  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME;

  if (!host || !user || !password || !database) {
    throw new Error("Missing DB env vars (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME)");
  }

  return mysql.createConnection({ host, user, password, database });
}

async function getUserIdFromBearer(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return null;

  const tokenHash = sha256(token);
  const conn = await getDb();

  const [rows] = await conn.execute<mysql.RowDataPacket[]>(
    `
    SELECT u.id
    FROM linescout_user_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.refresh_token_hash = ?
      AND s.revoked_at IS NULL
      AND s.expires_at > NOW()
    LIMIT 1
    `,
    [tokenHash]
  );

  await conn.end();

  if (!rows.length) return null;
  return Number(rows[0].id);
}

type SenderType = "user" | "ai" | "agent";

function canSendAgentMessage(convo: any) {
  // Paid human: always allowed
  if (convo.payment_status === "paid" || convo.chat_mode === "paid_human") return { ok: true };

  // Limited human: allowed if not expired and messages left
  if (convo.chat_mode === "limited_human") {
    const limit = Number(convo.human_message_limit || 0);
    const used = Number(convo.human_message_used || 0);
    if (!convo.human_access_expires_at) return { ok: false, reason: "Human access expired" };

    const expiresAt = new Date(convo.human_access_expires_at);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      return { ok: false, reason: "Human access expired" };
    }
    if (used >= limit) return { ok: false, reason: "Human message limit reached" };

    return { ok: true };
  }

  // AI-only: no agent messages
  return { ok: false, reason: "Human chat not enabled" };
}

export async function POST(req: Request) {
  try {
    const userId = await getUserIdFromBearer(req);
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));

    const conversationId = Number(body?.conversation_id);
    const messageText = String(body?.message_text || "").trim();
    const senderType = String(body?.sender_type || "user") as SenderType;

    if (!conversationId || !Number.isFinite(conversationId)) {
      return NextResponse.json({ ok: false, error: "Invalid conversation_id" }, { status: 400 });
    }
    if (!messageText || messageText.length > 8000) {
      return NextResponse.json({ ok: false, error: "Invalid message_text" }, { status: 400 });
    }
    if (!["user", "ai", "agent"].includes(senderType)) {
      return NextResponse.json({ ok: false, error: "Invalid sender_type" }, { status: 400 });
    }

    const conn = await getDb();

    // Fetch conversation and confirm ownership (for now, user only can write user messages)
    const [crows] = await conn.execute<mysql.RowDataPacket[]>(
      `
      SELECT *
      FROM linescout_conversations
      WHERE id = ?
      LIMIT 1
      `,
      [conversationId]
    );

    if (!crows.length) {
      await conn.end();
      return NextResponse.json({ ok: false, error: "Conversation not found" }, { status: 404 });
    }

    const convo = crows[0];

    // Ownership check for user sending user messages
    if (senderType === "user" && Number(convo.user_id) !== userId) {
      await conn.end();
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    // For MVP: block agent/ai from mobile client.
    // Agent messages will come from internal admin later with separate auth.
    if (senderType !== "user") {
      await conn.end();
      return NextResponse.json({ ok: false, error: "Not allowed from client" }, { status: 403 });
    }

    // Insert user message
    await conn.execute(
      `
      INSERT INTO linescout_messages (conversation_id, sender_type, sender_id, message_text)
      VALUES (?, 'user', ?, ?)
      `,
      [conversationId, userId, messageText]
    );

    await conn.end();

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}