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

export async function GET(req: Request) {
  try {
    const userId = await getUserIdFromBearer(req);
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const conversationId = Number(url.searchParams.get("conversation_id"));
    const limit = Math.min(Number(url.searchParams.get("limit") || 50), 200);
    const beforeId = url.searchParams.get("before_id");
    const beforeIdNum = beforeId ? Number(beforeId) : null;

    if (!conversationId || !Number.isFinite(conversationId)) {
      return NextResponse.json({ ok: false, error: "Invalid conversation_id" }, { status: 400 });
    }

    const conn = await getDb();

    // Ownership check
    const [crows] = await conn.execute<mysql.RowDataPacket[]>(
      "SELECT user_id FROM linescout_conversations WHERE id = ? LIMIT 1",
      [conversationId]
    );
    if (!crows.length) {
      await conn.end();
      return NextResponse.json({ ok: false, error: "Conversation not found" }, { status: 404 });
    }
    if (Number(crows[0].user_id) !== userId) {
      await conn.end();
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const params: any[] = [conversationId];
    let where = "conversation_id = ?";

    if (beforeIdNum && Number.isFinite(beforeIdNum)) {
      where += " AND id < ?";
      params.push(beforeIdNum);
    }

    const [mrows] = await conn.execute<mysql.RowDataPacket[]>(
      `
      SELECT id, sender_type, sender_id, message_text, created_at
      FROM linescout_messages
      WHERE ${where}
      ORDER BY id DESC
      LIMIT ?
      `,
      [...params, limit]
    );

    await conn.end();

    // Return in chronological order for UI
    const messages = mrows.reverse();

    return NextResponse.json({ ok: true, messages });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}