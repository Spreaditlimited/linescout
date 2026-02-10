// app/api/internal/paid-chat/upload/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { v2 as cloudinary } from "cloudinary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readSessionToken(req: Request, cookieName: string) {
  const bearer = req.headers.get("authorization") || "";
  const headerToken = bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : "";

  const cookieHeader = req.headers.get("cookie") || "";
  const cookieToken =
    cookieHeader
      .split(/[;,]/)
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1) || "";

  return headerToken || cookieToken;
}

async function requireInternalAccess(req: Request) {
  const cookieName = process.env.INTERNAL_AUTH_COOKIE_NAME;
  if (!cookieName) {
    return { ok: false as const, status: 500 as const, error: "Missing INTERNAL_AUTH_COOKIE_NAME" };
  }

  const token =
    readSessionToken(req, cookieName) || (await cookies()).get(cookieName)?.value || "";
  if (!token) return { ok: false as const, status: 401 as const, error: "Not signed in" };

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `SELECT
         u.id,
         u.role,
         u.username,
         u.is_active,
         COALESCE(p.can_view_leads, 0) AS can_view_leads
       FROM internal_sessions s
       JOIN internal_users u ON u.id = s.user_id
       LEFT JOIN internal_user_permissions p ON p.user_id = u.id
       WHERE s.session_token = ?
         AND s.revoked_at IS NULL
         AND u.is_active = 1
       LIMIT 1`,
      [token]
    );

    if (!rows?.length) return { ok: false as const, status: 401 as const, error: "Invalid session" };

    const userId = Number(rows[0].id);
    const role = String(rows[0].role || "");
    const canViewLeads = !!rows[0].can_view_leads;
    const username = String(rows[0].username || "");

    if (role === "admin" || canViewLeads) return { ok: true as const, userId, role, username };
    return { ok: false as const, status: 403 as const, error: "Forbidden" };
  } finally {
    conn.release();
  }
}

function safeName(s: string) {
  return String(s || "")
    .trim()
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 80);
}

function isAllowedMime(m: string) {
  const t = String(m || "").toLowerCase().trim();
  return t === "image/jpeg" || t === "image/jpg" || t === "image/png";
}

function maxBytesForMime(m: string) {
  const _t = String(m || "").toLowerCase().trim();
  return 10 * 1024 * 1024; // 10MB images
}

function requireEnv(name: string) {
  const v = String(process.env[name] || "").trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

// Configure Cloudinary once per runtime
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export async function POST(req: Request) {
  const auth = await requireInternalAccess(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  try {
    // fail loudly if env is missing
    requireEnv("CLOUDINARY_CLOUD_NAME");
    requireEnv("CLOUDINARY_API_KEY");
    requireEnv("CLOUDINARY_API_SECRET");

    const form = await req.formData();

    const conversationId = Number(String(form.get("conversation_id") || "").trim() || 0);
    const file = form.get("file");

    if (!conversationId) {
      return NextResponse.json({ ok: false, error: "conversation_id is required" }, { status: 400 });
    }

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "file is required" }, { status: 400 });
    }

    const mime = String(file.type || "").toLowerCase().trim();
    if (!isAllowedMime(mime)) {
      return NextResponse.json({ ok: false, error: "Only JPG and PNG images are supported for now." }, { status: 400 });
    }

    const maxBytes = maxBytesForMime(mime);
    if (file.size > maxBytes) {
      return NextResponse.json(
        { ok: false, error: `File too large. Max ${Math.floor(maxBytes / (1024 * 1024))}MB` },
        { status: 400 }
      );
    }

    // 1) Ensure conversation + permission
    const conn = await db.getConnection();
    try {
      const [convRows]: any = await conn.query(
        `
        SELECT
          c.id,
          c.chat_mode,
          c.payment_status,
          c.project_status,
          c.assigned_agent_id,
          c.conversation_kind,
          c.handoff_id,
          h.claimed_by
        FROM linescout_conversations c
        LEFT JOIN linescout_handoffs h ON h.id = c.handoff_id
        WHERE c.id = ?
        LIMIT 1
        `,
        [conversationId]
      );

      if (!convRows?.length) {
        return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      }

      const conv = convRows[0];
      const chatMode = String(conv.chat_mode || "");
      const paymentStatus = String(conv.payment_status || "");
      const projectStatus = String(conv.project_status || "");
      const assignedAgentId = conv.assigned_agent_id == null ? null : Number(conv.assigned_agent_id);
      const conversationKind = String(conv.conversation_kind || "");

      const isPaid = chatMode === "paid_human" && paymentStatus === "paid";
      const isQuick = conversationKind === "quick_human" && chatMode === "limited_human";

      if (!isPaid && !isQuick) {
        return NextResponse.json({ ok: false, error: "Chat is not active." }, { status: 403 });
      }

      if (projectStatus === "cancelled") {
        return NextResponse.json({ ok: false, error: "This project is cancelled." }, { status: 403 });
      }

      // Agent restriction (admin bypass): for paid chats only.
      // Quick chats allow any approved agent to respond.
      if (auth.role !== "admin" && !isQuick) {
        const claimedBy = String(conv.claimed_by || "").trim();
        const isAssignedToAgent = !!assignedAgentId && assignedAgentId === auth.userId;
        const isClaimedByAgent = !!claimedBy && !!auth.username && claimedBy === auth.username;

        if (!isAssignedToAgent && !isClaimedByAgent) {
          return NextResponse.json(
            { ok: false, error: "You can read this project, but only the claiming agent can send messages." },
            { status: 403 }
          );
        }
      }
    } finally {
      conn.release();
    }

    // 2) Upload to Cloudinary
    const ab = await file.arrayBuffer();
    const buf = Buffer.from(ab);

    const originalName = safeName(file.name || "upload");
    const folder = `linescout/paid/${conversationId}`;

    const uploadResult: any = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: "image",
          public_id: `${Date.now()}_${originalName}`.replace(/\.[a-z0-9]+$/i, ""),
          overwrite: false,
          use_filename: true,
          unique_filename: true,
        },
        (err, res) => {
          if (err) return reject(err);
          resolve(res);
        }
      );

      stream.end(buf);
    });

    const secureUrl = String(uploadResult?.secure_url || "").trim();
    const publicId = String(uploadResult?.public_id || "").trim();

    if (!secureUrl || !publicId) {
      return NextResponse.json({ ok: false, error: "Upload failed" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      file: {
        url: secureUrl,
        public_id: publicId,
        mime,
        bytes: Number(uploadResult?.bytes || file.size || 0),
        original_name: originalName,
      },
    });
  } catch (e: any) {
    console.error("POST /api/internal/paid-chat/upload error:", e?.message || e);
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
