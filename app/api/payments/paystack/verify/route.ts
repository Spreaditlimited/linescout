// app/api/payments/paystack/verify/route.ts
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureReordersTable } from "@/lib/reorders";
import { buildNoticeEmail } from "@/lib/otp-email";
import { ensureMarketingTables, recordMarketingEvent } from "@/lib/marketing-emails";
import type { Transporter } from "nodemailer";

// Use require to avoid default-import interop issues in some TS setups
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodemailer = require("nodemailer");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteType = "machine_sourcing" | "white_label" | "simple_sourcing";

function isValidRouteType(v: any): v is RouteType {
  return v === "machine_sourcing" || v === "white_label" || v === "simple_sourcing";
}

function routeLabel(rt: RouteType) {
  if (rt === "white_label") return "White Label";
  if (rt === "simple_sourcing") return "Simple Sourcing";
  return "Machine Sourcing";
}

function safeNum(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function randomChunk(len: number) {
  return Math.random().toString(36).substring(2, 2 + len).toUpperCase();
}

function tokenPrefix(purpose: string) {
  if (purpose === "business_plan") return "BP-";
  if (purpose === "reorder") return "RE-";
  return "SRC-";
}

function normalizePurpose(p: any) {
  const s = String(p || "sourcing").trim();
  if (s === "business_plan") return "business_plan";
  if (s === "reorder") return "reorder";
  return "sourcing";
}

function naira(amountKobo: number | null) {
  if (typeof amountKobo !== "number") return null;
  return Math.round(amountKobo / 100);
}

function formatNaira(amountNaira: number | null) {
  if (typeof amountNaira !== "number") return "";
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 0,
    }).format(amountNaira);
  } catch {
    return `₦${amountNaira}`;
  }
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

function firstNameFromUser(u: any) {
  const candidates = [
    u?.first_name,
    u?.firstname,
    u?.firstName,
    u?.name, // if name is full name, we can still split
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

  return {
    ok: true as const,
    host,
    port,
    user,
    pass,
    from,
  };
}

function buildEmail(params: {
  firstName: string | null;
  token: string;
  amountText: string;
  paystackRef: string;
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
      `Paystack Reference: ${params.paystackRef}`,
      "Open the LineScout app and tap the Open Paid Chat button below.",
      "Share your requirements in one message if possible (specs, pictures, capacity, voltage, output, target country).",
      "Your sourcing specialist will respond inside the paid chat thread.",
      "Please keep conversations respectful. You can report issues directly inside paid chat.",
      "If you did not authorize this payment, reply to this email immediately and we will investigate.",
    ],
    footerNote: "This email was sent because a payment was completed on your LineScout account.",
  });

  const subject = "Payment Confirmed: Your LineScout Sourcing Project is Active";
  const text = [
    "LineScout by Sure Importers Limited",
    "",
    greeting,
    "",
    "Your payment has been confirmed successfully. Your paid sourcing project is now active, and you can continue inside the app.",
    "",
    "Receipt",
    `Token: ${params.token}`,
    `Amount: ${params.amountText}`,
    `Paystack Reference: ${params.paystackRef}`,
    "",
    "What happens next",
    "1) Open the LineScout app and tap the Open Paid Chat button in this email.",
    "2) Share your requirements in one message if possible (specs, pictures, capacity, voltage, output, target country). If you started this sourcing project from the AI chat, we already have your context.",
    "3) Your sourcing specialist will respond inside the paid chat thread.",
    "",
    "Safety and conduct",
    "Please keep conversations respectful. If you ever feel uncomfortable or need to escalate an issue, you can report it directly inside the paid chat. Reports go straight to our admin team and are not visible to the agent.",
    "",
    "If you did not authorize this payment, reply to this email immediately and we will investigate.",
    "",
    "Sure Importers Limited",
    "Help: hello@sureimports.com",
    "",
    "Address:",
    "Sure Importers Limited",
    "5 Olutosin Ajayi Street,",
    "Ajao Estate, Lagos, Nigeria.",
  ].join("\n");

  const html = `
  <div style="margin:0;padding:0;background:#f6f7fb;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f6f7fb;padding:24px 0;">
      <tr>
        <td align="center" style="padding:0 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="width:600px;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,0.06);">
            <tr>
              <td style="padding:22px 24px;background:#0b0f17;color:#ffffff;">
                <div style="font-size:13px;letter-spacing:0.4px;opacity:0.85;">LineScout by Sure Importers Limited</div>
                <div style="font-size:18px;font-weight:700;margin-top:6px;line-height:1.35;">
                  Payment Confirmed: Your LineScout Sourcing Project is Active
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:22px 24px;color:#0b0f17;font-family:Arial,Helvetica,sans-serif;">
                <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;">${greeting}</p>

                <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#111827;">
                  Your payment has been confirmed successfully. Your paid sourcing project is now active, and you can continue inside the app.
                </p>

                <div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px 14px;margin:14px 0 18px 0;background:#fafafa;">
                  <div style="font-size:12px;font-weight:700;color:#6b7280;margin-bottom:10px;letter-spacing:0.4px;">RECEIPT</div>
                  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-size:14px;color:#111827;">
                    <tr>
                      <td style="padding:6px 0;color:#6b7280;width:160px;">Token</td>
                      <td style="padding:6px 0;font-weight:700;">${params.token}</td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;color:#6b7280;">Amount</td>
                      <td style="padding:6px 0;font-weight:700;">${params.amountText}</td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;color:#6b7280;">Paystack Reference</td>
                      <td style="padding:6px 0;font-weight:700;">${params.paystackRef}</td>
                    </tr>
                  </table>
                </div>

                <div style="margin:0 0 10px 0;font-size:14px;font-weight:700;color:#111827;">What happens next</div>
                <ol style="margin:0 0 18px 18px;padding:0;color:#111827;font-size:14px;line-height:1.7;">
                  <li style="margin:0 0 8px 0;">
                    Open the LineScout app and continue your paid chat:
                    <div style="margin-top:10px;">
                      <a href="${deepLink}" style="display:inline-block;background:#0b0f17;color:#ffffff;text-decoration:none;padding:12px 16px;border-radius:12px;font-weight:700;font-size:14px;">
                        Open Paid Chat
                      </a>
                    </div>
                    <div style="margin-top:10px;font-size:12px;color:#6b7280;">
                      If the button does not open the app, open LineScout and continue from Projects.
                    </div>
                  </li>
                  <li style="margin:0 0 8px 0;">
                    Share your requirements in one message if possible (specs, pictures, capacity, voltage, output, target country).
                    If you started this sourcing project from the AI chat, we already have your context.
                  </li>
                  <li style="margin:0 0 8px 0;">
                    Your sourcing specialist will respond inside the paid chat thread.
                  </li>
                </ol>

                <div style="border:1px solid #e5e7eb;border-radius:12px;padding:12px 14px;background:#ffffff;margin:0 0 16px 0;">
                  <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:6px;">Safety and conduct</div>
                  <div style="font-size:13px;line-height:1.6;color:#374151;">
                    Please keep conversations respectful. If you ever feel uncomfortable or need to escalate an issue, you can report it directly inside the paid chat.
                    Reports go straight to our admin team and are not visible to the agent.
                  </div>
                </div>

                <p style="margin:0 0 16px 0;font-size:13px;line-height:1.6;color:#6b7280;">
                  If you did not authorize this payment, reply to this email immediately and we will investigate.
                </p>

                <div style="padding-top:10px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.6;">
                  <div style="font-weight:700;color:#111827;">Sure Importers Limited</div>
                  <div>Help: <a href="mailto:hello@sureimports.com" style="color:#0b0f17;text-decoration:underline;">hello@sureimports.com</a></div>
                  <div style="margin-top:10px;">
                    Address: Sure Importers Limited, 5 Olutosin Ajayi Street, Ajao Estate, Lagos, Nigeria.
                  </div>
                </div>

              </td>
            </tr>
          </table>

          <div style="width:600px;max-width:600px;margin-top:10px;color:#9ca3af;font-size:11px;line-height:1.5;text-align:left;padding:0 4px;">
            This email was sent because a payment was completed on your LineScout account.
          </div>

        </td>
      </tr>
    </table>
  </div>
  `;

  return { subject, text, html };
}

async function sendEmail(opts: {
  to: string;
  replyTo: string;
  subject: string;
  text: string;
  html: string;
}) {
  const smtp = getSmtpConfig();
  if (!smtp.ok) {
    return { ok: false as const, error: smtp.error };
  }

  const transporter: Transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465, // Hostinger often uses 465 for SSL, 587 for STARTTLS
    auth: { user: smtp.user, pass: smtp.pass },
  });

  await transporter.sendMail({
    from: smtp.from,
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
    const userId = Number((u as any).id || 0);
    const userEmail = String((u as any).email || "").trim() || null;

    const paystackSecret = process.env.PAYSTACK_SECRET_KEY?.trim();
    if (!paystackSecret) {
      return NextResponse.json({ ok: false, error: "Missing PAYSTACK_SECRET_KEY" }, { status: 500 });
    }

    if (!userId || !userEmail) {
      return NextResponse.json({ ok: false, error: "User account is missing id/email." }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const reference = String(body?.reference || "").trim();
    const purpose = normalizePurpose(body?.purpose);

    if (!reference) {
      return NextResponse.json({ ok: false, error: "reference is required" }, { status: 400 });
    }

    // Verify with Paystack
    const r = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${paystackSecret}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    );

    const j: any = await r.json().catch(() => null);

    if (!r.ok || !j?.status || !j?.data) {
      const msg = j?.message || j?.data?.message || `Paystack verify failed (HTTP ${r.status})`;
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }

    const data = j.data;

    if (String(data.status || "").toLowerCase() !== "success") {
      return NextResponse.json(
        { ok: false, error: "Payment not successful yet. Please retry." },
        { status: 409 }
      );
    }

    const metadata = data.metadata || {};
    const paidUserId = safeNum(metadata.user_id);

    // Ensure payment belongs to signed-in user
    if (!paidUserId || paidUserId !== userId) {
      return NextResponse.json({ ok: false, error: "Payment does not belong to this account." }, { status: 403 });
    }

    const routeTypeRaw = String(metadata.route_type || "machine_sourcing").trim();
    const routeType: RouteType = isValidRouteType(routeTypeRaw) ? (routeTypeRaw as RouteType) : "machine_sourcing";
    let finalRouteType: RouteType = routeType;

    const sourceConversationId = safeNum(metadata.source_conversation_id);
    const productMeta = metadata?.product || {};
    const simpleBrief = metadata?.simple_sourcing_brief || null;
    const productId = normalizeText(productMeta?.id);
    const productName = normalizeText(productMeta?.name);
    const productCategory = normalizeText(productMeta?.category);
    const productLandedPerUnit = normalizeText(productMeta?.landed_ngn_per_unit);
    const reorderOfConversationId = safeNum(metadata.reorder_of_conversation_id);
    const reorderOfHandoffId = safeNum(metadata.reorder_of_handoff_id);
    const reorderOriginalAgentId = safeNum(metadata.reorder_original_agent_id);
    const reorderUserNote = String(metadata.reorder_user_note || "").trim();

    const amountRaw = safeNum(data.amount); // kobo
    const currency = String(data.currency || "NGN").trim() || "NGN";
    const amountNaira = naira(amountRaw);

    // Customer details from Paystack (may be null depending on payment method)
    const customer = data.customer || {};
    const payEmail = String(customer.email || userEmail || "").trim() || userEmail;

    const customerFirst = String(customer.first_name || "").trim();
    const customerLast = String(customer.last_name || "").trim();
    const customerName = `${customerFirst} ${customerLast}`.trim() || null;
    const customerPhone = String(customer.phone || "").trim() || null;

    // Token (receipt)
    const token = `${tokenPrefix(purpose)}${randomChunk(6)}-${randomChunk(5)}`;

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // 0) Store token in linescout_tokens (receipt + uniqueness + audit)
      // Note: token column is UNIQUE, paystack_ref is UNIQUE too.
      await conn.query(
        `
        INSERT INTO linescout_tokens
          (token, type, email, amount, currency, paystack_ref, status, metadata, customer_name, customer_phone, created_at)
        VALUES
          (?, ?, ?, ?, ?, ?, 'valid', ?, ?, ?, NOW())
        `,
        [
          token,
          purpose === "business_plan" ? "business_plan" : "sourcing",
          payEmail,
          typeof amountNaira === "number" ? amountNaira : null,
          currency,
          reference,
          JSON.stringify({
            paystack: {
              reference,
              paid_at: data.paid_at || null,
              channel: data.channel || null,
              gateway_response: data.gateway_response || null,
            },
            app: metadata.app || "linescout_mobile",
            route_type: finalRouteType,
            user_id: userId,
            source_conversation_id: sourceConversationId || null,
            reorder_of_conversation_id: reorderOfConversationId || null,
            reorder_of_handoff_id: reorderOfHandoffId || null,
            reorder_original_agent_id: reorderOriginalAgentId || null,
            reorder_user_note: reorderUserNote || null,
            product: productMeta || null,
            raw: {
              amount_kobo: amountRaw,
            },
          }),
          customerName,
          customerPhone,
        ]
      );

      // 1) Resolve re-order context + agent assignment (if applicable)
      let assignedAgentId: number | null = null;
      let assignedAgentEmail: string | null = null;
      let agentEmailNotifications = false;
      let sourceConversationIdForContext = sourceConversationId;
      let sourceHandoffIdForContext: number | null = null;
      let sourceAgentId: number | null = null;
      let sourceProductSummary = "";

      if (purpose === "reorder") {
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
        const status = String(src.handoff_status || "").trim().toLowerCase();
        const isDelivered = status === "delivered" || !!src.delivered_at;
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
      }

      // 2) Create paid conversation
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

      // 3) Create handoff and link to conversation_id
      let aiContextBlock = "";
      if (sourceConversationIdForContext) {
        const [ctxRows]: any = await conn.query(
          `
          SELECT sender_type, message_text
          FROM linescout_messages
          WHERE conversation_id = ?
          ORDER BY id DESC
          LIMIT 12
          `,
          [sourceConversationIdForContext]
        );

        const trimmed = (ctxRows || [])
          .reverse()
          .map((r: any) => {
            const role =
              r.sender_type === "user"
                ? "User"
                : r.sender_type === "ai"
                ? "LineScout"
                : "Agent";
            const text = String(r.message_text || "")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 220);
            return text ? `${role}: ${text}` : "";
          })
          .filter(Boolean);

        if (trimmed.length) {
          aiContextBlock = ["AI context (latest messages):", ...trimmed].join("\n");
        }
      }

      let whiteLabelBrief = "";
      const hasSelectedIdea =
        productName !== "N/A" || productCategory !== "N/A" || productId !== "N/A";
      if (finalRouteType === "white_label" && !hasSelectedIdea) {
        const [wlRows]: any = await conn.query(
          `
          SELECT
            category,
            product_name,
            product_desc,
            reference_link,
            no_link,
            quantity_tier,
            branding_level,
            target_landed_cost_naira
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
        "Created from in-app Paystack payment.",
        purpose === "reorder" && sourceConversationIdForContext
          ? `Re-order of conversation_id: ${sourceConversationIdForContext}`
          : sourceConversationIdForContext
          ? `Source AI conversation_id: ${sourceConversationIdForContext}`
          : "",
        purpose === "reorder" && sourceHandoffIdForContext
          ? `Original handoff_id: ${sourceHandoffIdForContext}`
          : "",
        sourceProductSummary ? `Original product: ${sourceProductSummary}` : "",
        reorderUserNote ? `Customer note: ${reorderUserNote}` : "",
        productName !== "N/A" || productCategory !== "N/A"
          ? `Selected idea: ${productName !== "N/A" ? productName : "Unknown"}${
              productCategory !== "N/A" ? ` (${productCategory})` : ""
            }${productId !== "N/A" ? ` [ID ${productId}]` : ""}`
          : "",
        productLandedPerUnit !== "N/A" ? `Landed per unit: ${productLandedPerUnit}` : "",
        aiContextBlock,
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

      if (typeof amountNaira === "number" && amountNaira > 0) {
        await conn.query(
          `
          INSERT INTO linescout_handoff_financials (handoff_id, currency, total_due)
          VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE
            total_due = GREATEST(total_due, VALUES(total_due)),
            currency = VALUES(currency)
          `,
          [handoffId, currency, amountNaira]
        );

        await conn.query(
          `
          INSERT INTO linescout_handoff_payments
            (handoff_id, amount, currency, purpose, note, paid_at, created_at)
          VALUES
            (?, ?, ?, 'full_payment', 'Sourcing fee (Paystack)', NOW(), NOW())
          `,
          [handoffId, amountNaira, currency]
        );
      }

      // Store identifiers on the token metadata for idempotent verification
      try {
        const metaForToken = {
          paystack: {
            reference,
            paid_at: data.paid_at || null,
            channel: data.channel || null,
            gateway_response: data.gateway_response || null,
          },
          app: metadata.app || "linescout_mobile",
          route_type: finalRouteType,
          user_id: userId,
          source_conversation_id: sourceConversationId || null,
          reorder_of_conversation_id: reorderOfConversationId || null,
          reorder_of_handoff_id: reorderOfHandoffId || null,
          reorder_original_agent_id: reorderOriginalAgentId || null,
          reorder_user_note: reorderUserNote || null,
          product: productMeta || null,
          raw: {
            amount_kobo: amountRaw,
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
          [JSON.stringify(metaForToken), reference]
        );
      } catch {
        // non-fatal
      }

      // 4) Link conversation -> handoff
      await conn.query(
        `
        UPDATE linescout_conversations
        SET handoff_id = ?, payment_status = 'paid', chat_mode = 'paid_human', assigned_agent_id = COALESCE(?, assigned_agent_id)
        WHERE id = ? AND user_id = ?
        LIMIT 1
        `,
        [handoffId, assignedAgentId, conversationId, userId]
      );

      // 4.1) Insert default agent welcome message for the paid chat
      const firstName = firstNameFromUser(u) || (customerFirst || null);
      const agentWelcomeLines = [
        `Hello ${firstName ? firstName : "there"},`,
        "",
        "Our China-based agents have been notified of your request, and one of them will attend to you shortly.",
        "",
        "Please keep all discussions professional and respectful. Do not exchange personal contact details within the chat. If at any point you need assistance, use the Report or Escalate button and our team will respond promptly.",
        "",
        "Thank you.",
      ];
      await conn.query(
        `
        INSERT INTO linescout_messages (conversation_id, sender_type, sender_id, message_text)
        VALUES (?, 'agent', ?, ?)
        `,
        [conversationId, assignedAgentId || null, agentWelcomeLines.join("\n")]
      );

      if (purpose === "reorder") {
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
            reference,
            typeof amountNaira === "number" ? amountNaira : null,
            assignedAgentId ? new Date() : null,
          ]
        );
      }

      await conn.commit();

      try {
        await ensureMarketingTables(conn);
        await recordMarketingEvent(conn, {
          userId,
          eventType: "paystack_verified",
          relatedId: reference,
          meta: {
            purpose,
            route_type: finalRouteType,
            amount_ngn: typeof amountNaira === "number" ? amountNaira : null,
            handoff_id: handoffId,
            conversation_id: conversationId,
          },
          dedupeMinutes: 60,
        });
      } catch {
        // ignore marketing telemetry failures
      }

      // 4) Notify agents about new paid chat (push + optional email)
      try {
        const agentLabel = customerFirst || "Customer";
        if (purpose === "reorder") {
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

            if (agentEmailNotifications && assignedAgentEmail) {
              const mail = buildNoticeEmail({
                subject: "Re-order paid chat assigned to you",
                title: "Re-order paid chat",
                lines: [
                  `${agentLabel} just paid to re-order a delivered project.`,
                  `Route: ${routeLabel(finalRouteType)}`,
                  `Handoff ID: ${handoffId}`,
                  "Open the LineScout Agent app to follow up.",
                ],
                footerNote:
                  "This email was sent because a re-order paid chat was assigned to you on LineScout.",
              });
              await sendEmail({
                to: assignedAgentEmail,
                replyTo: "hello@sureimports.com",
                subject: mail.subject,
                text: mail.text,
                html: mail.html,
              });
            }
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
        } else {
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
            data: { kind: "paid", conversation_id: conversationId, handoff_id: handoffId, route_type: finalRouteType },
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
                `Route: ${routeLabel(finalRouteType)}`,
                `Handoff ID: ${handoffId}`,
                "Open the LineScout Agent app to claim this project.",
              ],
              footerNote:
                "This email was sent because a new paid chat became available for LineScout agents.",
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
              `Route: ${routeLabel(finalRouteType)}`,
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
        }
      } catch {}

      // 4) Send email (do AFTER commit so user never gets email for failed DB writes)
      const amountText = formatNaira(amountNaira);

      const emailPack = buildEmail({
        firstName,
        token,
        amountText: amountText || (typeof amountNaira === "number" ? `₦${amountNaira}` : "NGN"),
        paystackRef: reference,
        handoffId,
      });

      const emailResult = await sendEmail({
        to: payEmail,
        replyTo: "hello@sureimports.com",
        subject: emailPack.subject,
        text: emailPack.text,
        html: emailPack.html,
      });

      // We do not fail the whole request if email fails.
      // Payment and project creation are already committed.
      return NextResponse.json({
        ok: true,
        purpose,
        route_type: finalRouteType,
        receipt_token: token,
        paystack_ref: reference,
        amount: amountNaira,
        currency,
        source_conversation_id: sourceConversationId || null,
        handoff_id: handoffId,
        conversation_id: conversationId,
        email_sent: emailResult.ok === true,
        email_error: emailResult.ok ? null : emailResult,
      });
    } catch (e: any) {
      try {
        await conn.rollback();
      } catch {}
      console.error("paystack/verify error:", e?.message || e);

      // If insert failed due to duplicate paystack_ref, return a helpful message
      const msg = String(e?.message || "");
      if (msg.toLowerCase().includes("duplicate") && msg.toLowerCase().includes("paystack_ref")) {
        try {
          const [trows]: any = await conn.query(
            `
            SELECT token, metadata
            FROM linescout_tokens
            WHERE paystack_ref = ?
            LIMIT 1
            `,
            [reference]
          );

          const tokenRow = trows?.[0];
          const token = String(tokenRow?.token || "").trim();
          let meta: any = null;
          if (tokenRow?.metadata) {
            try {
              meta = typeof tokenRow.metadata === "string" ? JSON.parse(tokenRow.metadata) : tokenRow.metadata;
            } catch {
              meta = null;
            }
          }

          let handoffId = Number(meta?.handoff_id || 0) || null;
          let conversationId = Number(meta?.conversation_id || 0) || null;

          if (!handoffId && token) {
            const [hrows]: any = await conn.query(
              `
              SELECT id, conversation_id
              FROM linescout_handoffs
              WHERE token = ?
              LIMIT 1
              `,
              [token]
            );
            handoffId = Number(hrows?.[0]?.id || 0) || null;
            conversationId = Number(hrows?.[0]?.conversation_id || 0) || conversationId;
          }

          if (handoffId || conversationId) {
            return NextResponse.json({
              ok: true,
              purpose,
              route_type: finalRouteType,
              receipt_token: token || null,
              paystack_ref: reference,
              amount: amountNaira,
              currency,
              source_conversation_id: sourceConversationId || null,
              handoff_id: handoffId,
              conversation_id: conversationId,
              already_processed: true,
            });
          }
        } catch (lookupErr: any) {
          console.error("paystack/verify duplicate lookup error:", lookupErr?.message || lookupErr);
        }

        return NextResponse.json(
          { ok: false, error: "Payment already verified, but project details were not found. Please contact support." },
          { status: 409 }
        );
      }

      return NextResponse.json({ ok: false, error: "Payment verified but project creation failed." }, { status: 500 });
    } finally {
      conn.release();
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
}
