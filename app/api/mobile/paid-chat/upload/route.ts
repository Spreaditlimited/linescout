// app/api/mobile/paid-chat/upload/route.ts
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { v2 as cloudinary } from "cloudinary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

// Configure once per runtime
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export async function POST(req: Request) {
  try {
    // Ensure env exists (fails loudly)
    requireEnv("CLOUDINARY_CLOUD_NAME");
    requireEnv("CLOUDINARY_API_KEY");
    requireEnv("CLOUDINARY_API_SECRET");

    const user = await requireUser(req);

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
      return NextResponse.json(
        { ok: false, error: "Only JPG and PNG images are supported for now." },
        { status: 400 }
      );
    }

    const maxBytes = maxBytesForMime(mime);
    if (file.size > maxBytes) {
      return NextResponse.json(
        { ok: false, error: `File too large. Max ${Math.floor(maxBytes / (1024 * 1024))}MB` },
        { status: 400 }
      );
    }

    // Security: confirm user owns this paid or quick-human conversation
    const conn = await db.getConnection();
    try {
      const [rows]: any = await conn.query(
        `
        SELECT id, chat_mode, payment_status, conversation_kind, project_status
        FROM linescout_conversations
        WHERE id = ?
          AND user_id = ?
        LIMIT 1
        `,
        [conversationId, user.id]
      );

      if (!rows?.length) {
        return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      }
      const conv = rows[0];
      const chatMode = String(conv.chat_mode || "");
      const paymentStatus = String(conv.payment_status || "");
      const projectStatus = String(conv.project_status || "");

      // Accept legacy rows where conversation_kind may not match current chat_mode.
      const isPaid = chatMode === "paid_human" && paymentStatus === "paid";
      const isQuick = chatMode === "limited_human" && projectStatus === "active";

      if (!isPaid && !isQuick) {
        return NextResponse.json(
          { ok: false, error: "Chat is not active for uploads." },
          { status: 403 }
        );
      }
    } finally {
      conn.release();
    }

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
    console.error("POST /api/mobile/paid-chat/upload error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
