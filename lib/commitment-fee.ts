import { getFxRate } from "@/lib/fx";

function num(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeCurrency(code: any) {
  return String(code || "NGN").trim().toUpperCase() || "NGN";
}

export async function resolveActualCommitmentPayment(
  conn: any,
  handoffId: number,
  fallbackNgn = 0
): Promise<{
  amount: number;
  currency: string;
  amountNgn: number;
  source: "token" | "fallback";
}> {
  const hid = Number(handoffId || 0);
  if (!hid) {
    return {
      amount: num(fallbackNgn, 0),
      currency: "NGN",
      amountNgn: num(fallbackNgn, 0),
      source: "fallback",
    };
  }

  const [handoffRows]: any = await conn.query(
    `SELECT token
     FROM linescout_handoffs
     WHERE id = ?
     LIMIT 1`,
    [hid]
  );
  const handoffToken = String(handoffRows?.[0]?.token || "").trim();
  if (!handoffToken) {
    return {
      amount: num(fallbackNgn, 0),
      currency: "NGN",
      amountNgn: num(fallbackNgn, 0),
      source: "fallback",
    };
  }

  const [commitRows]: any = await conn.query(
    `SELECT amount, currency
     FROM linescout_tokens
     WHERE token = ?
       AND status = 'valid'
       AND type IN ('sourcing', 'business_plan')
     ORDER BY id ASC
     LIMIT 1`,
    [handoffToken]
  );
  const cp = commitRows?.[0];
  if (!cp) {
    return {
      amount: num(fallbackNgn, 0),
      currency: "NGN",
      amountNgn: num(fallbackNgn, 0),
      source: "fallback",
    };
  }

  const amount = num(cp.amount, 0);
  const currency = normalizeCurrency(cp.currency);
  if (currency === "NGN") {
    return {
      amount,
      currency,
      amountNgn: amount,
      source: "token",
    };
  }

  const fx = await getFxRate(conn, currency, "NGN");
  if (!fx || fx <= 0) {
    return {
      amount,
      currency,
      amountNgn: num(fallbackNgn, 0),
      source: "fallback",
    };
  }

  return {
    amount,
    currency,
    amountNgn: Number((amount * fx).toFixed(2)),
    source: "token",
  };
}

export async function resolveCommitmentPaymentForQuote(
  conn: any,
  params: { handoffId: number; quoteId: number; fallbackNgn?: number }
): Promise<{
  amount: number;
  currency: string;
  amountNgn: number;
  source: "token" | "fallback";
  applies: boolean;
}> {
  const handoffId = Number(params.handoffId || 0);
  const quoteId = Number(params.quoteId || 0);
  const fallbackNgn = num(params.fallbackNgn, 0);

  if (!handoffId || !quoteId) {
    return {
      amount: 0,
      currency: "NGN",
      amountNgn: 0,
      source: "fallback",
      applies: false,
    };
  }

  const [appliedRows]: any = await conn.query(
    `SELECT qp.quote_id
     FROM linescout_quote_payments qp
     JOIN linescout_quotes q ON q.id = qp.quote_id
     WHERE q.handoff_id = ?
       AND qp.status = 'paid'
       AND qp.purpose IN ('deposit', 'product_balance', 'full_product_payment')
     ORDER BY qp.id ASC
     LIMIT 1`,
    [handoffId]
  );

  const appliedQuoteId = Number(appliedRows?.[0]?.quote_id || 0);
  if (appliedQuoteId > 0 && appliedQuoteId !== quoteId) {
    return {
      amount: 0,
      currency: "NGN",
      amountNgn: 0,
      source: "fallback",
      applies: false,
    };
  }

  const resolved = await resolveActualCommitmentPayment(conn, handoffId, fallbackNgn);
  return {
    ...resolved,
    applies: true,
  };
}
