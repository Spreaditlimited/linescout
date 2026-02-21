import { NextRequest, NextResponse } from "next/server";
import mysql from "mysql2/promise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ensureClaimAuditTable(conn: any) {
  await conn.query(
    `
    CREATE TABLE IF NOT EXISTS linescout_handoff_claim_audits (
      id INT AUTO_INCREMENT PRIMARY KEY,
      handoff_id INT NOT NULL,
      conversation_id INT NULL,
      claimed_by_id INT NULL,
      claimed_by_name VARCHAR(120) NULL,
      claimed_by_role VARCHAR(32) NULL,
      previous_status VARCHAR(32) NULL,
      new_status VARCHAR(32) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_handoff_claim_handoff (handoff_id),
      INDEX idx_handoff_claim_created (created_at)
    )
    `
  );
}

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
    await ensureClaimAuditTable(connection);

    // Only claim if still pending
    const [result] = await connection.execute(
      `
      UPDATE linescout_handoffs
      SET status='claimed', claimed_by=?, claimed_at=NOW()
      WHERE id=? AND status='pending'
      `,
      [agent, id]
    );

    // @ts-ignore mysql2 result shape
    const affected = result?.affectedRows ?? 0;

    if (affected > 0) {
      await connection.execute(
        `
        INSERT INTO linescout_handoff_claim_audits
          (handoff_id, conversation_id, claimed_by_id, claimed_by_name, claimed_by_role,
           previous_status, new_status, created_at)
        VALUES (?, NULL, NULL, ?, NULL, 'pending', 'claimed', NOW())
        `,
        [id, agent]
      );
    }

    await connection.end();

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
