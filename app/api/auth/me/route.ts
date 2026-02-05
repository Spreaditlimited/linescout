import { NextResponse } from "next/server";
import crypto from "crypto";
import { getUserTokenFromRequest } from "@/lib/auth";
import { db } from "@/lib/db";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

async function getDb() {
  return db.getConnection();
}

export async function GET(req: Request) {
  let conn: PoolConnection | null = null;
  try {
    const token = getUserTokenFromRequest(req);

    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing token" }, { status: 401 });
    }

    const tokenHash = sha256(token);
    conn = await getDb();

    const [rows] = await conn.execute<RowDataPacket[]>(
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
      return NextResponse.json({ ok: false, error: "Invalid session" }, { status: 401 });
    }

    // Update last_seen for hygiene
    await conn.execute(
      "UPDATE linescout_user_sessions SET last_seen_at = NOW() WHERE refresh_token_hash = ?",
      [tokenHash]
    );

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
  } finally {
    if (conn) conn.release();
  }
}
