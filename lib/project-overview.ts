import type { PoolConnection } from "mysql2/promise";
import { db } from "./db";
import {
  buildConversationAccessScope,
  buildProjectVisibilityScope,
} from "./accounts";

export type ProjectAccountUser = {
  id: number;
  email: string;
  account_id: number;
  account_role: string;
};

export type ProjectOverviewFilter = {
  handoffId?: number;
  conversationId?: number;
};

export class ProjectOverviewError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

function placeholders(values: unknown[]) {
  return values.map(() => "?").join(", ");
}

function pickItems(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object" && Array.isArray((raw as { items?: unknown[] }).items)) {
    return (raw as { items: any[] }).items;
  }
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

function clip(value: unknown, max = 220) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max).trim()}…` : text;
}

function firstRate(
  rates: any[],
  baseCurrency: string,
  quoteCurrency: string,
) {
  const row = rates.find(
    (rate) =>
      String(rate.base_currency_code || "").toUpperCase() === baseCurrency &&
      String(rate.quote_currency_code || "").toUpperCase() === quoteCurrency,
  );
  const value = Number(row?.rate || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

async function queryProjectRows(
  conn: PoolConnection,
  user: ProjectAccountUser,
  filter?: ProjectOverviewFilter,
) {
  const access = buildConversationAccessScope("c", {
    accountId: Number(user.account_id),
    userId: Number(user.id),
  });
  const visibility = buildProjectVisibilityScope("c", "pa", {
    userId: Number(user.id),
    accountRole: String(user.account_role || "member"),
  });
  const clauses = [access.sql, visibility.sql];
  const params: Array<number | string> = [
    Number(user.account_id),
    ...access.params,
    ...visibility.params,
  ];

  if (filter?.handoffId) {
    clauses.push("c.handoff_id = ?");
    params.push(Number(filter.handoffId));
  } else if (filter?.conversationId) {
    clauses.push("c.id = ?");
    params.push(Number(filter.conversationId));
  } else {
    clauses.push("c.handoff_id IS NOT NULL");
    clauses.push("c.chat_mode = 'paid_human'");
    clauses.push("c.payment_status = 'paid'");
  }

  const [rows]: any = await conn.query(
    `
      SELECT
        c.id,
        c.route_type,
        c.project_status,
        c.chat_mode,
        c.payment_status,
        c.handoff_id,
        c.updated_at,
        h.status AS handoff_status,
        h.token AS handoff_token,
        h.context AS handoff_context,
        h.display_currency_code AS handoff_display_currency_code,
        COALESCE(pa.visibility, 'owner_only') AS project_visibility
      FROM linescout_conversations c
      LEFT JOIN linescout_handoffs h ON h.id = c.handoff_id
      LEFT JOIN linescout_project_account_access pa
        ON pa.conversation_id = c.id
       AND pa.account_id = ?
      WHERE ${clauses.join(" AND ")}
      ORDER BY c.updated_at DESC
      LIMIT 50
    `,
    params,
  );

  const projects = Array.isArray(rows) ? rows : [];
  if (filter && !projects.length) {
    throw new ProjectOverviewError("Not found", 404);
  }
  if (
    filter &&
    (projects[0].chat_mode !== "paid_human" ||
      projects[0].payment_status !== "paid" ||
      !projects[0].handoff_id)
  ) {
    throw new ProjectOverviewError(
      "Summary is only available for paid projects.",
      400,
    );
  }
  return projects;
}

async function queryMessageSnapshots(
  conn: PoolConnection,
  conversationIds: number[],
) {
  if (!conversationIds.length) return new Map<number, Record<string, string>>();
  const slots = placeholders(conversationIds);
  const [rows]: any = await conn.query(
    `
      SELECT 'first_user' AS snapshot_kind, m.conversation_id, m.message_text
      FROM linescout_messages m
      INNER JOIN (
        SELECT conversation_id, MIN(id) AS message_id
        FROM linescout_messages
        WHERE sender_type = 'user' AND conversation_id IN (${slots})
        GROUP BY conversation_id
      ) picked ON picked.message_id = m.id
      UNION ALL
      SELECT 'last_user' AS snapshot_kind, m.conversation_id, m.message_text
      FROM linescout_messages m
      INNER JOIN (
        SELECT conversation_id, MAX(id) AS message_id
        FROM linescout_messages
        WHERE sender_type = 'user' AND conversation_id IN (${slots})
        GROUP BY conversation_id
      ) picked ON picked.message_id = m.id
      UNION ALL
      SELECT 'last_agent' AS snapshot_kind, m.conversation_id, m.message_text
      FROM linescout_messages m
      INNER JOIN (
        SELECT conversation_id, MAX(id) AS message_id
        FROM linescout_messages
        WHERE sender_type = 'agent' AND conversation_id IN (${slots})
        GROUP BY conversation_id
      ) picked ON picked.message_id = m.id
    `,
    [...conversationIds, ...conversationIds, ...conversationIds],
  );

  const snapshots = new Map<number, Record<string, string>>();
  for (const row of rows || []) {
    const conversationId = Number(row.conversation_id);
    const current = snapshots.get(conversationId) || {};
    current[String(row.snapshot_kind)] = String(row.message_text || "");
    snapshots.set(conversationId, current);
  }
  return snapshots;
}

function buildSummaryText(snapshot: Record<string, string> | undefined) {
  const goal = clip(snapshot?.first_user, 240);
  const lastCustomer = clip(snapshot?.last_user, 240);
  const lastAgent = clip(snapshot?.last_agent, 240);
  const parts: string[] = [];
  if (goal) parts.push(`Customer goal: ${goal}`);
  if (lastAgent) parts.push(`Latest agent update: ${lastAgent}`);
  if (lastCustomer && lastCustomer !== goal) {
    parts.push(`Latest customer note: ${lastCustomer}`);
  }
  return parts.join("\n\n") || null;
}

function buildQuoteSummary(
  quote: any,
  payments: any[],
  displayCurrencyCode: string,
  rates: any[],
) {
  const productDue = Math.max(
    0,
    Math.round(
      Number(quote.total_product_ngn || 0) +
        Number(quote.total_markup_ngn || 0) -
        Number(quote.commitment_due_ngn || 0),
    ),
  );
  const shippingDue = Math.max(
    0,
    Math.round(Number(quote.total_shipping_ngn || 0)),
  );
  const productPaid = payments.reduce((sum, payment) => {
    const purpose = String(payment?.purpose || "");
    if (
      String(payment?.status || "") === "paid" &&
      ["deposit", "product_balance", "full_product_payment"].includes(purpose)
    ) {
      return sum + Number(payment?.amount || 0);
    }
    return sum;
  }, 0);
  const shippingPaid = payments.reduce((sum, payment) => {
    if (
      String(payment?.status || "") === "paid" &&
      String(payment?.purpose || "") === "shipping_payment"
    ) {
      return sum + Number(payment?.amount || 0);
    }
    return sum;
  }, 0);
  const items = pickItems(quote.items_json);
  const quantity = items.reduce((sum: number, item: any) => {
    const value = Number(item?.quantity || 0);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
  const productBalance = Math.max(0, productDue - productPaid);
  const shippingBalance = Math.max(0, shippingDue - shippingPaid);

  const ngnToDisplay =
    displayCurrencyCode === "NGN"
      ? 1
      : firstRate(rates, "NGN", displayCurrencyCode);
  const rmbToDisplay = firstRate(rates, "RMB", displayCurrencyCode);
  const usdToDisplay = firstRate(rates, "USD", displayCurrencyCode);
  const rmbToNgn = firstRate(rates, "RMB", "NGN");
  let productDueDisplay = 0;
  let shippingDueDisplay = 0;

  if (displayCurrencyCode === "NGN") {
    productDueDisplay = productDue;
    shippingDueDisplay = shippingDue;
  } else if (rmbToDisplay > 0 && usdToDisplay > 0 && rmbToNgn > 0) {
    const productWithMarkupRmb =
      Number(quote.total_product_rmb || 0) +
      Number(quote.total_markup_ngn || 0) / rmbToNgn;
    const productWithMarkupDisplay = productWithMarkupRmb * rmbToDisplay;
    productDueDisplay = Math.max(
      0,
      productWithMarkupDisplay -
        Number(quote.commitment_due_ngn || 0) * ngnToDisplay,
    );
    shippingDueDisplay =
      Number(quote.total_shipping_usd || 0) * usdToDisplay;
  }

  const productPaidDisplay =
    displayCurrencyCode === "NGN" ? productPaid : productPaid * ngnToDisplay;
  const shippingPaidDisplay =
    displayCurrencyCode === "NGN" ? shippingPaid : shippingPaid * ngnToDisplay;

  return {
    quote_id: Number(quote.id),
    quote_token: String(quote.token || ""),
    product_name: items[0]?.product_name
      ? String(items[0].product_name)
      : null,
    quantity,
    due_amount: productBalance + shippingBalance,
    display_currency_code: displayCurrencyCode,
    due_amount_display:
      Math.max(0, productDueDisplay - productPaidDisplay) +
      Math.max(0, shippingDueDisplay - shippingPaidDisplay),
    shipping_type: quote.shipping_type_name
      ? String(quote.shipping_type_name)
      : null,
    product_due: productDue,
    product_paid: productPaid,
    product_balance: productBalance,
    shipping_due: shippingDue,
    shipping_paid: shippingPaid,
    shipping_balance: shippingBalance,
    product_due_display: productDueDisplay,
    shipping_due_display: shippingDueDisplay,
    product_paid_display: productPaidDisplay,
    shipping_paid_display: shippingPaidDisplay,
    product_balance_display: Math.max(
      0,
      productDueDisplay - productPaidDisplay,
    ),
    shipping_balance_display: Math.max(
      0,
      shippingDueDisplay - shippingPaidDisplay,
    ),
  };
}

export async function getProjectOverview(
  user: ProjectAccountUser,
  filter?: ProjectOverviewFilter,
) {
  const conn = await db.getConnection();
  try {
    const projectRows = await queryProjectRows(conn, user, filter);
    const conversationIds = projectRows.map((row: any) => Number(row.id));
    const handoffIds = projectRows
      .map((row: any) => Number(row.handoff_id))
      .filter(Boolean);
    const handoffTokens = projectRows
      .map((row: any) => String(row.handoff_token || "").trim())
      .filter(Boolean);

    if (!projectRows.length) return { projects: [], summaries: [] };

    const snapshots = await queryMessageSnapshots(conn, conversationIds);

    const commitmentsByToken = new Map<string, any>();
    if (handoffTokens.length) {
      const [rows]: any = await conn.query(
        `SELECT id, token, amount, currency, created_at
         FROM linescout_tokens
         WHERE token IN (${placeholders(handoffTokens)})
           AND status = 'valid'
           AND type IN ('sourcing','business_plan')
         ORDER BY id ASC`,
        handoffTokens,
      );
      for (const row of rows || []) {
        const token = String(row.token || "");
        if (!commitmentsByToken.has(token)) commitmentsByToken.set(token, row);
      }
    }

    let quoteRows: any[] = [];
    if (handoffIds.length) {
      const [rows]: any = await conn.query(
        `SELECT
           q.id, q.handoff_id, q.token, q.shipping_type_id,
           q.total_product_ngn, q.total_shipping_ngn, q.total_markup_ngn,
           q.commitment_due_ngn, q.total_product_rmb, q.total_shipping_usd,
           q.display_currency_code, q.items_json, q.created_at,
           st.name AS shipping_type_name
         FROM linescout_quotes q
         LEFT JOIN linescout_shipping_types st ON st.id = q.shipping_type_id
         WHERE q.handoff_id IN (${placeholders(handoffIds)})
         ORDER BY q.id DESC`,
        handoffIds,
      );
      quoteRows = Array.isArray(rows) ? rows : [];
    }

    let rates: any[] = [];
    if (quoteRows.length) {
      const [rows]: any = await conn.query(
        `SELECT base_currency_code, quote_currency_code, rate
         FROM linescout_fx_rates
         WHERE base_currency_code IN ('NGN', 'RMB', 'USD')
         ORDER BY effective_at DESC, id DESC`,
      );
      rates = Array.isArray(rows) ? rows : [];
    }

    const quoteIds = quoteRows.map((row) => Number(row.id)).filter(Boolean);
    let paymentRows: any[] = [];
    if (quoteIds.length) {
      const [rows]: any = await conn.query(
        `SELECT id, quote_id, purpose, method, status, amount, currency,
                provider_ref, created_at, paid_at
         FROM linescout_quote_payments
         WHERE quote_id IN (${placeholders(quoteIds)})
         ORDER BY id DESC`,
        quoteIds,
      );
      paymentRows = Array.isArray(rows) ? rows : [];
    }

    const quotesByHandoff = new Map<number, any[]>();
    for (const quote of quoteRows) {
      const handoffId = Number(quote.handoff_id);
      quotesByHandoff.set(handoffId, [
        ...(quotesByHandoff.get(handoffId) || []),
        quote,
      ]);
    }
    const paymentsByQuote = new Map<number, any[]>();
    for (const payment of paymentRows) {
      const quoteId = Number(payment.quote_id);
      paymentsByQuote.set(quoteId, [
        ...(paymentsByQuote.get(quoteId) || []),
        payment,
      ]);
    }

    const canManageVisibility =
      String(user.account_role || "member") === "owner";
    const summaries = projectRows.map((project: any) => {
      const handoffId = Number(project.handoff_id);
      const projectQuotes = quotesByHandoff.get(handoffId) || [];
      const displayCurrencyCode =
        String(
          projectQuotes[0]?.display_currency_code ||
            project.handoff_display_currency_code ||
            "NGN",
        )
          .trim()
          .toUpperCase() || "NGN";
      const quoteSummaries = projectQuotes.map((quote) =>
        buildQuoteSummary(
          quote,
          paymentsByQuote.get(Number(quote.id)) || [],
          displayCurrencyCode,
          rates,
        ),
      );
      const projectQuoteIds = new Set(
        projectQuotes.map((quote) => Number(quote.id)),
      );
      const quotePayments = paymentRows.filter((payment) =>
        projectQuoteIds.has(Number(payment.quote_id)),
      );
      const commitment = commitmentsByToken.get(
        String(project.handoff_token || "").trim(),
      );
      const commitmentPayment = commitment?.id
        ? {
            id: Number(commitment.id),
            purpose: "commitment_fee",
            method: "card_bank",
            status: "paid",
            amount: Number(commitment.amount || 0),
            currency: String(commitment.currency || "NGN"),
            created_at: commitment.created_at || null,
            paid_at: commitment.created_at || null,
          }
        : null;

      return {
        ok: true,
        conversation_id: Number(project.id),
        handoff_id: handoffId || null,
        route_type:
          String(project.route_type || "").trim() || "machine_sourcing",
        stage: String(project.handoff_status || "").trim() || "pending",
        summary: buildSummaryText(snapshots.get(Number(project.id))),
        project_visibility: String(
          project.project_visibility || "owner_only",
        ),
        can_manage_project_visibility: canManageVisibility,
        handoff_context: project.handoff_context || null,
        quote_summary: quoteSummaries[0] || null,
        quote_summaries: quoteSummaries,
        payments: commitmentPayment
          ? [commitmentPayment, ...quotePayments]
          : quotePayments,
      };
    });

    const projects = projectRows.map((project: any) => ({
      route_type: project.route_type,
      conversation_id: Number(project.id),
      conversation_status: project.project_status,
      handoff_id: Number(project.handoff_id) || null,
      stage: String(project.handoff_status || "").trim() || null,
      has_active_project: Boolean(project.handoff_id),
      updated_at: project.updated_at,
      team_visibility: String(project.project_visibility || "owner_only"),
    }));

    return { projects, summaries };
  } finally {
    conn.release();
  }
}
