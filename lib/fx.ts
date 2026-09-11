import type { PoolConnection, RowDataPacket } from "mysql2/promise";

type Queryable = Pick<PoolConnection, "query">;
type RateRow = RowDataPacket & { rate: string | number };

function norm(code: string) {
  return String(code || "").trim().toUpperCase();
}

async function fetchRate(q: Queryable, base: string, quote: string) {
  const [rows] = await q.query<RateRow[]>(
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

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export async function getHistoricalUsdRate(
  q: Queryable,
  baseRaw: string,
  occurredAt: Date,
) {
  const base = norm(baseRaw);
  if (!base) return null;
  if (base === "USD") return { rate: 1, source: "IDENTITY" };

  const day = isoDate(occurredAt);
  const [storedRows] = await q.query<RateRow[]>(
    `SELECT rate
     FROM linescout_fx_rates
     WHERE base_currency_code = ? AND quote_currency_code = 'USD'
       AND DATE(effective_at) = ?
     ORDER BY effective_at DESC, id DESC
     LIMIT 1`,
    [base, day],
  );
  const stored = Number(storedRows?.[0]?.rate || 0);
  if (Number.isFinite(stored) && stored > 0) {
    return { rate: stored, source: "LINESCOUT_HISTORICAL_RATE" };
  }

  try {
    const response = await fetch(
      `https://api.frankfurter.app/${day}?from=${encodeURIComponent(base)}&to=USD`,
      { signal: AbortSignal.timeout(8_000) },
    );
    const payload = await response.json().catch(() => null);
    const rate = Number(payload?.rates?.USD || 0);
    if (!response.ok || !Number.isFinite(rate) || rate <= 0) return null;
    await q.query(
      `INSERT INTO linescout_fx_rates
        (base_currency_code, quote_currency_code, rate, effective_at)
       VALUES (?, 'USD', ?, ?)`,
      [base, rate, `${day} 12:00:00`],
    );
    return { rate, source: "FRANKFURTER_ECB_REFERENCE" };
  } catch {
    return null;
  }
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
