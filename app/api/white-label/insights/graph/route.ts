import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureWhiteLabelSettings, ensureWhiteLabelUserColumns } from "@/lib/white-label-access";
import { ensureWhiteLabelProductsReady } from "@/lib/white-label-products";
import { findActiveWhiteLabelExemption } from "@/lib/white-label-exemptions";
import { resolveAmazonMarketplace } from "@/lib/white-label-marketplace";
import { fetchKeepaGraphImage, searchKeepaAsin } from "@/lib/keepa";
import { getFreshKeepaGraph, saveKeepaGraph } from "@/lib/keepa-graphs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function parseEligibleCountries(raw?: string | null) {
  const source = String(raw || "GB,CA");
  return source
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean)
    .map((c) => (c === "UK" ? "GB" : c));
}

function buildSearchTerms(name: string, category: string) {
  const trimmedName = String(name || "").trim();
  const trimmedCategory = String(category || "").trim();
  const terms = new Set<string>();
  if (trimmedName && trimmedCategory) terms.add(`${trimmedName} ${trimmedCategory}`);
  if (trimmedName) terms.add(trimmedName);
  if (trimmedCategory && trimmedName) {
    const cleanedCategory = trimmedCategory.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
    if (cleanedCategory) terms.add(`${trimmedName} ${cleanedCategory}`);
  }
  return Array.from(terms);
}

function hashParams(params: Record<string, string | number | undefined>) {
  const entries = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${String(v)}`)
    .sort();
  return crypto.createHash("sha1").update(entries.join("&")).digest("hex");
}

function graphParamsForType(type: string) {
  switch (type) {
    case "salesrank":
      return { salesrank: 1, range: 365, width: 800, height: 260, yzoom: 1 };
    case "buybox":
      return { bb: 1, range: 90, width: 800, height: 260, yzoom: 1 };
    case "fba":
      return { fba: 1, range: 90, width: 800, height: 260, yzoom: 1 };
    case "fbm":
      return { fbm: 1, range: 90, width: 800, height: 260, yzoom: 1 };
    case "price":
    default:
      return { amazon: 1, new: 1, range: 90, width: 800, height: 260, yzoom: 1 };
  }
}

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const url = new URL(req.url);
    const productId = Number(url.searchParams.get("product_id") || 0);
    const type = String(url.searchParams.get("type") || "price").toLowerCase();
    if (!productId || !Number.isFinite(productId)) {
      return NextResponse.json({ ok: false, error: "Missing product_id" }, { status: 400 });
    }

    const conn = await db.getConnection();
    try {
      await ensureWhiteLabelSettings(conn);
      await ensureWhiteLabelUserColumns(conn);
      await ensureWhiteLabelProductsReady(conn);

      const [[settings]]: any = await conn.query(
        `SELECT white_label_subscription_countries, white_label_trial_days
         FROM linescout_settings ORDER BY id DESC LIMIT 1`
      );
      const eligible = new Set(parseEligibleCountries(settings?.white_label_subscription_countries));
      const trialDays = Number(settings?.white_label_trial_days || 0);

      const [[userRow]]: any = await conn.query(
        `
        SELECT u.white_label_plan, u.white_label_subscription_status,
               u.white_label_trial_ends_at,
               u.email,
               u.white_label_next_billing_at,
               c.iso2 AS country_iso2,
               c.amazon_marketplace AS country_marketplace,
               cur.code AS currency_code
        FROM users u
        LEFT JOIN linescout_countries c ON c.id = u.country_id
        LEFT JOIN linescout_currencies cur ON cur.id = c.default_currency_id
        WHERE u.id = ?
        LIMIT 1
        `,
        [user.id]
      );

      const plan = String(userRow?.white_label_plan || "").toLowerCase();
      const status = String(userRow?.white_label_subscription_status || "").toLowerCase();
      const countryIso2 = String(userRow?.country_iso2 || "").toUpperCase();
      const currencyCode = String(userRow?.currency_code || "").toUpperCase();
      const host = String(req.headers.get("x-forwarded-host") || req.headers.get("host") || "");
      const isLocalHost =
        /(^|:)(localhost|127\\.0\\.0\\.1)$/i.test(host) ||
        host.startsWith("localhost:") ||
        host.startsWith("127.0.0.1:");
      const allowLocal = process.env.NODE_ENV !== "production" || isLocalHost;
      const email = String(userRow?.email || "").trim();
      const exemptActive = email ? Boolean(await findActiveWhiteLabelExemption(conn, email)) : false;

      if (!allowLocal && !eligible.has(countryIso2)) {
        return NextResponse.json(
          { ok: false, code: "subscription_unavailable", error: "Insights are not available in your country." },
          { status: 403 }
        );
      }

      if (!allowLocal) {
        const nextBilling = userRow?.white_label_next_billing_at
          ? new Date(userRow.white_label_next_billing_at)
          : null;
        const paidThrough = nextBilling ? new Date() <= nextBilling : false;
        const subscriptionActive =
          (plan === "paid" && status === "active") ||
          (plan === "paid" && status === "cancelled" && paidThrough) ||
          exemptActive;
        const now = new Date();
        let trialEnds = userRow?.white_label_trial_ends_at ? new Date(userRow.white_label_trial_ends_at) : null;
        if (!trialEnds && trialDays > 0) {
          const next = new Date();
          next.setDate(next.getDate() + trialDays);
          trialEnds = next;
          await conn.query(
            `UPDATE users SET white_label_trial_ends_at = ? WHERE id = ? LIMIT 1`,
            [trialEnds, user.id]
          );
        }
        const trialActive = trialEnds ? now <= trialEnds : false;
        if (!subscriptionActive && !trialActive) {
          return NextResponse.json(
            { ok: false, code: "subscription_required", error: "Paid subscription required." },
            { status: 402 }
          );
        }
      }

      const [[product]]: any = await conn.query(
        `
        SELECT id,
               product_name, category,
               amazon_uk_asin, amazon_ca_asin, amazon_us_asin
        FROM linescout_white_label_products
        WHERE id = ?
        LIMIT 1
        `,
        [productId]
      );
      if (!product?.id) {
        return NextResponse.json({ ok: false, error: "Product not found." }, { status: 404 });
      }

      const preferredMarket = resolveAmazonMarketplace({
        marketplace: userRow?.country_marketplace,
        countryIso2,
        currencyCode,
      });
      const market = preferredMarket;
      const asinKey =
        market === "US" ? "amazon_us_asin" : market === "CA" ? "amazon_ca_asin" : "amazon_uk_asin";
      let asin = product[asinKey] || null;

      if (!asin) {
        const terms = buildSearchTerms(product.product_name, product.category);
        for (const term of terms) {
          asin = await searchKeepaAsin(term, market);
          if (asin) break;
        }
        if (asin) {
          await conn.query(
            `UPDATE linescout_white_label_products SET ${asinKey} = ? WHERE id = ? LIMIT 1`,
            [asin, productId]
          );
        }
      }

      if (!asin) {
        return NextResponse.json(
          { ok: false, error: "No matching ASIN found for this marketplace." },
          { status: 404 }
        );
      }

      const params = graphParamsForType(type);
      const paramsHash = hashParams(params);
      const cached = await getFreshKeepaGraph(conn, productId, market, paramsHash, CACHE_TTL_MS);
      if (cached?.image) {
        return new NextResponse(cached.image, {
          status: 200,
          headers: {
            "Content-Type": cached.content_type || "image/png",
            "Cache-Control": "private, max-age=0, must-revalidate",
          },
        });
      }

      const img = await fetchKeepaGraphImage(asin, market, params);
      if (!img) {
        return NextResponse.json({ ok: false, error: "Market graph request failed." }, { status: 502 });
      }
      await saveKeepaGraph(conn, productId, market, asin, paramsHash, img.contentType, img.buf);

      return new NextResponse(img.buf, {
        status: 200,
        headers: {
          "Content-Type": img.contentType || "image/png",
          "Cache-Control": "private, max-age=0, must-revalidate",
        },
      });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Market data error" }, { status: 500 });
  }
}
