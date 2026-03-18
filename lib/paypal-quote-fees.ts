type FeeRule = {
  percent: number;
  fixed: number;
};

export const DEFAULT_PAYPAL_QUOTE_FEE_CONFIG: Record<string, FeeRule> = {
  // Domestic commercial + typical international add-on.
  GBP: { percent: 4.89, fixed: 0.3 },
  CAD: { percent: 3.9, fixed: 0.3 },
  USD: { percent: 4.99, fixed: 0.49 },
};

function num(value: any): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function parsePaypalQuoteFeeConfig(raw: any): Record<string, FeeRule> {
  const source =
    typeof raw === "string"
      ? (() => {
          try {
            return JSON.parse(raw);
          } catch {
            return null;
          }
        })()
      : raw;

  if (!source || typeof source !== "object") return {};

  const next: Record<string, FeeRule> = {};
  for (const [key, value] of Object.entries(source)) {
    const code = String(key || "").trim().toUpperCase();
    if (!code) continue;
    const percent = num((value as any)?.percent);
    const fixed = num((value as any)?.fixed);
    if (percent == null || fixed == null) continue;
    if (percent < 0 || percent >= 100 || fixed < 0) continue;
    next[code] = {
      percent: Number(percent.toFixed(4)),
      fixed: Number(fixed.toFixed(2)),
    };
  }
  return next;
}

export function resolvePaypalQuoteFeeRule(rawConfig: any, currency: string): FeeRule | null {
  const map = parsePaypalQuoteFeeConfig(rawConfig);
  const code = String(currency || "").trim().toUpperCase();
  if (!code) return null;
  return map[code] || null;
}

export function computeGrossFromBaseWithPaypalFee(params: {
  baseAmount: number;
  percent: number;
  fixed: number;
}) {
  const base = Number(params.baseAmount || 0);
  const percent = Number(params.percent || 0);
  const fixed = Number(params.fixed || 0);
  if (!Number.isFinite(base) || base < 0) throw new Error("Invalid base amount.");
  if (!Number.isFinite(percent) || percent < 0 || percent >= 100) throw new Error("Invalid fee percent.");
  if (!Number.isFinite(fixed) || fixed < 0) throw new Error("Invalid fixed fee.");

  const ratio = 1 - percent / 100;
  if (ratio <= 0) throw new Error("Invalid PayPal fee ratio.");

  // Round charge up to cents so net is never under-collected.
  const grossRaw = (base + fixed) / ratio;
  const gross = Math.ceil(grossRaw * 100) / 100;
  const fee = Number(Math.max(0, gross - base).toFixed(2));
  return {
    base: Number(base.toFixed(2)),
    fee,
    gross: Number(gross.toFixed(2)),
  };
}
