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

    const conn = await getDb();

    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      `
      SELECT *
      FROM linescout_white_label_projects
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT 1
      `,
      [userId]
    );

    await conn.end();

    if (!rows.length) {
      return NextResponse.json({ ok: true, project: null });
    }

    return NextResponse.json({ ok: true, project: rows[0] });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}