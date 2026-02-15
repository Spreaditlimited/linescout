import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureMachinesReady } from "@/lib/machines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const machineId = Number(body?.machine_id || 0);
    const slug = String(body?.slug || "").trim();

    if (!machineId && !slug) {
      return NextResponse.json({ ok: false, error: "Missing machine_id or slug" }, { status: 400 });
    }

    const conn = await db.getConnection();
    try {
      await ensureMachinesReady(conn);

      let resolvedId = machineId;
      if (!resolvedId && slug) {
        const [rows]: any = await conn.query(
          `
          SELECT id
          FROM linescout_machines
          WHERE slug = ?
          LIMIT 1
          `,
          [slug]
        );
        resolvedId = Number(rows?.[0]?.id || 0);
      }

      if (!resolvedId) {
        return NextResponse.json({ ok: false, error: "Machine not found" }, { status: 404 });
      }

      await conn.query(
        `INSERT INTO linescout_machine_views (machine_id) VALUES (?)`,
        [resolvedId]
      );

      return NextResponse.json({ ok: true });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}

