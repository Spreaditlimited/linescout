import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { paypalCaptureOrder } from "@/lib/paypal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteType = "machine_sourcing" | "white_label" | "simple_sourcing";

function isValidRouteType(v: any): v is RouteType {
  return v === "machine_sourcing" || v === "white_label" || v === "simple_sourcing";
}

function randomChunk(len: number) {
  return Math.random().toString(36).substring(2, 2 + len).toUpperCase();
}

function normalizeText(value: any) {
  const s = String(value ?? "").replace(/\s+/g, " ").trim();
  return s || "N/A";
}

function formatQuantityTier(value: any) {
  if (value === "test") return "Test run (50–200 units)";
  if (value === "scale") return "Scale run (1,000+ units)";
  return "N/A";
}

function formatBrandingLevel(value: any) {
  if (value === "logo") return "Logo only";
  if (value === "packaging") return "Custom packaging";
  if (value === "mould") return "Full custom mould";
  return "N/A";
}

function formatReferenceLink(link: any, noLink: any) {
  const safeLink = String(link ?? "").trim();
  if (safeLink) return safeLink;
  if (noLink) return "No reference link provided";
  return "N/A";
}

function buildWhiteLabelBrief(row: any) {
  if (!row) return "";
  const category = normalizeText(row.category);
  const productName = normalizeText(row.product_name);
  const productDesc = normalizeText(row.product_desc);
  const referenceLink = formatReferenceLink(row.reference_link, row.no_link);
  const quantityTier = formatQuantityTier(row.quantity_tier);
  const brandingLevel = formatBrandingLevel(row.branding_level);
  const targetCost =
    row.target_landed_cost_naira != null && row.target_landed_cost_naira !== ""
      ? `₦${row.target_landed_cost_naira}`
      : "N/A";

  return [
    "WHITE LABEL PROJECT BRIEF",
    "",
    `Category: ${category}`,
    `Product name: ${productName}`,
    "",
    "Description:",
    productDesc || "N/A",
    "",
    "Reference link:",
    referenceLink,
    "",
    `Quantity tier: ${quantityTier}`,
    "",
    `Branding level: ${brandingLevel}`,
    "",
    `Target landed cost: ${targetCost}`,
  ].join("\n");
}

function buildSimpleSourcingBrief(raw: any) {
  if (!raw) return "";
  const productName = normalizeText(raw?.product_name);
  const quantity = normalizeText(raw?.quantity);
  const destination = normalizeText(raw?.destination);
  const notes = normalizeText(raw?.notes);
  const lines: string[] = ["SOURCING BRIEF"];
  if (productName !== "N/A") lines.push(`Product: ${productName}`);
  if (quantity !== "N/A") lines.push(`Quantity: ${quantity}`);
  if (destination !== "N/A") lines.push(`Destination: ${destination}`);
  if (notes !== "N/A") {
    lines.push("");
    lines.push("Notes:");
    lines.push(notes);
  }
  return lines.length > 1 ? lines.join("\n") : "";
}

function buildProductSummaryFromItems(items: any[]) {
  const safeItems = Array.isArray(items) ? items : [];
  if (!safeItems.length) return "";
  const first = safeItems[0] || {};
  const name = String(first.product_name || "").trim();
  const qty = safeItems.reduce((sum, item) => sum + Number(item?.quantity || 0), 0);
  const extras = [];
  if (name) extras.push(name);
  if (Number.isFinite(qty) && qty > 0) extras.push(`Qty ${qty}`);
  return extras.join(" · ");
}

export async function POST(req: Request) {
  try {
    const u = await requireUser(req);
    const userId = Number((u as any)?.id || 0);
    const userEmail = String((u as any)?.email || "").trim();

    const body = await req.json().catch(() => ({}));
    const orderId = String(body?.order_id || "").trim();
    const purpose = String(body?.purpose || "sourcing").trim();
    const routeType = body?.route_type;
    if (!orderId) {
      return NextResponse.json({ ok: false, error: "Missing order_id." }, { status: 400 });
    }
    if (!isValidRouteType(routeType)) {
      return NextResponse.json({ ok: false, error: "Invalid route_type." }, { status: 400 });
    }
    if (purpose !== "sourcing") {
      return NextResponse.json({ ok: false, error: "PayPal is supported for sourcing only." }, { status: 400 });
    }

    const capture = await paypalCaptureOrder(orderId);
    const status = String(capture?.status || "").toUpperCase();
    if (status !== "COMPLETED") {
      return NextResponse.json({ ok: false, error: "Payment not completed yet." }, { status: 400 });
    }

    const purchaseUnit = Array.isArray(capture?.purchase_units) ? capture.purchase_units[0] : null;
    const paymentCapture = purchaseUnit?.payments?.captures?.[0];
    const amountValue = Number(paymentCapture?.amount?.value || 0);
    const currency = String(paymentCapture?.amount?.currency_code || "GBP").toUpperCase();
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid PayPal amount." }, { status: 400 });
    }
    if (currency !== "GBP") {
      return NextResponse.json({ ok: false, error: "PayPal currency must be GBP." }, { status: 400 });
    }

    const sourceConversationId = Number(body?.source_conversation_id || 0) || null;
    const productId = normalizeText(body?.product_id);
    const productName = normalizeText(body?.product_name);
    const productCategory = normalizeText(body?.product_category);
    const productLandedPerUnit = normalizeText(body?.product_landed_ngn_per_unit);
    const simpleBrief =
      body?.simple_product_name || body?.simple_quantity || body?.simple_destination || body?.simple_notes
        ? {
            product_name: body?.simple_product_name || null,
            quantity: body?.simple_quantity || null,
            destination: body?.simple_destination || null,
            notes: body?.simple_notes || null,
          }
        : null;

    const token = `SRC-${randomChunk(6)}-${randomChunk(5)}`;
    const payEmail = userEmail;

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      await conn.query(
        `
        INSERT INTO linescout_tokens
          (token, type, email, amount, currency, paystack_ref, status, metadata, customer_name, customer_phone, created_at)
        VALUES
          (?, 'sourcing', ?, ?, ?, ?, 'valid', ?, NULL, NULL, NOW())
        `,
        [
          token,
          payEmail,
          amountValue,
          currency,
          orderId,
          JSON.stringify({
            paypal: {
              order_id: orderId,
              status,
            },
            route_type: routeType,
            user_id: userId,
            source_conversation_id: sourceConversationId || null,
            product: productId !== "N/A" || productName !== "N/A" || productCategory !== "N/A"
              ? {
                  id: productId !== "N/A" ? productId : null,
                  name: productName !== "N/A" ? productName : null,
                  category: productCategory !== "N/A" ? productCategory : null,
                  landed_ngn_per_unit: productLandedPerUnit !== "N/A" ? productLandedPerUnit : null,
                }
              : null,
            raw: {
              amount: amountValue,
              currency,
            },
          }),
        ]
      );

      const [convRows]: any = await conn.query(
        `SELECT * FROM linescout_conversations WHERE user_id = ? AND route_type = ? LIMIT 1`,
        [userId, routeType]
      );
      let conversation = convRows?.[0] || null;
      if (!conversation) {
        const [ins]: any = await conn.query(
          `INSERT INTO linescout_conversations
            (user_id, route_type, chat_mode, human_message_limit, human_message_used, payment_status, project_status)
           VALUES
            (?, ?, 'ai_only', 0, 0, 'unpaid', 'active')`,
          [userId, routeType]
        );
        const id = Number(ins?.insertId || 0);
        if (!id) throw new Error("Conversation could not be created.");
        const [created]: any = await conn.query(
          `SELECT * FROM linescout_conversations WHERE id = ? LIMIT 1`,
          [id]
        );
        conversation = created?.[0] || null;
      }

      if (!conversation) throw new Error("Conversation not found.");
      const conversationId = Number(conversation.id || 0);

      let whiteLabelBrief = "";
      if (routeType === "white_label") {
        const [wlRows]: any = await conn.query(
          `
          SELECT *
          FROM linescout_white_label_projects
          WHERE user_id = ?
          ORDER BY id DESC
          LIMIT 1
          `,
          [userId]
        );
        if (wlRows && wlRows.length) {
          whiteLabelBrief = buildWhiteLabelBrief(wlRows[0]);
        }
      }

      const simpleSourcingBrief = buildSimpleSourcingBrief(simpleBrief);

      const contextNote = [
        "Created from in-app PayPal payment.",
        sourceConversationId ? `Source AI conversation_id: ${sourceConversationId}` : "",
        productName !== "N/A" || productCategory !== "N/A"
          ? `Selected idea: ${productName !== "N/A" ? productName : "Unknown"}${
              productCategory !== "N/A" ? ` (${productCategory})` : ""
            }${productId !== "N/A" ? ` [ID ${productId}]` : ""}`
          : "",
        productLandedPerUnit !== "N/A" ? `Landed per unit: ${productLandedPerUnit}` : "",
        simpleSourcingBrief,
        whiteLabelBrief || "Project brief to be provided in paid chat.",
      ]
        .filter(Boolean)
        .join("\n");

      const [insH]: any = await conn.query(
        `
        INSERT INTO linescout_handoffs
          (token, handoff_type, email, context, status, paid_at, conversation_id)
        VALUES
          (?, ?, ?, ?, 'pending', NOW(), ?)
        `,
        [token, routeType === "white_label" ? "white_label" : "sourcing", payEmail, contextNote, conversationId]
      );

      const handoffId = Number(insH?.insertId || 0);
      if (!handoffId) throw new Error("Failed to create handoff");

      await conn.query(
        `
        INSERT INTO linescout_handoff_financials (handoff_id, currency, total_due)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
          total_due = GREATEST(total_due, VALUES(total_due)),
          currency = VALUES(currency)
        `,
        [handoffId, currency, amountValue]
      );

      await conn.query(
        `
        INSERT INTO linescout_handoff_payments
          (handoff_id, amount, currency, purpose, note, paid_at, created_at)
        VALUES
          (?, ?, ?, 'full_payment', 'Sourcing fee (PayPal)', NOW(), NOW())
        `,
        [handoffId, amountValue, currency]
      );

      await conn.query(
        `
        UPDATE linescout_conversations
        SET handoff_id = ?, payment_status = 'paid', chat_mode = 'paid_human'
        WHERE id = ? AND user_id = ?
        LIMIT 1
        `,
        [handoffId, conversationId, userId]
      );

      await conn.query(
        `
        INSERT INTO linescout_messages (conversation_id, sender_type, sender_id, message_text)
        VALUES (?, 'agent', NULL, ?)
        `,
        [
          conversationId,
          [
            "Hello,",
            "",
            "Our China-based agents have been notified of your request, and one of them will attend to you shortly.",
            "",
            "Please keep all discussions professional and respectful. Do not exchange personal contact details within the chat. If at any point you need assistance, use the Report or Escalate button and our team will respond promptly.",
            "",
            "Thank you.",
          ].join("\n"),
        ]
      );

      await conn.commit();

      return NextResponse.json(
        {
          ok: true,
          conversation_id: conversationId,
          handoff_id: handoffId,
          route_type: routeType,
        },
        { status: 200 }
      );
    } catch (e: any) {
      await conn.rollback();
      const msg = String(e?.message || "Payment verification failed");
      if (msg.toLowerCase().includes("duplicate") && msg.toLowerCase().includes("paystack_ref")) {
        return NextResponse.json(
          { ok: true, conversation_id: null, handoff_id: null, route_type: routeType },
          { status: 200 }
        );
      }
      throw e;
    } finally {
      conn.release();
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
