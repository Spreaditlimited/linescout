import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { computeLandedRange, ensureWhiteLabelProductsReady } from "@/lib/white-label-products";
import { ensureCountryConfig, listActiveCountriesAndCurrencies } from "@/lib/country-config";
import { ensureWhiteLabelSettings } from "@/lib/white-label-access";

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
      const picked = pickCountryFromCookie(countryCookie, (lists.countries || []) as any[]);
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
        }
        if (profileCurrencyCode) {
          currencyCode = profileCurrencyCode;
        }
      }

      const [settingsRows]: any = await conn.query(
        `SELECT white_label_subscription_countries FROM linescout_settings ORDER BY id DESC LIMIT 1`
      );
      const eligible = new Set(parseEligibleCountries(settingsRows?.[0]?.white_label_subscription_countries));
      const amazonComparisonEnabled = Boolean(countryIso2) && eligible.has(countryIso2) && currencyCode !== "NGN";

      await ensureWhiteLabelProductsReady(conn);

      const [rows]: any = await conn.query(
        `
        SELECT p.*, COALESCE(v.views, 0) AS view_count
        FROM linescout_white_label_products p
        LEFT JOIN (
          SELECT product_id, COUNT(*) AS views
          FROM linescout_white_label_views
          GROUP BY product_id
        ) v ON v.product_id = p.id
        WHERE (p.slug = ? OR REGEXP_REPLACE(LOWER(p.product_name), '[^a-z0-9]+', '-') = ?) AND p.is_active = 1
        LIMIT 1
        `,
        [slug, slug]
      );
      const product = rows?.[0] || null;
      if (!product) {
        return NextResponse.json({ ok: false, error: "Product not found." }, { status: 404 });
      }

      const [similarRows]: any = await conn.query(
        `
        SELECT p.*, COALESCE(v.views, 0) AS view_count
        FROM linescout_white_label_products p
        LEFT JOIN (
          SELECT product_id, COUNT(*) AS views
          FROM linescout_white_label_views
          GROUP BY product_id
        ) v ON v.product_id = p.id
        WHERE p.category = ? AND p.id <> ? AND p.is_active = 1
        ORDER BY view_count DESC, p.sort_order ASC, p.id DESC
        LIMIT 8
        `,
        [product.category, product.id]
      );

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
        LIMIT 6
        `
      );

      const landedNgn = computeLandedRange({
        fob_low_usd: product.fob_low_usd,
        fob_high_usd: product.fob_high_usd,
        cbm_per_1000: product.cbm_per_1000,
      });
      const productWithLanded = { ...product, ...landedNgn };

      const similarItems = (similarRows || []).map((item: any) => ({
        ...item,
        ...computeLandedRange({
          fob_low_usd: item.fob_low_usd,
          fob_high_usd: item.fob_high_usd,
          cbm_per_1000: item.cbm_per_1000,
        }),
      }));

      const trendingItems = (viewRows || []).map((item: any) => ({
        ...item,
        ...computeLandedRange({
          fob_low_usd: item.fob_low_usd,
          fob_high_usd: item.fob_high_usd,
          cbm_per_1000: item.cbm_per_1000,
        }),
      }));

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
