import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { paypalCaptureOrder } from "@/lib/paypal";
import { ensureReordersTable } from "@/lib/reorders";
import { buildNoticeEmail } from "@/lib/otp-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodemailer = require("nodemailer");

type RouteType = "machine_sourcing" | "white_label" | "simple_sourcing";

function isValidRouteType(v: any): v is RouteType {
  return v === "machine_sourcing" || v === "white_label" || v === "simple_sourcing";
}

function routeLabel(rt: RouteType) {
  if (rt === "white_label") return "White Label";
  if (rt === "simple_sourcing") return "Simple Sourcing";
  return "Machine Sourcing";
}

function randomChunk(len: number) {
  return Math.random().toString(36).substring(2, 2 + len).toUpperCase();
}

function tokenPrefix(purpose: string) {
  if (purpose === "reorder") return "RE-";
  return "SRC-";
}

function safeNum(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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

function formatCurrency(amount: number, code: string) {
  if (!Number.isFinite(amount)) return "";
  try {
    return new Intl.NumberFormat(code === "GBP" ? "en-GB" : "en-US", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${code} ${amount.toFixed(2)}`;
  }
}

function buildCustomerEmail(params: {
  firstName: string | null;
  token: string;
  amountText: string;
  orderId: string;
  handoffId: number;
}) {
  const greeting = params.firstName ? `Hi ${params.firstName},` : "Hi there,";
  const deepLink = `linescout://paid-chat?handoff_id=${encodeURIComponent(String(params.handoffId))}`;
  return buildNoticeEmail({
    subject: "Payment Confirmed: Your LineScout Sourcing Project is Active",
    title: "Payment confirmed",
    lines: [
      greeting,
      "Your payment has been confirmed successfully. Your paid sourcing project is now active.",
      `Token: ${params.token}`,
      `Amount: ${params.amountText}`,
      `PayPal Order: ${params.orderId}`,
      "Open the LineScout app and tap the Open Paid Chat button below.",
      "Share your requirements in one message if possible (specs, pictures, capacity, voltage, output, target country).",
      "Your sourcing specialist will respond inside the paid chat thread.",
      "Please keep conversations respectful. You can report issues directly inside paid chat.",
      "If you did not authorize this payment, reply to this email immediately and we will investigate.",
    ],
    footerNote: "This email was sent because a payment was completed on your LineScout account.",
  });
}

function firstNameFromUser(u: any) {
  const candidates = [
    u?.first_name,
    u?.firstname,
    u?.firstName,
    u?.name,
  ]
    .map((x: any) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean);

  if (!candidates.length) return null;
  const raw = candidates[0];
  const first = raw.split(" ")[0]?.trim();
  return first || null;
}

function getSmtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || 0);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = (process.env.SMTP_FROM || "no-reply@sureimports.com").trim();

  if (!host || !port || !user || !pass) {
    return { ok: false as const, error: "Missing SMTP env vars (SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS)." };
  }

  return { ok: true as const, host, port, user, pass, from };
}

async function sendEmail(opts: { to: string; replyTo?: string; subject: string; text: string; html: string }) {
  const cfg = getSmtpConfig();
  if (!cfg.ok) return { ok: false as const, error: cfg.error };
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
  });
  await transporter.sendMail({
    from: cfg.from,
    to: opts.to,
    replyTo: opts.replyTo,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });
  return { ok: true as const };
}

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

export async function POST(req: Request) {
  try {
    const u = await requireUser(req);
    const userId = Number((u as any)?.id || 0);
    const userEmail = String((u as any)?.email || "").trim();
    const agentLabel = firstNameFromUser(u) || "Customer";

    const body = await req.json().catch(() => ({}));
    const orderId = String(body?.order_id || "").trim();
    const purposeRaw = String(body?.purpose || "sourcing").trim();
    const purpose = purposeRaw === "reorder" ? "reorder" : "sourcing";
    const routeType = body?.route_type;
    if (!orderId) {
      return NextResponse.json({ ok: false, error: "Missing order_id." }, { status: 400 });
    }
    if (!isValidRouteType(routeType)) {
      return NextResponse.json({ ok: false, error: "Invalid route_type." }, { status: 400 });
    }
    if (purpose !== "sourcing" && purpose !== "reorder") {
      return NextResponse.json({ ok: false, error: "Invalid payment purpose." }, { status: 400 });
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
    const reorderOfConversationId = safeNum(body?.reorder_of_conversation_id);
    const reorderUserNote = String(body?.reorder_user_note || "").trim();
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

    const token = `${tokenPrefix(purpose)}${randomChunk(6)}-${randomChunk(5)}`;
    const payEmail = userEmail;

    if (purpose === "reorder") {
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
              reorder_of_conversation_id: reorderOfConversationId || null,
              reorder_user_note: reorderUserNote || null,
              product:
                productId !== "N/A" || productName !== "N/A" || productCategory !== "N/A"
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

        let finalRouteType: RouteType = routeType as RouteType;
        let assignedAgentId: number | null = null;
        let assignedAgentEmail: string | null = null;
        let agentEmailNotifications = false;
        let sourceConversationIdForContext = sourceConversationId;
        let sourceHandoffIdForContext: number | null = null;
        let sourceAgentId: number | null = null;
        let sourceProductSummary = "";

        const sourceId = reorderOfConversationId || sourceConversationId;
        if (!sourceId) {
          throw new Error("Missing reorder source project.");
        }

        const [srcRows]: any = await conn.query(
          `
          SELECT c.id, c.user_id, c.route_type, c.assigned_agent_id, c.handoff_id, h.status AS handoff_status, h.delivered_at
          FROM linescout_conversations c
          LEFT JOIN linescout_handoffs h ON h.id = c.handoff_id
          WHERE c.id = ? AND c.user_id = ?
          LIMIT 1
          `,
          [sourceId, userId]
        );
        const src = srcRows?.[0];
        if (!src?.id || !src?.handoff_id) {
          throw new Error("Original project not found.");
        }
        const handoffStatus = String(src.handoff_status || "").trim().toLowerCase();
        const isDelivered = handoffStatus === "delivered" || !!src.delivered_at;
        if (!isDelivered) {
          throw new Error("Re-order is only available for delivered projects.");
        }

        sourceConversationIdForContext = Number(src.id);
        sourceHandoffIdForContext = Number(src.handoff_id);
        sourceAgentId = Number(src.assigned_agent_id || 0) || null;
        if (isValidRouteType(src.route_type)) {
          finalRouteType = src.route_type as RouteType;
        }

        const [quoteRows]: any = await conn.query(
          `
          SELECT items_json
          FROM linescout_quotes
          WHERE handoff_id = ?
          ORDER BY id DESC
          LIMIT 1
          `,
          [Number(src.handoff_id)]
        );
        if (quoteRows?.length) {
          let items: any[] = [];
          const raw = quoteRows[0]?.items_json;
          if (Array.isArray(raw)) {
            items = raw;
          } else if (typeof raw === "string") {
            try {
              const parsed = JSON.parse(raw || "[]");
              items = Array.isArray(parsed) ? parsed : [];
            } catch {
              items = [];
            }
          }
          sourceProductSummary = buildProductSummaryFromItems(items);
        }

        if (sourceAgentId) {
          const [agentRows]: any = await conn.query(
            `
            SELECT u.id, u.is_active, ap.approval_status, ap.email, ap.email_notifications_enabled
            FROM internal_users u
            LEFT JOIN linescout_agent_profiles ap ON ap.internal_user_id = u.id
            WHERE u.id = ?
            LIMIT 1
            `,
            [sourceAgentId]
          );
          const a = agentRows?.[0];
          if (a?.id && Number(a.is_active) === 1 && String(a.approval_status || "") === "approved") {
            assignedAgentId = Number(a.id);
            assignedAgentEmail = String(a.email || "").trim() || null;
            agentEmailNotifications = Number(a.email_notifications_enabled ?? 1) === 1;
          }
        }

        const [insConv]: any = await conn.query(
          `
          INSERT INTO linescout_conversations
            (user_id, route_type, chat_mode, human_message_limit, human_message_used, payment_status, project_status)
          VALUES
            (?, ?, 'paid_human', 0, 0, 'paid', 'active')
          `,
          [userId, finalRouteType]
        );
        const conversationId = Number(insConv?.insertId || 0);
        if (!conversationId) throw new Error("Failed to create paid conversation");

        let whiteLabelBrief = "";
        const hasSelectedIdea = productName !== "N/A" || productCategory !== "N/A" || productId !== "N/A";
        if (finalRouteType === "white_label" && !hasSelectedIdea) {
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
          sourceConversationIdForContext ? `Re-order of conversation_id: ${sourceConversationIdForContext}` : "",
          sourceHandoffIdForContext ? `Original handoff_id: ${sourceHandoffIdForContext}` : "",
          sourceProductSummary ? `Original product: ${sourceProductSummary}` : "",
          reorderUserNote ? `Customer note: ${reorderUserNote}` : "",
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
          [token, finalRouteType === "white_label" ? "white_label" : "sourcing", payEmail, contextNote, conversationId]
        );

        const handoffId = Number(insH?.insertId || 0);
        if (!handoffId) throw new Error("Failed to create handoff");

        if (typeof amountValue === "number" && amountValue > 0) {
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
        }

        try {
          const metaForToken = {
            paypal: {
              order_id: orderId,
              status,
            },
            route_type: finalRouteType,
            user_id: userId,
            source_conversation_id: sourceConversationId || null,
            reorder_of_conversation_id: reorderOfConversationId || null,
            reorder_user_note: reorderUserNote || null,
            product:
              productId !== "N/A" || productName !== "N/A" || productCategory !== "N/A"
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
            conversation_id: conversationId,
            handoff_id: handoffId,
          };

          await conn.query(
            `
            UPDATE linescout_tokens
            SET metadata = ?
            WHERE paystack_ref = ?
            LIMIT 1
            `,
            [JSON.stringify(metaForToken), orderId]
          );
        } catch {
          // non-fatal
        }

        await conn.query(
          `
          UPDATE linescout_conversations
          SET handoff_id = ?, payment_status = 'paid', chat_mode = 'paid_human', assigned_agent_id = COALESCE(?, assigned_agent_id)
          WHERE id = ? AND user_id = ?
          LIMIT 1
          `,
          [handoffId, assignedAgentId, conversationId, userId]
        );

        await conn.query(
          `
          INSERT INTO linescout_messages (conversation_id, sender_type, sender_id, message_text)
          VALUES (?, 'agent', ?, ?)
          `,
          [
            conversationId,
            assignedAgentId || null,
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

        await ensureReordersTable(conn);
        const statusOut = assignedAgentId ? "assigned" : "pending_admin";
        await conn.query(
          `
          INSERT INTO linescout_reorder_requests
            (user_id, conversation_id, handoff_id, source_conversation_id, source_handoff_id, new_conversation_id, new_handoff_id,
             route_type, status, original_agent_id, assigned_agent_id, user_note, paystack_ref, amount_ngn, paid_at, assigned_at)
          VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)
          `,
          [
            userId,
            sourceConversationIdForContext || conversationId,
            sourceHandoffIdForContext || handoffId,
            sourceConversationIdForContext,
            sourceHandoffIdForContext,
            conversationId,
            handoffId,
            finalRouteType,
            statusOut,
            sourceAgentId,
            assignedAgentId,
            reorderUserNote || null,
            orderId,
            null,
            assignedAgentId ? new Date() : null,
          ]
        );

        await conn.commit();

        let emailResult: any = null;
        try {
          if (assignedAgentId) {
            const [trows]: any = await conn.query(
              `
              SELECT token
              FROM linescout_agent_device_tokens
              WHERE is_active = 1 AND agent_id = ?
              `,
              [assignedAgentId]
            );
            const tokens = (trows || []).map((r: any) => String(r.token || "")).filter(Boolean);
            await sendExpoPush(tokens, {
              title: "Re-order paid chat",
              body: `${agentLabel} just paid to re-order a delivered project.`,
              data: { kind: "paid", conversation_id: conversationId, handoff_id: handoffId, route_type: finalRouteType },
            });
          }

          if (assignedAgentId && assignedAgentEmail && agentEmailNotifications) {
            const mail = buildNoticeEmail({
              subject: "Re-order paid chat assigned to you",
              title: "Re-order paid chat",
              lines: [
                `${agentLabel} just paid to re-order a delivered project.`,
                `Route: ${routeLabel(finalRouteType)}`,
                `Handoff ID: ${handoffId}`,
                "Open the LineScout Agent app to follow up.",
              ],
              footerNote: "This email was sent because a re-order paid chat was assigned to you on LineScout.",
            });
            await sendEmail({
              to: assignedAgentEmail,
              replyTo: "hello@sureimports.com",
              subject: mail.subject,
              text: mail.text,
              html: mail.html,
            });
          } else {
            const adminMail = buildNoticeEmail({
              subject: "Re-order needs assignment",
              title: "Re-order pending assignment",
              lines: [
                `Route: ${routeLabel(finalRouteType)}`,
                `Handoff ID: ${handoffId}`,
                `Conversation ID: ${conversationId}`,
                `Customer email: ${payEmail}`,
                "Original agent is inactive or unavailable. Assign in admin.",
              ],
              footerNote: "This email was sent because a re-order needs admin assignment.",
            });
            await sendEmail({
              to: "sureimporters@gmail.com",
              replyTo: "hello@sureimports.com",
              subject: adminMail.subject,
              text: adminMail.text,
              html: adminMail.html,
            });
          }
          const amountText = formatCurrency(amountValue, currency) || `${currency} ${amountValue}`;
          const customerMail = buildCustomerEmail({
            firstName: firstNameFromUser(u),
            token,
            amountText,
            orderId,
            handoffId,
          });
          emailResult = await sendEmail({
            to: payEmail,
            replyTo: "hello@sureimports.com",
            subject: customerMail.subject,
            text: customerMail.text,
            html: customerMail.html,
          });
        } catch {
          // ignore email failures
        }

        return NextResponse.json(
          {
            ok: true,
            conversation_id: conversationId,
            handoff_id: handoffId,
            route_type: finalRouteType,
            email_sent: emailResult?.ok === true,
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
    }

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
      const hasSelectedIdea = productName !== "N/A" || productCategory !== "N/A" || productId !== "N/A";
      if (routeType === "white_label" && !hasSelectedIdea) {
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

      let emailResult: any = null;
      try {
        const [trows]: any = await conn.query(
          `
          SELECT t.token
          FROM linescout_agent_device_tokens t
          JOIN internal_users u ON u.id = t.agent_id
          JOIN linescout_agent_profiles ap ON ap.internal_user_id = u.id
          WHERE t.is_active = 1
            AND u.is_active = 1
            AND ap.approval_status = 'approved'
          `
        );
        const tokens = (trows || []).map((r: any) => String(r.token || "")).filter(Boolean);
        await sendExpoPush(tokens, {
          title: "New paid chat available",
          body: `${agentLabel} just opened a paid chat. Tap to claim.`,
          data: { kind: "paid", conversation_id: conversationId, handoff_id: handoffId, route_type: routeType },
        });

        const [emailRows]: any = await conn.query(
          `
          SELECT ap.email
          FROM linescout_agent_profiles ap
          JOIN internal_users u ON u.id = ap.internal_user_id
          WHERE u.is_active = 1
            AND ap.approval_status = 'approved'
            AND COALESCE(ap.email_notifications_enabled, 1) = 1
            AND ap.email IS NOT NULL
            AND ap.email <> ''
          `
        );
        const emails = (emailRows || [])
          .map((r: any) => String(r.email || "").trim())
          .filter(Boolean);

        for (const email of emails) {
          const mail = buildNoticeEmail({
            subject: "New paid chat available",
            title: "New paid chat",
            lines: [
              `${agentLabel} just opened a paid chat.`,
              `Route: ${routeLabel(routeType)}`,
              `Handoff ID: ${handoffId}`,
              "Open the LineScout Agent app to claim this project.",
            ],
            footerNote: "This email was sent because a new paid chat became available for LineScout agents.",
          });
          await sendEmail({
            to: email,
            replyTo: "hello@sureimports.com",
            subject: mail.subject,
            text: mail.text,
            html: mail.html,
          });
        }

        const adminMail = buildNoticeEmail({
          subject: "New paid chat started",
          title: "New paid chat started",
          lines: [
            `Route: ${routeLabel(routeType)}`,
            `Handoff ID: ${handoffId}`,
            `Conversation ID: ${conversationId}`,
            `Customer email: ${payEmail}`,
          ],
          footerNote: "This email was sent because a paid chat was started on LineScout.",
        });
        await sendEmail({
          to: "sureimporters@gmail.com",
          replyTo: "hello@sureimports.com",
          subject: adminMail.subject,
          text: adminMail.text,
          html: adminMail.html,
        });

        const amountText = formatCurrency(amountValue, currency) || `${currency} ${amountValue}`;
        const customerMail = buildCustomerEmail({
          firstName: firstNameFromUser(u),
          token,
          amountText,
          orderId,
          handoffId,
        });
        emailResult = await sendEmail({
          to: payEmail,
          replyTo: "hello@sureimports.com",
          subject: customerMail.subject,
          text: customerMail.text,
          html: customerMail.html,
        });
      } catch {
        // ignore email failures
      }

      return NextResponse.json(
        {
          ok: true,
          conversation_id: conversationId,
          handoff_id: handoffId,
          route_type: routeType,
          email_sent: emailResult?.ok === true,
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
