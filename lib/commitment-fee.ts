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
