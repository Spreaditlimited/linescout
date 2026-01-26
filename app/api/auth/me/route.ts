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

export async function GET(req: Request) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing token" }, { status: 401 });
    }

    const tokenHash = sha256(token);
    const conn = await getDb();

    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      `
      SELECT u.id, u.email, u.display_name
      FROM linescout_user_sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.refresh_token_hash = ?
        AND s.revoked_at IS NULL
        AND s.expires_at > NOW()
      LIMIT 1
      `,
      [tokenHash]
    );

    if (!rows.length) {
      await conn.end();
      return NextResponse.json({ ok: false, error: "Invalid session" }, { status: 401 });
    }

    // Update last_seen for hygiene
    await conn.execute(
      "UPDATE linescout_user_sessions SET last_seen_at = NOW() WHERE refresh_token_hash = ?",
      [tokenHash]
    );

    await conn.end();

    return NextResponse.json({
      ok: true,
      user: {
        id: Number(rows[0].id),
        email: String(rows[0].email),
        display_name: rows[0].display_name ? String(rows[0].display_name) : null,
      },
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}