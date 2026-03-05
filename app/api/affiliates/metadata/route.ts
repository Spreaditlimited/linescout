import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureCountryConfig } from "@/lib/country-config";
import { ensureAffiliateSettingsColumns } from "@/lib/affiliates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const conn = await db.getConnection();
  try {
    await ensureCountryConfig(conn);
    await ensureAffiliateSettingsColumns(conn);
    const [countries]: any = await conn.query(
      `
      SELECT c.id, c.name, c.iso2, cur.code AS currency_code
      FROM linescout_countries c
      LEFT JOIN linescout_currencies cur ON cur.id = c.default_currency_id
      ORDER BY c.name ASC
      `
    );
    const [settingsRows]: any = await conn.query(
      `SELECT affiliate_min_payouts_json, affiliate_promo_videos_json
       FROM linescout_settings
       ORDER BY id DESC
       LIMIT 1`
    );
    let minPayouts: Record<string, number> | null = null;
    const raw = settingsRows?.[0]?.affiliate_min_payouts_json;
    if (raw) {
      try {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (parsed && typeof parsed === "object") {
          minPayouts = {};
          Object.entries(parsed).forEach(([code, value]) => {
            const currency = String(code || "").trim().toUpperCase();
            const amount = Number(value);
            if (!currency || !Number.isFinite(amount)) return;
            minPayouts![currency] = amount;
          });
        }
      } catch {}
    }

    let promoVideos: { title: string; url: string | null }[] = [];
    const promoRaw = settingsRows?.[0]?.affiliate_promo_videos_json;
    if (promoRaw) {
      try {
        const parsed = typeof promoRaw === "string" ? JSON.parse(promoRaw) : promoRaw;
        if (Array.isArray(parsed)) {
          promoVideos = parsed
            .map((entry) => ({
              title: String(entry?.title || "").trim(),
              url: entry?.url ? String(entry.url).trim() : null,
            }))
            .filter((entry) => entry.title);
        }
      } catch {}
    }

    return NextResponse.json({
      ok: true,
      countries: countries || [],
      affiliate_min_payouts: minPayouts || {},
      affiliate_promo_videos: promoVideos,
    });
  } catch (e: any) {
    const msg = String(e?.message || "Failed to load metadata");
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  } finally {
    conn.release();
  }
}
