import { NextRequest, NextResponse } from "next/server";
import mysql from "mysql2/promise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = Number(body?.id);
    const agent = String(body?.agent || "").trim();

    if (!id || !agent) {
      return NextResponse.json(
        { ok: false, error: "Missing id or agent" },
        { status: 400 }
      );
    }

    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });

    // Only claim if still pending
    const [result] = await connection.execute(
      `
      UPDATE linescout_handoffs
      SET status='claimed', claimed_by=?, claimed_at=NOW()
      WHERE id=? AND status='pending'
      `,
      [agent, id]
    );

    await connection.end();

    // @ts-ignore mysql2 result shape
    const affected = result?.affectedRows ?? 0;

    if (affected === 0) {
      return NextResponse.json(
        { ok: false, error: "Already claimed or not pending." },
        { status: 409 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Claim error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to claim handoff" },
      { status: 500 }
    );
  }
}