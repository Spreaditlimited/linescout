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

export async function POST(req: Request) {
  try {
    const userId = await getUserIdFromBearer(req);
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const routeType = String(body?.route_type || "");

    if (
      routeType !== "machine_sourcing" &&
      routeType !== "white_label" &&
      routeType !== "simple_sourcing"
    ) {
      return NextResponse.json({ ok: false, error: "Invalid route_type" }, { status: 400 });
    }

    const conn = await getDb();

    // Try to find an active conversation for this user + route
    const [existing] = await conn.execute<mysql.RowDataPacket[]>(
      `
      SELECT id, chat_mode, human_message_limit, human_message_used, human_access_expires_at, payment_status, assigned_agent_id
      FROM linescout_conversations
      WHERE user_id = ? AND route_type = ?
      ORDER BY id DESC
      LIMIT 1
      `,
      [userId, routeType]
    );

    if (existing.length) {
      await conn.end();
      return NextResponse.json({ ok: true, conversation: existing[0] });
    }

    // Create new conversation (default AI-only)
    // Pre-payment limited human access is NOT granted here.
    // It will be granted by rules later when the user qualifies.
    const [ins] = await conn.execute<mysql.ResultSetHeader>(
      `
      INSERT INTO linescout_conversations
        (user_id, route_type, chat_mode, human_message_limit, human_message_used, payment_status)
      VALUES
        (?, ?, 'ai_only', 0, 0, 'unpaid')
      `,
      [userId, routeType]
    );

    const convoId = Number(ins.insertId);

    const [created] = await conn.execute<mysql.RowDataPacket[]>(
      `
      SELECT id, chat_mode, human_message_limit, human_message_used, human_access_expires_at, payment_status, assigned_agent_id
      FROM linescout_conversations
      WHERE id = ?
      LIMIT 1
      `,
      [convoId]
    );

    await conn.end();

    return NextResponse.json({ ok: true, conversation: created[0] });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
