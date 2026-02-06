import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import type { RowDataPacket } from "mysql2/promise";

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const conn = await db.getConnection();
    try {
      const [rows] = await conn.query<RowDataPacket[]>(
        `
        SELECT *
        FROM linescout_white_label_projects
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT 1
        `,
        [user.id]
      );

      if (!rows.length) {
        return NextResponse.json({ ok: true, project: null });
      }

      return NextResponse.json({ ok: true, project: rows[0] });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    const msg = e?.message || "Unauthorized";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
