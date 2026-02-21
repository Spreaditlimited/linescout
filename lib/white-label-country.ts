export type WhiteLabelCurrency = {
  code: string;
  symbol: string;
  locale: string;
};

export function currencyForCode(code?: string | null): WhiteLabelCurrency {
  const c = String(code || "").trim().toUpperCase();
  if (c === "GBP") return { code: "GBP", symbol: "£", locale: "en-GB" };
  if (c === "CAD") return { code: "CAD", symbol: "C$", locale: "en-CA" };
  if (c === "NGN") return { code: "NGN", symbol: "₦", locale: "en-NG" };
  if (c === "USD") return { code: "USD", symbol: "$", locale: "en-US" };
  if (c === "RMB" || c === "CNY") return { code: "CNY", symbol: "¥", locale: "zh-CN" };
  return { code: c || "USD", symbol: c || "$", locale: "en-US" };
}

export function formatCurrency(
  value: number | string | null | undefined,
  currency: WhiteLabelCurrency,
  digits = 0
) {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return new Intl.NumberFormat(currency.locale, {
    style: "currency",
    currency: currency.code,
    maximumFractionDigits: digits,
  }).format(numeric);
}

export type LandedFields = {
  landed_ngn_per_unit_low?: number | null;
  landed_ngn_per_unit_high?: number | null;
  landed_ngn_total_1000_low?: number | null;
  landed_ngn_total_1000_high?: number | null;
  landed_gbp_sea_per_unit_low?: number | null;
  landed_gbp_sea_per_unit_high?: number | null;
  landed_gbp_sea_total_1000_low?: number | null;
  landed_gbp_sea_total_1000_high?: number | null;
  landed_cad_sea_per_unit_low?: number | null;
  landed_cad_sea_per_unit_high?: number | null;
  landed_cad_sea_total_1000_low?: number | null;
  landed_cad_sea_total_1000_high?: number | null;
};

export function pickLandedFieldsByCurrency(
  item: LandedFields,
  currencyCode?: string | null
): {
  perUnitLow: number | null | undefined;
  perUnitHigh: number | null | undefined;
  totalLow: number | null | undefined;
  totalHigh: number | null | undefined;
} {
  const code = String(currencyCode || "").toUpperCase();
  if (code === "GBP") {
    return {
      perUnitLow: item.landed_gbp_sea_per_unit_low,
      perUnitHigh: item.landed_gbp_sea_per_unit_high,
      totalLow: item.landed_gbp_sea_total_1000_low,
      totalHigh: item.landed_gbp_sea_total_1000_high,
    };
  }
  if (code === "CAD") {
    return {
      perUnitLow: item.landed_cad_sea_per_unit_low,
      perUnitHigh: item.landed_cad_sea_per_unit_high,
      totalLow: item.landed_cad_sea_total_1000_low,
      totalHigh: item.landed_cad_sea_total_1000_high,
    };
  }
  return {
    perUnitLow: item.landed_ngn_per_unit_low,
    perUnitHigh: item.landed_ngn_per_unit_high,
    totalLow: item.landed_ngn_total_1000_low,
    totalHigh: item.landed_ngn_total_1000_high,
  };
}
