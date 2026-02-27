import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { computeLandedRange, ensureWhiteLabelProductsReady } from "@/lib/white-label-products";
import { currencyForCode } from "@/lib/white-label-country";
import { ensureCountryConfig, listActiveCountriesAndCurrencies } from "@/lib/country-config";
import { ensureWhiteLabelSettings } from "@/lib/white-label-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const FX_RATE_NGN = 1500;
const CBM_RATE_NGN = 450000;
const MARKUP = 0.2;
const LANDED_LOW_MULTIPLIER = 0.5;

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

function pickCountryFromCookie(
  cookieValue: string | undefined,
  countries: { id: number; name: string; iso2: string; default_currency_id?: number | null; settlement_currency_code?: string | null }[]
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
      const picked = pickCountryFromCookie(countryCookie, countries);
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
        }
        if (profileCurrencyCode) {
          currencyCode = profileCurrencyCode;
        }
      }

      const [settingsRows]: any = await conn.query(
        `SELECT white_label_subscription_countries FROM linescout_settings ORDER BY id DESC LIMIT 1`
      );
      const eligible = new Set(parseEligibleCountries(settingsRows?.[0]?.white_label_subscription_countries));
      const amazonComparisonEnabled = Boolean(countryCode) && eligible.has(countryCode) && currencyCode !== "NGN";

      await ensureWhiteLabelProductsReady(conn);

      const clauses = ["p.is_active = 1"];
      const params: any[] = [];

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

      const landedLowExpr = `(${LANDED_LOW_MULTIPLIER} * ((COALESCE(p.fob_low_usd,0) * ${FX_RATE_NGN}) + (COALESCE(p.cbm_per_1000,0) * ${CBM_RATE_NGN} / 1000)) * (1 + ${MARKUP}))`;
      const effectivePrice = currencyCode === "NGN" ? price : "";

      if (effectivePrice) {
        if (price === "lt1k") {
          clauses.push(`p.fob_low_usd IS NOT NULL AND ${landedLowExpr} < 1000`);
        } else if (price === "1k-3k") {
          clauses.push(`p.fob_low_usd IS NOT NULL AND ${landedLowExpr} >= 1000 AND ${landedLowExpr} <= 3000`);
        } else if (price === "3k-7k") {
          clauses.push(`p.fob_low_usd IS NOT NULL AND ${landedLowExpr} > 3000 AND ${landedLowExpr} <= 7000`);
        } else if (price === "7k-15k") {
          clauses.push(`p.fob_low_usd IS NOT NULL AND ${landedLowExpr} > 7000 AND ${landedLowExpr} <= 15000`);
        } else if (price === "15kplus") {
          clauses.push(`p.fob_low_usd IS NOT NULL AND ${landedLowExpr} > 15000`);
        }
      }

      const hasAmazonExpr = `(CASE WHEN p.amazon_uk_price_low IS NOT NULL OR p.amazon_uk_price_high IS NOT NULL OR p.amazon_ca_price_low IS NOT NULL OR p.amazon_ca_price_high IS NOT NULL OR p.amazon_us_price_low IS NOT NULL OR p.amazon_us_price_high IS NOT NULL THEN 1 ELSE 0 END)`;
      const sortClause =
        sort === "price_low"
          ? `ORDER BY (p.fob_low_usd IS NULL) ASC, ${landedLowExpr} ASC, p.id DESC`
          : sort === "price_high"
          ? `ORDER BY (p.fob_low_usd IS NULL) ASC, ${landedLowExpr} DESC, p.id DESC`
          : sort === "name"
          ? "ORDER BY p.product_name ASC, p.id DESC"
          : sort === "newest"
          ? "ORDER BY p.id DESC"
          : `ORDER BY ${hasAmazonExpr} DESC, COALESCE(v.views, 0) DESC, p.sort_order ASC, p.id DESC`;

      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

      const [rows]: any = await conn.query(
        `
        SELECT SQL_CALC_FOUND_ROWS p.*, COALESCE(v.views, 0) AS view_count
        FROM linescout_white_label_products p
        LEFT JOIN (
          SELECT product_id, COUNT(*) AS views
          FROM linescout_white_label_views
          GROUP BY product_id
        ) v ON v.product_id = p.id
        ${where}
        ${sortClause}
        LIMIT ? OFFSET ?
        `,
        [...params, PAGE_SIZE, (requestedPage - 1) * PAGE_SIZE]
      );
      const [totalRows]: any = await conn.query(`SELECT FOUND_ROWS() as total`);

      const items = (rows || []).map((r: any) => ({
        ...r,
        ...computeLandedRange({
          fob_low_usd: r.fob_low_usd,
          fob_high_usd: r.fob_high_usd,
          cbm_per_1000: r.cbm_per_1000,
        }),
      }));
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
        SELECT p.*, COALESCE(v.views, 0) AS view_count
        FROM linescout_white_label_products p
        LEFT JOIN (
          SELECT product_id, COUNT(*) AS views
          FROM linescout_white_label_views
          GROUP BY product_id
        ) v ON v.product_id = p.id
        WHERE p.is_active = 1
        ORDER BY view_count DESC, p.sort_order ASC, p.id DESC
        LIMIT 4
        `
      );

      const mostViewed = (viewRows || []).map((r: any) => ({
        ...r,
        ...computeLandedRange({
          fob_low_usd: r.fob_low_usd,
          fob_high_usd: r.fob_high_usd,
          cbm_per_1000: r.cbm_per_1000,
        }),
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
