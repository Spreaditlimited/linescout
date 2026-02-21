import type { PoolConnection } from "mysql2/promise";

type Queryable = PoolConnection | { query: (sql: string, params?: any[]) => Promise<any> };

function norm(code: string) {
  return String(code || "").trim().toUpperCase();
}

async function fetchRate(q: Queryable, base: string, quote: string) {
  const [rows]: any = await q.query(
    `
    SELECT rate, base_currency_code, quote_currency_code
    FROM linescout_fx_rates
    WHERE base_currency_code = ? AND quote_currency_code = ?
    ORDER BY effective_at DESC, id DESC
    LIMIT 1
    `,
    [base, quote]
  );
  if (!rows?.length) return null;
  const rate = Number(rows[0]?.rate || 0);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

export async function getFxRate(q: Queryable, baseRaw: string, quoteRaw: string) {
  const base = norm(baseRaw);
  const quote = norm(quoteRaw);
  if (!base || !quote || base === quote) return 1;

  return await fetchRate(q, base, quote);
}

export async function convertAmount(
  q: Queryable,
  amount: number,
  fromRaw: string,
  toRaw: string
) {
  const from = norm(fromRaw);
  const to = norm(toRaw);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (!from || !to) return null;
  if (from === to) return amount;

  const direct = await getFxRate(q, from, to);
  if (!direct) return null;
  return amount * direct;
}
