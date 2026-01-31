import { NextResponse } from "next/server";
import { requireAgent } from "@/lib/auth";
import { queryOne } from "@/lib/db";

type Platform = "ios" | "android" | "web";

function isPlatform(x: any): x is Platform {
  return x === "ios" || x === "android" || x === "web";
}

export async function POST(req: Request) {
  try {
    const agent = await requireAgent(req);

    const body = await req.json().catch(() => null);
    const platform = body?.platform;
    const token = String(body?.token || "").trim();
    const device_id = body?.device_id ? String(body.device_id).trim() : null;
    const app_version = body?.app_version ? String(body.app_version).trim() : null;
    const locale = body?.locale ? String(body.locale).trim() : null;

    if (!isPlatform(platform)) {
      return NextResponse.json({ ok: false, error: "Invalid platform" }, { status: 400 });
    }

    if (!token || token.length < 20 || token.length > 512) {
      return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 400 });
    }

    await queryOne(
      `
      INSERT INTO linescout_agent_device_tokens
        (agent_id, platform, token, device_id, app_version, locale, is_active, last_seen_at)
      VALUES
        (?, ?, ?, ?, ?, ?, 1, NOW())
      ON DUPLICATE KEY UPDATE
        device_id = VALUES(device_id),
        app_version = VALUES(app_version),
        locale = VALUES(locale),
        is_active = 1,
        last_seen_at = NOW(),
        updated_at = NOW()
      `,
      [agent.id, platform, token, device_id, app_version, locale]
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const code = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
}