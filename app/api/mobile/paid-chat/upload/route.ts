import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cloudinary config (server only)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

const MAX_FILE_MB = 5;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "application/pdf"];

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);

    const form = await req.formData();
    const file = form.get("file") as File | null;
    const conversationId = Number(form.get("conversation_id") || 0);

    if (!file || !conversationId) {
      return NextResponse.json(
        { ok: false, error: "file and conversation_id are required" },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { ok: false, error: "Unsupported file type" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      return NextResponse.json(
        { ok: false, error: "File too large (max 5MB)" },
        { status: 400 }
      );
    }

    // Confirm paid conversation ownership
    const [rows]: any = await db.query(
      `
      SELECT id
      FROM linescout_conversations
      WHERE id = ?
        AND user_id = ?
        AND chat_mode = 'paid_human'
        AND payment_status = 'paid'
      LIMIT 1
      `,
      [conversationId, user.id]
    );

    if (!rows?.length) {
      return NextResponse.json(
        { ok: false, error: "Invalid or unpaid conversation" },
        { status: 403 }
      );
    }

    // Convert file → buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Upload
    const result = await new Promise<any>((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          resource_type: "auto",
          folder: `linescout/paid/${conversationId}`,
        },
        (err, res) => {
          if (err) reject(err);
          else resolve(res);
        }
      ).end(buffer);
    });

    return NextResponse.json({
      ok: true,
      url: result.secure_url,
      public_id: result.public_id,
      resource_type: result.resource_type,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Upload failed" },
      { status: 500 }
    );
  }
}