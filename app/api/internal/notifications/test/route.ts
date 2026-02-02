import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function sendExpoPush(tokens: string[], payload: { title: string; body: string; data?: any }) {
  const clean = (tokens || []).map((t) => String(t || "").trim()).filter(Boolean);
  if (!clean.length) return;

  const messages = clean.map((to) => ({
    to,
    sound: "default",
    title: payload.title,
    body: payload.body,
    data: payload.data || {},
  }));

  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
    },
    body: JSON.stringify(messages),
  }).catch(() => {});
}

async function requireAdmin() {
  const cookieName = process.env.INTERNAL_AUTH_COOKIE_NAME;
  if (!cookieName) {
    return { ok: false as const, status: 500 as const, error: "Missing INTERNAL_AUTH_COOKIE_NAME" };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;
  if (!token) return { ok: false as const, status: 401 as const, error: "Not signed in" };

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `SELECT u.id, u.role, u.is_active
       FROM internal_sessions s
       JOIN internal_users u ON u.id = s.user_id
       WHERE s.session_token = ?
         AND s.revoked_at IS NULL
         AND u.is_active = 1
       LIMIT 1`,
      [token]
    );

    if (!rows?.length) return { ok: false as const, status: 401 as const, error: "Invalid session" };

    const role = String(rows[0].role || "");
    if (role !== "admin") return { ok: false as const, status: 403 as const, error: "Forbidden" };

    return { ok: true as const };
  } finally {
    conn.release();
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const target = String(body?.target || "").trim();
  const id = body?.id ? Number(body.id) : null;
  const title = String(body?.title || "LineScout Test").trim() || "LineScout Test";
  const msg = String(body?.body || "Test notification").trim() || "Test notification";
  const data = body?.data ?? {};

  if (target !== "agent" && target !== "user") {
    return NextResponse.json({ ok: false, error: "target must be 'agent' or 'user'" }, { status: 400 });
  }

  if (!id || Number.isNaN(id)) {
    return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    const [rows]: any =
      target === "agent"
        ? await conn.query(
            `SELECT token FROM linescout_agent_device_tokens WHERE is_active = 1 AND agent_id = ?`,
            [id]
          )
        : await conn.query(`SELECT token FROM linescout_device_tokens WHERE is_active = 1 AND user_id = ?`, [id]);

    const tokens = (rows || []).map((r: any) => r.token).filter(Boolean);
    await sendExpoPush(tokens, { title, body: msg, data });

    return NextResponse.json({ ok: true, sent: tokens.length });
  } finally {
    conn.release();
  }
}
