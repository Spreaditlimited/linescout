// app/api/mobile/projects/summary/route.ts
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickItems(raw: any) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object" && Array.isArray(raw.items)) return raw.items;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * GET /api/mobile/projects/summary?conversation_id=123
 * - Signed-in users only
 * - Returns a short, safe summary STRING for user confidence (not full transcript)
 *
 * Response:
 * {
 *   ok: true,
 *   conversation_id: number,
 *   route_type: string,
 *   stage: string,
 *   summary: string | null,
 *   quote_summary?: {...},
 *   payments?: [...]
 * }
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);

    const url = new URL(req.url);
    const conversationId = Number(url.searchParams.get("conversation_id") || 0);

    if (!conversationId) {
      return NextResponse.json(
        { ok: false, error: "conversation_id is required" },
        { status: 400 }
      );
    }

    const conn = await db.getConnection();
    try {
      // 1) Confirm ownership + paid project
      const [rows]: any = await conn.query(
        `
        SELECT
          c.id,
          c.user_id,
          c.route_type,
          c.chat_mode,
          c.payment_status,
          c.handoff_id,
          h.status AS handoff_status,
          h.token AS handoff_token,
          h.context AS handoff_context
        FROM linescout_conversations c
        LEFT JOIN linescout_handoffs h ON h.id = c.handoff_id
        WHERE c.id = ?
          AND c.user_id = ?
        LIMIT 1
        `,
        [conversationId, user.id]
      );

      const c = rows?.[0];
      if (!c?.id) {
        return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      }

      // Keep your rule: summary is only for paid projects
      if (c.chat_mode !== "paid_human" || c.payment_status !== "paid" || !c.handoff_id) {
        return NextResponse.json(
          { ok: false, error: "Summary is only available for paid projects." },
          { status: 400 }
        );
      }

      // 2) Pull a lightweight snapshot from messages (first user + last user + last agent)
      const [msgs]: any = await conn.query(
        `
        SELECT sender_type, message_text, created_at
        FROM linescout_messages
        WHERE conversation_id = ?
        ORDER BY id ASC
        LIMIT 200
        `,
        [conversationId]
      );

      const items = Array.isArray(msgs) ? msgs : [];

      const firstUser =
        items.find((m) => m?.sender_type === "user")?.message_text || "";

      const lastUser =
        [...items].reverse().find((m) => m?.sender_type === "user")?.message_text || "";

      const lastAgent =
        [...items].reverse().find((m) => m?.sender_type === "agent")?.message_text || "";

      const clip = (t: string, max = 220) => {
        const s = String(t || "").trim().replace(/\s+/g, " ");
        if (!s) return "";
        return s.length > max ? s.slice(0, max).trim() + "…" : s;
      };

      const stage = String(c.handoff_status || "").trim() || "pending";
      const routeType = String(c.route_type || "").trim() || "machine_sourcing";

      const goal = clip(firstUser, 240);
      const lastC = clip(lastUser, 240);
      const lastA = clip(lastAgent, 240);

      const parts: string[] = [];
      if (goal) parts.push(`Customer goal: ${goal}`);
      if (lastA) parts.push(`Latest agent update: ${lastA}`);
      if (lastC && lastC !== goal) parts.push(`Latest customer note: ${lastC}`);

      const summaryText = parts.join("\n\n") || null;

      let quoteSummary: any = null;
      let quotePayments: any[] = [];
      let commitmentPayment: any | null = null;

      if (String(c.handoff_token || "").trim()) {
        const [commitRows]: any = await conn.query(
          `SELECT id, amount, currency, created_at
           FROM linescout_tokens
           WHERE token = ?
             AND status = 'valid'
             AND type IN ('sourcing','business_plan')
           ORDER BY id ASC
           LIMIT 1`,
          [String(c.handoff_token).trim()]
        );
        const cp = commitRows?.[0];
        if (cp?.id) {
          commitmentPayment = {
            id: Number(cp.id),
            purpose: "commitment_fee",
            method: "card_bank",
            status: "paid",
            amount: Number(cp.amount || 0),
            currency: String(cp.currency || "NGN"),
            created_at: cp.created_at || null,
            paid_at: cp.created_at || null,
          };
        }
      }
      const [quoteRows]: any = await conn.query(
        `SELECT
           q.id,
           q.token,
           q.shipping_type_id,
           q.total_product_ngn,
           q.total_shipping_ngn,
           q.total_markup_ngn,
           q.commitment_due_ngn,
           q.items_json,
           st.name AS shipping_type_name
         FROM linescout_quotes q
         LEFT JOIN linescout_shipping_types st ON st.id = q.shipping_type_id
         WHERE q.handoff_id = ?
         ORDER BY
           CASE
             WHEN EXISTS (
               SELECT 1
               FROM linescout_quote_payments p
               WHERE p.quote_id = q.id
             ) THEN 0
             ELSE 1
           END ASC,
           q.id DESC
         LIMIT 1`,
        [Number(c.handoff_id)]
      );
      if (quoteRows?.length) {
        const q = quoteRows[0];
        const productDue = Math.max(
          0,
          Math.round(
            Number(q.total_product_ngn || 0) +
              Number(q.total_markup_ngn || 0) -
              Number(q.commitment_due_ngn || 0)
          )
        );
        const shippingDue = Math.max(0, Math.round(Number(q.total_shipping_ngn || 0)));

        const [qPayRows]: any = await conn.query(
          `SELECT
             id, purpose, method, status, amount, currency, provider_ref, created_at, paid_at
           FROM linescout_quote_payments
           WHERE quote_id = ?
           ORDER BY id DESC`,
          [Number(q.id)]
        );
        quotePayments = Array.isArray(qPayRows) ? qPayRows : [];

        const productPaid = quotePayments.reduce((sum, p) => {
          const purpose = String(p?.purpose || "");
          const status = String(p?.status || "");
          if (status === "paid" && (purpose === "deposit" || purpose === "product_balance" || purpose === "full_product_payment")) {
            return sum + Number(p?.amount || 0);
          }
          return sum;
        }, 0);
        const shippingPaid = quotePayments.reduce((sum, p) => {
          if (String(p?.status || "") === "paid" && String(p?.purpose || "") === "shipping_payment") {
            return sum + Number(p?.amount || 0);
          }
          return sum;
        }, 0);

        const items = pickItems(q.items_json);
        const firstItem = items?.[0] || null;
        const quantity = items.reduce((sum: number, item: any) => {
          const n = Number(item?.quantity || 0);
          return Number.isFinite(n) ? sum + n : sum;
        }, 0);
        const productBalance = Math.max(0, productDue - productPaid);
        const shippingBalance = Math.max(0, shippingDue - shippingPaid);

        quoteSummary = {
          quote_id: Number(q.id),
          quote_token: String(q.token || ""),
          product_name: firstItem?.product_name ? String(firstItem.product_name) : null,
          quantity,
          // User-facing due should represent total outstanding on the project.
          due_amount: productBalance + shippingBalance,
          shipping_type: q.shipping_type_name ? String(q.shipping_type_name) : null,
          product_due: productDue,
          product_paid: productPaid,
          product_balance: productBalance,
          shipping_due: shippingDue,
          shipping_paid: shippingPaid,
          shipping_balance: shippingBalance,
        };
      }

      const allPayments = commitmentPayment
        ? [commitmentPayment, ...quotePayments]
        : quotePayments;

      return NextResponse.json({
        ok: true,
        conversation_id: conversationId,
        route_type: routeType,
        stage,
        summary: summaryText,
        handoff_context: c.handoff_context || null,
        quote_summary: quoteSummary,
        payments: allPayments,
      });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const code = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
}
