import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAgent } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ensureDismissalsTable(conn: any) {
  await conn.query(
    `
    CREATE TABLE IF NOT EXISTS linescout_sticky_notice_dismissals (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      target VARCHAR(8) NOT NULL,
      user_id BIGINT NOT NULL DEFAULT 0,
      agent_id BIGINT NOT NULL DEFAULT 0,
      notice_version INT NOT NULL,
      dismissed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_notice_dismiss (target, user_id, agent_id, notice_version)
    )
    `
  );
}

function includesAgent(target: string) {
  return target === "agent" || target === "both";
}

export async function GET(req: Request) {
  try {
    const agent = await requireAgent(req);
    const conn = await db.getConnection();
    try {
      await ensureDismissalsTable(conn);
      const [rows]: any = await conn.query(
        `
        SELECT sticky_notice_enabled, sticky_notice_title, sticky_notice_body, sticky_notice_target, sticky_notice_version
        FROM linescout_settings
        ORDER BY id DESC
        LIMIT 1
        `
      );
      const settings = rows?.[0];
      if (!settings || Number(settings.sticky_notice_enabled || 0) !== 1) {
        return NextResponse.json({ ok: true, notice: null });
      }

      const title = String(settings.sticky_notice_title || "").trim();
      const body = String(settings.sticky_notice_body || "").trim();
      const target = String(settings.sticky_notice_target || "both");
      const version = Number(settings.sticky_notice_version || 0);

      if (!title || !body || !version || !includesAgent(target)) {
        return NextResponse.json({ ok: true, notice: null });
      }

      const [dismissed]: any = await conn.query(
        `
        SELECT id
        FROM linescout_sticky_notice_dismissals
        WHERE target = 'agent'
          AND agent_id = ?
          AND user_id = 0
          AND notice_version = ?
        LIMIT 1
        `,
        [agent.id, version]
      );
      if (dismissed?.length) {
        return NextResponse.json({ ok: true, notice: null });
      }

      return NextResponse.json({
        ok: true,
        notice: {
          version,
          title,
          body,
        },
      });
    } finally {
      conn.release();
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const agent = await requireAgent(req);
    const body = await req.json().catch(() => ({}));
    const version = Number(body?.notice_version || 0);
    if (!Number.isFinite(version) || version <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid notice_version" }, { status: 400 });
    }

    const conn = await db.getConnection();
    try {
      await ensureDismissalsTable(conn);
      await conn.query(
        `
        INSERT IGNORE INTO linescout_sticky_notice_dismissals
          (target, user_id, agent_id, notice_version)
        VALUES
          ('agent', 0, ?, ?)
        `,
        [agent.id, version]
      );
      return NextResponse.json({ ok: true });
    } finally {
      conn.release();
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
}
