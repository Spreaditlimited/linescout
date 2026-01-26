// app/api/mobile/delete-account/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function deletedEmailFor(userId: number) {
  const email = `deleted+${userId}@example.invalid`;
  return {
    email,
    email_normalized: email.toLowerCase(),
  };
}

// POST used intentionally (mobile-safe)
export async function POST(req: Request) {
  try {
    const u = await requireUser(req); // { id, email }
    const userId = Number(u.id);
    const currentEmail = String(u.email || "").trim();

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // 🚫 BLOCK deletion if an active handoff exists
      const [handoffRows]: any = await conn.query(
        `
        SELECT 1
        FROM linescout_handoffs
        WHERE user_id = ?
          AND status NOT IN ('completed', 'cancelled')
        LIMIT 1
        `,
        [userId]
      );

      if (handoffRows.length > 0) {
        await conn.rollback();
        return NextResponse.json(
          {
            ok: false,
            error:
              "You cannot delete your account while a sourcing project is still in progress.",
          },
          { status: 409 }
        );
      }

      // 1) Revoke all sessions
      await conn.execute(
        `
        UPDATE linescout_user_sessions
        SET revoked_at = NOW()
        WHERE user_id = ?
          AND revoked_at IS NULL
        `,
        [userId]
      );

      // 2) Delete associated leads (PII)
      if (currentEmail) {
        await conn.execute(
          `DELETE FROM linescout_leads WHERE email = ?`,
          [currentEmail]
        );
      }

      // 3) Anonymise user record (preserve history + FKs)
      const anon = deletedEmailFor(userId);
      await conn.execute(
        `
        UPDATE users
        SET email = ?,
            email_normalized = ?,
            display_name = NULL
        WHERE id = ?
        `,
        [anon.email, anon.email_normalized, userId]
      );

      await conn.commit();

      return NextResponse.json({ ok: true });
    } catch (e: any) {
      try {
        await conn.rollback();
      } catch {}

      console.error(
        "POST /api/mobile/delete-account error:",
        e?.message || e
      );

      return NextResponse.json(
        { ok: false, error: "Failed to delete account" },
        { status: 500 }
      );
    } finally {
      conn.release();
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
}