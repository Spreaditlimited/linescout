import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { computeLandedRange, ensureWhiteLabelProductsReady } from "@/lib/white-label-products";
import { currencyForCode } from "@/lib/white-label-country";
import { ensureCountryConfig, listActiveCountriesAndCurrencies } from "@/lib/country-config";
import { ensureWhiteLabelSettings } from "@/lib/white-label-access";
import { ensureWhiteLabelLandedCostTable } from "@/lib/white-label-landed";
import { isKeepaMarketplaceSupported } from "@/lib/keepa";
import { marketplaceCurrency, resolveAmazonMarketplace } from "@/lib/white-label-marketplace";
import { getFxRate } from "@/lib/fx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
function toInt(value: any, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function parseEligibleCountries(raw?: string | null) {
  const source = String(raw || "GB,CA");
  return source
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean)
    .map((c) => (c === "UK" ? "GB" : c));
}

function pickProductLandedByCurrency(row: any, currencyCode: string) {
  const code = String(currencyCode || "").toUpperCase();
  if (code === "GBP") {
    return {
      low: row.landed_gbp_sea_per_unit_low != null ? Number(row.landed_gbp_sea_per_unit_low) : null,
      high: row.landed_gbp_sea_per_unit_high != null ? Number(row.landed_gbp_sea_per_unit_high) : null,
      totalLow: row.landed_gbp_sea_total_1000_low != null ? Number(row.landed_gbp_sea_total_1000_low) : null,
      totalHigh: row.landed_gbp_sea_total_1000_high != null ? Number(row.landed_gbp_sea_total_1000_high) : null,
    };
  }
  if (code === "CAD") {
    return {
      low: row.landed_cad_sea_per_unit_low != null ? Number(row.landed_cad_sea_per_unit_low) : null,
      high: row.landed_cad_sea_per_unit_high != null ? Number(row.landed_cad_sea_per_unit_high) : null,
      totalLow: row.landed_cad_sea_total_1000_low != null ? Number(row.landed_cad_sea_total_1000_low) : null,
      totalHigh: row.landed_cad_sea_total_1000_high != null ? Number(row.landed_cad_sea_total_1000_high) : null,
    };
  }
  if (code === "USD") {
    return {
      low: row.landed_usd_sea_per_unit_low != null ? Number(row.landed_usd_sea_per_unit_low) : null,
      high: row.landed_usd_sea_per_unit_high != null ? Number(row.landed_usd_sea_per_unit_high) : null,
      totalLow: row.landed_usd_sea_total_1000_low != null ? Number(row.landed_usd_sea_total_1000_low) : null,
      totalHigh: row.landed_usd_sea_total_1000_high != null ? Number(row.landed_usd_sea_total_1000_high) : null,
    };
  }
  return {
    low: row.landed_ngn_per_unit_low != null ? Number(row.landed_ngn_per_unit_low) : null,
    high: row.landed_ngn_per_unit_high != null ? Number(row.landed_ngn_per_unit_high) : null,
    totalLow: row.landed_ngn_total_1000_low != null ? Number(row.landed_ngn_total_1000_low) : null,
    totalHigh: row.landed_ngn_total_1000_high != null ? Number(row.landed_ngn_total_1000_high) : null,
  };
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
    const q = String(url.searchParams.get("q") || "").trim();
    const category = String(url.searchParams.get("category") || "").trim();
    const price = String(url.searchParams.get("price") || "").trim();
    const regulatory = String(url.searchParams.get("regulatory") || "").trim();
    const sort = String(url.searchParams.get("sort") || "").trim();
    const requestedPage = toInt(url.searchParams.get("page"), 1);

    const cookieStore = await cookies();
    const countryCookie = cookieStore.get("wl_country")?.value;
    const sessionToken = cookieStore.get("linescout_session")?.value || "";

    const conn = await db.getConnection();
    try {
      await ensureCountryConfig(conn);
      await ensureWhiteLabelSettings(conn);
      const lists = await listActiveCountriesAndCurrencies(conn);
      const countries = (lists.countries || []) as {
        id: number;
        name: string;
        iso2: string;
        default_currency_id?: number | null;
        settlement_currency_code?: string | null;
      }[];
      const currencyById = new Map<number, string>(
        (lists.currencies || []).map((c: any) => [Number(c.id), String(c.code || "").toUpperCase()])
      );
      let picked = pickCountryFromCookie(countryCookie, countries);
      let countryCode = picked?.iso2 ? String(picked.iso2).toUpperCase() : "NG";
      let currencyCode = getCountryCurrencyCode(picked, currencyById);

      let profileCountryCode = "";
      let profileCurrencyCode = "";
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
        profileCountryCode = userRow?.country_iso2 ? String(userRow.country_iso2).toUpperCase() : "";
        profileCurrencyCode = userRow?.currency_code ? String(userRow.currency_code).toUpperCase() : "";
        if (profileCountryCode) {
          countryCode = profileCountryCode;
          picked = countries.find((c) => c.iso2 === profileCountryCode) || picked;
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
        Boolean(countryCode) &&
        eligible.has(countryCode) &&
        amazonEnabledFlag &&
        isKeepaMarketplaceSupported(countryMarketplace);

      await ensureWhiteLabelProductsReady(conn);
      await ensureWhiteLabelLandedCostTable(conn);

      const clauses = ["p.is_active = 1"];
      const params: any[] = [];
      const countryId = picked?.id ? Number(picked.id) : 0;

      if (category) {
        clauses.push("p.category = ?");
        params.push(category);
      }

      if (q) {
        const like = `%${q.toLowerCase()}%`;
        clauses.push(
          `(LOWER(p.product_name) LIKE ? OR LOWER(p.category) LIKE ? OR LOWER(COALESCE(p.short_desc,'')) LIKE ? OR LOWER(COALESCE(p.why_sells,'')) LIKE ?)`
        );
        params.push(like, like, like, like);
      }

      if (regulatory === "non_regulated") {
        clauses.push(
          `(LOWER(COALESCE(p.regulatory_note,'')) LIKE '%non-regulated%' OR LOWER(COALESCE(p.regulatory_note,'')) LIKE '%non regulated%')`
        );
      } else if (regulatory === "regulated") {
        clauses.push(
          `COALESCE(p.regulatory_note,'') <> '' AND LOWER(COALESCE(p.regulatory_note,'')) NOT LIKE '%non-regulated%' AND LOWER(COALESCE(p.regulatory_note,'')) NOT LIKE '%non regulated%'`
        );
      } else if (regulatory === "unknown") {
        clauses.push(`COALESCE(p.regulatory_note,'') = ''`);
      }

      const effectivePrice = currencyCode === "NGN" ? price : "";

      if (effectivePrice) {
        if (price === "lt1k") {
          clauses.push(
            `COALESCE(lc.landed_per_unit_low, p.landed_ngn_per_unit_low) IS NOT NULL AND COALESCE(lc.landed_per_unit_low, p.landed_ngn_per_unit_low) < 1000`
          );
        } else if (price === "1k-3k") {
          clauses.push(
            `COALESCE(lc.landed_per_unit_low, p.landed_ngn_per_unit_low) IS NOT NULL AND COALESCE(lc.landed_per_unit_low, p.landed_ngn_per_unit_low) >= 1000 AND COALESCE(lc.landed_per_unit_low, p.landed_ngn_per_unit_low) <= 3000`
          );
        } else if (price === "3k-7k") {
          clauses.push(
            `COALESCE(lc.landed_per_unit_low, p.landed_ngn_per_unit_low) IS NOT NULL AND COALESCE(lc.landed_per_unit_low, p.landed_ngn_per_unit_low) > 3000 AND COALESCE(lc.landed_per_unit_low, p.landed_ngn_per_unit_low) <= 7000`
          );
        } else if (price === "7k-15k") {
          clauses.push(
            `COALESCE(lc.landed_per_unit_low, p.landed_ngn_per_unit_low) IS NOT NULL AND COALESCE(lc.landed_per_unit_low, p.landed_ngn_per_unit_low) > 7000 AND COALESCE(lc.landed_per_unit_low, p.landed_ngn_per_unit_low) <= 15000`
          );
        } else if (price === "15kplus") {
          clauses.push(
            `COALESCE(lc.landed_per_unit_low, p.landed_ngn_per_unit_low) IS NOT NULL AND COALESCE(lc.landed_per_unit_low, p.landed_ngn_per_unit_low) > 15000`
          );
        }
      }

      const hasAmazonExpr = `(CASE WHEN p.amazon_uk_price_low IS NOT NULL OR p.amazon_uk_price_high IS NOT NULL OR p.amazon_ca_price_low IS NOT NULL OR p.amazon_ca_price_high IS NOT NULL OR p.amazon_us_price_low IS NOT NULL OR p.amazon_us_price_high IS NOT NULL THEN 1 ELSE 0 END)`;
      const sortClause =
        sort === "price_low"
          ? `ORDER BY (COALESCE(lc.landed_per_unit_low, p.landed_ngn_per_unit_low) IS NULL) ASC, COALESCE(lc.landed_per_unit_low, p.landed_ngn_per_unit_low) ASC, p.id DESC`
          : sort === "price_high"
          ? `ORDER BY (COALESCE(lc.landed_per_unit_low, p.landed_ngn_per_unit_low) IS NULL) ASC, COALESCE(lc.landed_per_unit_low, p.landed_ngn_per_unit_low) DESC, p.id DESC`
          : sort === "name"
          ? "ORDER BY p.product_name ASC, p.id DESC"
          : sort === "newest"
          ? "ORDER BY p.id DESC"
          : `ORDER BY ${hasAmazonExpr} DESC, COALESCE(v.views, 0) DESC, p.sort_order ASC, p.id DESC`;

      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

      const [rows]: any = await conn.query(
        `
        SELECT SQL_CALC_FOUND_ROWS p.*, COALESCE(v.views, 0) AS view_count,
               lc.freight_per_unit, lc.landed_per_unit_low, lc.landed_per_unit_high, lc.landed_total_1000_low, lc.landed_total_1000_high
        FROM linescout_white_label_products p
        LEFT JOIN linescout_white_label_landed_costs lc
          ON lc.product_id = p.id AND lc.country_id = ?
        LEFT JOIN (
          SELECT product_id, COUNT(*) AS views
          FROM linescout_white_label_views
          GROUP BY product_id
        ) v ON v.product_id = p.id
        ${where}
        ${sortClause}
        LIMIT ? OFFSET ?
        `,
        [countryId, ...params, PAGE_SIZE, (requestedPage - 1) * PAGE_SIZE]
      );
      const [totalRows]: any = await conn.query(`SELECT FOUND_ROWS() as total`);

      const preferredMarketplace = resolveAmazonMarketplace({
        marketplace: picked?.amazon_marketplace,
        countryIso2: countryCode,
        currencyCode,
      });
      const amazonCurrency = marketplaceCurrency(preferredMarketplace);
      const amazonFx =
        currencyCode === amazonCurrency ? 1 : await getFxRate(conn, currencyCode, amazonCurrency);
      const ngnToDisplayFx =
        currencyCode === "NGN" ? 1 : await getFxRate(conn, "NGN", currencyCode);

      const items = (rows || []).map((r: any) => {
        let landedLow = r.landed_per_unit_low != null ? Number(r.landed_per_unit_low) : null;
        let landedHigh = r.landed_per_unit_high != null ? Number(r.landed_per_unit_high) : null;
        let landedTotalLow =
          r.landed_total_1000_low != null ? Number(r.landed_total_1000_low) : null;
        let landedTotalHigh =
          r.landed_total_1000_high != null ? Number(r.landed_total_1000_high) : null;

        const productLanded = pickProductLandedByCurrency(r, currencyCode);
        landedLow = landedLow ?? productLanded.low;
        landedHigh = landedHigh ?? productLanded.high;
        landedTotalLow = landedTotalLow ?? productLanded.totalLow;
        landedTotalHigh = landedTotalHigh ?? productLanded.totalHigh;

        if (landedLow == null || landedHigh == null || landedTotalLow == null || landedTotalHigh == null) {
          const computedNgn = computeLandedRange({
            fob_low_usd: r.fob_low_usd,
            fob_high_usd: r.fob_high_usd,
            cbm_per_1000: r.cbm_per_1000,
          });

          if (currencyCode === "NGN") {
            landedLow = landedLow ?? computedNgn.landed_ngn_per_unit_low;
            landedHigh = landedHigh ?? computedNgn.landed_ngn_per_unit_high;
            landedTotalLow = landedTotalLow ?? computedNgn.landed_ngn_total_1000_low;
            landedTotalHigh = landedTotalHigh ?? computedNgn.landed_ngn_total_1000_high;
          } else if (ngnToDisplayFx && ngnToDisplayFx > 0) {
            landedLow =
              landedLow ??
              (computedNgn.landed_ngn_per_unit_low != null
                ? Number(computedNgn.landed_ngn_per_unit_low) * ngnToDisplayFx
                : null);
            landedHigh =
              landedHigh ??
              (computedNgn.landed_ngn_per_unit_high != null
                ? Number(computedNgn.landed_ngn_per_unit_high) * ngnToDisplayFx
                : null);
            landedTotalLow =
              landedTotalLow ??
              (computedNgn.landed_ngn_total_1000_low != null
                ? Number(computedNgn.landed_ngn_total_1000_low) * ngnToDisplayFx
                : null);
            landedTotalHigh =
              landedTotalHigh ??
              (computedNgn.landed_ngn_total_1000_high != null
                ? Number(computedNgn.landed_ngn_total_1000_high) * ngnToDisplayFx
                : null);
          }
        }

        const amazonLandedLow =
          landedLow != null && amazonFx ? Number(landedLow) * amazonFx : null;
        const amazonLandedHigh =
          landedHigh != null && amazonFx ? Number(landedHigh) * amazonFx : null;
        const ukLow = r.amazon_uk_price_low != null ? Number(r.amazon_uk_price_low) : null;
        const ukHigh = r.amazon_uk_price_high != null ? Number(r.amazon_uk_price_high) : null;
        const caLow = r.amazon_ca_price_low != null ? Number(r.amazon_ca_price_low) : null;
        const caHigh = r.amazon_ca_price_high != null ? Number(r.amazon_ca_price_high) : null;
        const usLow = r.amazon_us_price_low != null ? Number(r.amazon_us_price_low) : null;
        const usHigh = r.amazon_us_price_high != null ? Number(r.amazon_us_price_high) : null;
        const hasUk = Number.isFinite(ukLow) || Number.isFinite(ukHigh);
        const hasCa = Number.isFinite(caLow) || Number.isFinite(caHigh);
        const hasUs = Number.isFinite(usLow) || Number.isFinite(usHigh);
        const market = preferredMarketplace;
        return {
          ...r,
          landed_per_unit_low: landedLow,
          landed_per_unit_high: landedHigh,
          landed_total_1000_low: landedTotalLow,
          landed_total_1000_high: landedTotalHigh,
          landed_currency_code: currencyCode,
          amazon_landed_per_unit_low: amazonLandedLow,
          amazon_landed_per_unit_high: amazonLandedHigh,
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
      });
      const total = Number(totalRows?.[0]?.total || 0);

      const [catRows]: any = await conn.query(
        `
        SELECT DISTINCT category
        FROM linescout_white_label_products
        WHERE is_active = 1
        ORDER BY category ASC
        `
      );
      const categories = (catRows || [])
        .map((r: any) => String(r.category || "").trim())
        .filter(Boolean);

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
        LIMIT 4
        `
        ,
        [countryId]
      );

      const mostViewed = (viewRows || []).map((r: any) => ({
        ...r,
        landed_per_unit_low: r.landed_per_unit_low ?? null,
        landed_per_unit_high: r.landed_per_unit_high ?? null,
        landed_total_1000_low: r.landed_total_1000_low ?? null,
        landed_total_1000_high: r.landed_total_1000_high ?? null,
        landed_currency_code: currencyCode,
      }));

      const currency = currencyForCode(currencyCode);
      const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      const page = Math.min(requestedPage, totalPages);
      const categoryOptions = [{ value: "", label: "All categories" }].concat(
        categories.map((c: string) => ({ value: c, label: c }))
      );
      const priceOptions =
        currencyCode === "NGN"
          ? [
              { value: "", label: "Any budget" },
              { value: "lt1k", label: "Under ₦1,000" },
              { value: "1k-3k", label: "₦1,000 - ₦3,000" },
              { value: "3k-7k", label: "₦3,000 - ₦7,000" },
              { value: "7k-15k", label: "₦7,000 - ₦15,000" },
              { value: "15kplus", label: "₦15,000+" },
            ]
          : [{ value: "", label: "Any budget" }];
      const regulatoryOptions = [
        { value: "", label: "Any status" },
        { value: "non_regulated", label: "Non-regulated only" },
        { value: "regulated", label: "Regulated only" },
        { value: "unknown", label: "Unknown" },
      ];
      const sortOptions = [
        { value: "", label: "Recommended" },
        { value: "newest", label: "Newest" },
        { value: "price_low", label: "Price: Low to High" },
        { value: "price_high", label: "Price: High to Low" },
        { value: "name", label: "Name (A-Z)" },
      ];
      const countryOptions = countries.map((c) => ({
        value: String(c.iso2 || "").toUpperCase(),
        label: c.name,
      }));

      return NextResponse.json({
        ok: true,
        items,
        total,
        categories,
        mostViewed,
        countryCode,
        profileCountryCode,
        currencyCode,
        currency,
        amazonComparisonEnabled,
        q,
        category,
        price: effectivePrice,
        regulatory,
        sort,
        page,
        totalPages,
        categoryOptions,
        priceOptions,
        regulatoryOptions,
        sortOptions,
        countryOptions,
      });
    } finally {
      conn.release();
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Unable to load ideas." }, { status: 500 });
  }
}
