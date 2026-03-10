import { redirect } from "next/navigation";
import { db } from "@/lib/db";

export default async function LegacyChatRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const chatId = Number(String(id || "").trim());
  if (!chatId) {
    redirect("/projects");
  }

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `
      SELECT conversation_kind, route_type
      FROM linescout_conversations
      WHERE id = ?
      LIMIT 1
      `,
      [chatId]
    );
    const row = rows?.[0] || null;
    const safeRoute = String(row?.route_type || "machine_sourcing");
    if (String(row?.conversation_kind || "") === "quick_human") {
      redirect(`/quick-chat?route_type=${encodeURIComponent(safeRoute)}&conversation_id=${chatId}`);
    }
  } finally {
    conn.release();
  }

  redirect(`/conversations/${chatId}`);
}
