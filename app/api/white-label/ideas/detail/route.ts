import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { ensureWhiteLabelProductsReady } from "@/lib/white-label-products";
import { ensureCountryConfig, listActiveCountriesAndCurrencies } from "@/lib/country-config";
import { ensureWhiteLabelSettings } from "@/lib/white-label-access";
import { ensureWhiteLabelLandedCostTable } from "@/lib/white-label-landed";
import { isKeepaMarketplaceSupported } from "@/lib/keepa";
import { marketplaceCurrency, resolveAmazonMarketplace } from "@/lib/white-label-marketplace";
import { getFxRate } from "@/lib/fx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseEligibleCountries(raw?: string | null) {
  const source = String(raw || "GB,CA");
  return source
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean)
    .map((c) => (c === "UK" ? "GB" : c));
}

function pickCountryFromCookie(
  cookieValue: string | undefined,
  countries: {
    id: number;
    name: string;
    iso2: string;
    default_currency_id?: number | null;
    settlement_currency_code?: string | null;
    amazon_marketplace?: string | null;
    amazon_enabled?: number | null;
  }[]
) {
  const normalized = String(cookieValue || "").trim().toUpperCase();
  const picked =
    countries.find((c) => c.iso2 === normalized) ||
    (normalized === "UK" ? countries.find((c) => c.iso2 === "GB") : null) ||
    countries.find((c) => c.iso2 === "NG") ||
    countries[0] ||
    null;
  return picked;
}

function getCountryCurrencyCode(
  country: { default_currency_id?: number | null; settlement_currency_code?: string | null } | null,
  currencyById: Map<number, string>
) {
  if (!country) return "NGN";
  const fromDefault = country.default_currency_id
    ? currencyById.get(Number(country.default_currency_id)) || null
    : null;
  const allowed = new Set(["NGN", "GBP", "CAD", "USD"]);
  const candidate = String(fromDefault || country.settlement_currency_code || "NGN").toUpperCase();
  if (allowed.has(candidate)) return candidate;
  const settlement = String(country.settlement_currency_code || "NGN").toUpperCase();
  return allowed.has(settlement) ? settlement : "NGN";
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const slug = String(url.searchParams.get("slug") || "").trim();
    if (!slug) {
      return NextResponse.json({ ok: false, error: "Missing slug." }, { status: 400 });
    }

    const cookieStore = await cookies();
    const countryCookie = cookieStore.get("wl_country")?.value;
    const sessionToken = cookieStore.get("linescout_session")?.value || "";

    const conn = await db.getConnection();
    try {
      await ensureCountryConfig(conn);
      await ensureWhiteLabelSettings(conn);
      const lists = await listActiveCountriesAndCurrencies(conn);
      const currencyById = new Map<number, string>(
        (lists.currencies || []).map((c: any) => [Number(c.id), String(c.code || "").toUpperCase()])
      );
      let picked = pickCountryFromCookie(countryCookie, (lists.countries || []) as any[]);
      let currencyCode = getCountryCurrencyCode(picked, currencyById);
      let countryIso2 = picked?.iso2 ? String(picked.iso2).toUpperCase() : "";

      if (sessionToken) {
        const [userRows]: any = await conn.query(
          `
          SELECT c.iso2 AS country_iso2, cur.code AS currency_code
          FROM users u
          JOIN linescout_user_sessions s ON s.user_id = u.id
          LEFT JOIN linescout_countries c ON c.id = u.country_id
          LEFT JOIN linescout_currencies cur ON cur.id = c.default_currency_id
          WHERE s.refresh_token_hash = SHA2(?, 256)
          LIMIT 1
          `,
          [sessionToken]
        );
        const userRow = userRows?.[0];
        const profileCountryCode = userRow?.country_iso2 ? String(userRow.country_iso2).toUpperCase() : "";
        const profileCurrencyCode = userRow?.currency_code ? String(userRow.currency_code).toUpperCase() : "";
        if (profileCountryCode) {
          countryIso2 = profileCountryCode;
          picked = (lists.countries || []).find((c: any) => c.iso2 === profileCountryCode) || picked;
        }
        if (profileCurrencyCode) {
          currencyCode = profileCurrencyCode;
        }
      }

      const [settingsRows]: any = await conn.query(
        `SELECT white_label_subscription_countries FROM linescout_settings ORDER BY id DESC LIMIT 1`
      );
      const eligible = new Set(parseEligibleCountries(settingsRows?.[0]?.white_label_subscription_countries));
      const countryMarketplace = picked?.amazon_marketplace || null;
      const amazonEnabledFlag = picked?.amazon_enabled === 1;
      const amazonComparisonEnabled =
        Boolean(countryIso2) &&
        eligible.has(countryIso2) &&
        amazonEnabledFlag &&
        isKeepaMarketplaceSupported(countryMarketplace);

      await ensureWhiteLabelProductsReady(conn);
      await ensureWhiteLabelLandedCostTable(conn);

      const countryId = picked?.id ? Number(picked.id) : 0;
      const [rows]: any = await conn.query(
        `
        SELECT p.*, COALESCE(v.views, 0) AS view_count,
               lc.freight_per_unit, lc.landed_per_unit_low, lc.landed_per_unit_high, lc.landed_total_1000_low, lc.landed_total_1000_high
        FROM linescout_white_label_products p
        LEFT JOIN linescout_white_label_landed_costs lc
          ON lc.product_id = p.id AND lc.country_id = ?
        LEFT JOIN (
          SELECT product_id, COUNT(*) AS views
          FROM linescout_white_label_views
          GROUP BY product_id
        ) v ON v.product_id = p.id
        WHERE (p.slug = ? OR REGEXP_REPLACE(LOWER(p.product_name), '[^a-z0-9]+', '-') = ?) AND p.is_active = 1
        LIMIT 1
        `,
        [countryId, slug, slug]
      );
      const product = rows?.[0] || null;
      if (!product) {
        return NextResponse.json({ ok: false, error: "Product not found." }, { status: 404 });
      }

      const [similarRows]: any = await conn.query(
        `
        SELECT p.*, COALESCE(v.views, 0) AS view_count,
               lc.freight_per_unit, lc.landed_per_unit_low, lc.landed_per_unit_high, lc.landed_total_1000_low, lc.landed_total_1000_high
        FROM linescout_white_label_products p
        LEFT JOIN linescout_white_label_landed_costs lc
          ON lc.product_id = p.id AND lc.country_id = ?
        LEFT JOIN (
          SELECT product_id, COUNT(*) AS views
          FROM linescout_white_label_views
          GROUP BY product_id
        ) v ON v.product_id = p.id
        WHERE p.category = ? AND p.id <> ? AND p.is_active = 1
        ORDER BY view_count DESC, p.sort_order ASC, p.id DESC
        LIMIT 8
        `,
        [countryId, product.category, product.id]
      );

      const [viewRows]: any = await conn.query(
        `
        SELECT p.*, COALESCE(v.views, 0) AS view_count,
               lc.freight_per_unit, lc.landed_per_unit_low, lc.landed_per_unit_high, lc.landed_total_1000_low, lc.landed_total_1000_high
        FROM linescout_white_label_products p
        LEFT JOIN linescout_white_label_landed_costs lc
          ON lc.product_id = p.id AND lc.country_id = ?
        LEFT JOIN (
          SELECT product_id, COUNT(*) AS views
          FROM linescout_white_label_views
          GROUP BY product_id
        ) v ON v.product_id = p.id
        WHERE p.is_active = 1
        ORDER BY view_count DESC, p.sort_order ASC, p.id DESC
        LIMIT 6
        `
        ,
        [countryId]
      );

      const preferredMarketplace = resolveAmazonMarketplace({
        marketplace: picked?.amazon_marketplace,
        countryIso2,
        currencyCode,
      });
      const amazonCurrency = marketplaceCurrency(preferredMarketplace);
      const amazonFx =
        currencyCode === amazonCurrency ? 1 : await getFxRate(conn, currencyCode, amazonCurrency);

      const withLanded = (item: any) => {
        const landedLow = item.landed_per_unit_low != null ? Number(item.landed_per_unit_low) : null;
        const landedHigh = item.landed_per_unit_high != null ? Number(item.landed_per_unit_high) : null;
        const ukLow = item.amazon_uk_price_low != null ? Number(item.amazon_uk_price_low) : null;
        const ukHigh = item.amazon_uk_price_high != null ? Number(item.amazon_uk_price_high) : null;
        const caLow = item.amazon_ca_price_low != null ? Number(item.amazon_ca_price_low) : null;
        const caHigh = item.amazon_ca_price_high != null ? Number(item.amazon_ca_price_high) : null;
        const usLow = item.amazon_us_price_low != null ? Number(item.amazon_us_price_low) : null;
        const usHigh = item.amazon_us_price_high != null ? Number(item.amazon_us_price_high) : null;
        const hasUk = Number.isFinite(ukLow) || Number.isFinite(ukHigh);
        const hasCa = Number.isFinite(caLow) || Number.isFinite(caHigh);
        const hasUs = Number.isFinite(usLow) || Number.isFinite(usHigh);
        const market = preferredMarketplace;
        return {
          ...item,
          landed_per_unit_low: landedLow,
          landed_per_unit_high: landedHigh,
          landed_total_1000_low: item.landed_total_1000_low ?? null,
          landed_total_1000_high: item.landed_total_1000_high ?? null,
          landed_currency_code: currencyCode,
          amazon_landed_per_unit_low: landedLow != null && amazonFx ? landedLow * amazonFx : null,
          amazon_landed_per_unit_high: landedHigh != null && amazonFx ? landedHigh * amazonFx : null,
          amazon_display_marketplace: market,
          amazon_display_currency: market ? marketplaceCurrency(market) : null,
          amazon_display_price_low: market === "US" ? usLow : market === "CA" ? caLow : market === "UK" ? ukLow : null,
          amazon_display_price_high:
            market === "US" ? usHigh : market === "CA" ? caHigh : market === "UK" ? ukHigh : null,
          amazon_display_note:
            preferredMarketplace === "US" && !hasUs
              ? "Amazon US price not available at this time for this product."
              : preferredMarketplace === "CA" && !hasCa
              ? "Amazon CA price not available at this time for this product."
              : preferredMarketplace === "UK" && !hasUk
              ? "Amazon UK price not available at this time for this product."
              : null,
        };
      };

      const productWithLanded = withLanded(product);
      const similarItems = (similarRows || []).map(withLanded);
      const trendingItems = (viewRows || []).map(withLanded);

      return NextResponse.json({
        ok: true,
        product: productWithLanded,
        similar: similarItems,
        trending: trendingItems,
        currencyCode,
        countryIso2,
        amazonComparisonEnabled,
      });
    } finally {
      conn.release();
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Unable to load product." }, { status: 500 });
  }
}
