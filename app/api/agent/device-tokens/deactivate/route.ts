import { NextResponse } from "next/server";
import { requireAgent } from "@/lib/auth";
import { queryOne } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const agent = await requireAgent(req);

    const body = await req.json().catch(() => null);
    const token = String(body?.token || "").trim();

    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing token" }, { status: 400 });
    }

    await queryOne(
      `
      UPDATE linescout_agent_device_tokens
      SET is_active = 0, updated_at = NOW()
      WHERE agent_id = ? AND token = ?
      LIMIT 1
      `,
      [agent.id, token]
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const code = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
}