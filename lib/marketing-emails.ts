import type { PoolConnection } from "mysql2/promise";
import { sendNoticeEmail } from "@/lib/notice-email";

export type MarketingEventType =
  | "white_label_view"
  | "start_sourcing_view"
  | "paystack_init"
  | "paystack_verified";

export type MarketingCampaignKey =
  | "wl_view_no_start"
  | "start_no_pay"
  | "paystack_init_incomplete"
  | "payment_verified"
  | "quote_unpaid"
  | "handoff_shipped"
  | "handoff_delivered"
  | "reorder_eligible";

export async function ensureMarketingTables(conn: PoolConnection) {
  await conn.query(
    `
    CREATE TABLE IF NOT EXISTS linescout_marketing_events (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      event_type VARCHAR(64) NOT NULL,
      related_id VARCHAR(120) NULL,
      meta_json JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_user_type_time (user_id, event_type, created_at),
      KEY idx_related_id (related_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `
  );

  await conn.query(
    `
    CREATE TABLE IF NOT EXISTS linescout_marketing_email_log (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      campaign_key VARCHAR(64) NOT NULL,
      related_id VARCHAR(120) NULL,
      sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      meta_json JSON NULL,
      PRIMARY KEY (id),
      KEY idx_user_campaign (user_id, campaign_key),
      KEY idx_related_id (related_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `
  );
}

export async function recordMarketingEvent(conn: PoolConnection, input: {
  userId: number;
  eventType: MarketingEventType;
  relatedId?: string | null;
  meta?: Record<string, any> | null;
  dedupeMinutes?: number;
}) {
  const { userId, eventType, relatedId, meta, dedupeMinutes } = input;
  if (!userId) return;

  if (dedupeMinutes && dedupeMinutes > 0) {
    const [rows]: any = await conn.query(
      `
      SELECT id
      FROM linescout_marketing_events
      WHERE user_id = ? AND event_type = ?
        AND created_at >= (NOW() - INTERVAL ? MINUTE)
      ORDER BY id DESC
      LIMIT 1
      `,
      [userId, eventType, dedupeMinutes]
    );
    if (rows?.length) return;
  }

  await conn.query(
    `
    INSERT INTO linescout_marketing_events (user_id, event_type, related_id, meta_json)
    VALUES (?, ?, ?, ?)
    `,
    [userId, eventType, relatedId || null, meta ? JSON.stringify(meta) : null]
  );
}

export async function hasSentCampaign(conn: PoolConnection, userId: number, campaign: MarketingCampaignKey, relatedId?: string | null) {
  const [rows]: any = await conn.query(
    `
    SELECT id
    FROM linescout_marketing_email_log
    WHERE user_id = ? AND campaign_key = ?
      ${relatedId ? "AND related_id = ?" : ""}
    LIMIT 1
    `,
    relatedId ? [userId, campaign, relatedId] : [userId, campaign]
  );
  return !!rows?.length;
}

export async function logCampaignSend(conn: PoolConnection, userId: number, campaign: MarketingCampaignKey, relatedId?: string | null, meta?: Record<string, any> | null) {
  await conn.query(
    `
    INSERT INTO linescout_marketing_email_log (user_id, campaign_key, related_id, meta_json)
    VALUES (?, ?, ?, ?)
    `,
    [userId, campaign, relatedId || null, meta ? JSON.stringify(meta) : null]
  );
}

function greeting(firstName: string | null) {
  return firstName ? `Hi ${firstName},` : "Hi there,";
}

export function buildMarketingEmail(campaign: MarketingCampaignKey, input: {
  firstName: string | null;
  paystackRetryLink?: string | null;
  statusLabel?: string | null;
}) {
  const hi = greeting(input.firstName);

  switch (campaign) {
    case "wl_view_no_start":
      return {
        subject: "Found a product idea? Here’s the next step",
        title: "Shortlist and start",
        lines: [
          hi,
          "I noticed you explored our white-label ideas but didn’t start a sourcing project yet. That’s okay — this is the right time to shortlist.",
          "Here’s the simple next step:",
          "1) Pick 2–3 ideas you’re most confident about",
          "2) Check if they match your target customer",
          "3) Start sourcing and we’ll validate suppliers and pricing",
          "If you want, reply with your top idea and we’ll point you in the right direction.",
        ],
        footer: "This email was sent because you explored white-label ideas on LineScout.",
      };
    case "start_no_pay":
      return {
        subject: "Quick reminder about your sourcing project",
        title: "Finish your sourcing setup",
        lines: [
          hi,
          "You started the sourcing process but didn’t complete payment. The sourcing fee activates your project and unlocks your China-based agent.",
          "Once paid, we:",
          "- assign an agent",
          "- verify manufacturers",
          "- guide you through pricing and samples",
          "If you have questions, reply to this email and we’ll help.",
        ],
        footer: "This email was sent because your sourcing project was started but not completed.",
      };
    case "paystack_init_incomplete":
      return {
        subject: "Your payment isn’t complete yet",
        title: "Complete your Paystack payment",
        lines: [
          hi,
          "It looks like your Paystack payment didn’t complete. That’s common if the page was closed or the network dropped.",
          "You can safely try again to continue your sourcing project:",
          input.paystackRetryLink || "Please open LineScout and continue the payment.",
          "Once it’s complete, your project and China agent are automatically created.",
        ],
        footer: "This email was sent because a Paystack payment was started but not completed.",
      };
    case "payment_verified":
      return {
        subject: "Your LineScout project is live",
        title: "Payment confirmed",
        lines: [
          hi,
          "Your payment is confirmed and your sourcing project is now active.",
          "Next steps:",
          "- Your China agent will review your request",
          "- You’ll receive updates in the chat",
          "- We’ll guide you on samples, pricing, and logistics",
          "If you selected a white-label idea, the product details have already been passed to your agent — no need to repeat yourself.",
        ],
        footer: "This email was sent because your payment was confirmed on LineScout.",
      };
    case "quote_unpaid":
      return {
        subject: "Your quote is ready — need help?",
        title: "Quote ready",
        lines: [
          hi,
          "Your quote is ready. If you want, we can walk through the numbers together and explain how costs were calculated.",
          "If you’re ready to proceed, just continue in the project chat. If you’re unsure, reply here and we’ll guide you.",
        ],
        footer: "This email was sent because a quote is ready on your LineScout project.",
      };
    case "handoff_shipped":
      return {
        subject: "Your LineScout order has shipped",
        title: "Order update",
        lines: [
          hi,
          `Update on your LineScout project: ${input.statusLabel || "shipped"}.`,
          "If you have any questions, reply here or check your project chat.",
        ],
        footer: "This email was sent because your LineScout project was updated.",
      };
    case "handoff_delivered":
      return {
        subject: "Your LineScout order has been delivered",
        title: "Order delivered",
        lines: [
          hi,
          "Your order has been delivered. We’d love to hear feedback so we can keep improving the experience.",
          "If you need anything else, reply to this email and we’ll help.",
        ],
        footer: "This email was sent because your LineScout project was delivered.",
      };
    case "reorder_eligible":
      return {
        subject: "Ready to re-order your best seller?",
        title: "Re-order available",
        lines: [
          hi,
          "Now that your order is delivered, re-ordering is the fastest way to keep sales going.",
          "Re-orders are quicker because the supplier is already approved and specs are ready.",
          "If you want to restock, open your project and click re-order.",
        ],
        footer: "This email was sent because you’re eligible to re-order on LineScout.",
      };
    default:
      return null;
  }
}

export async function sendMarketingEmail(opts: {
  to: string;
  firstName: string | null;
  campaign: MarketingCampaignKey;
  paystackRetryLink?: string | null;
  statusLabel?: string | null;
}) {
  const payload = buildMarketingEmail(opts.campaign, {
    firstName: opts.firstName,
    paystackRetryLink: opts.paystackRetryLink,
    statusLabel: opts.statusLabel,
  });
  if (!payload) return { ok: false as const, error: "Unknown campaign" };

  const email = await sendNoticeEmail({
    to: opts.to,
    subject: payload.subject,
    title: payload.title,
    lines: payload.lines,
    footerNote: payload.footer,
  });

  return email;
}
