import type { RowDataPacket } from "mysql2/promise";
import { queryOne } from "@/lib/db";
import { sha256 } from "@/lib/affiliates";

function readCookie(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return "";
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const [k, v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v || "");
  }
  return "";
}

export function getAffiliateTokenFromRequest(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (bearer) return bearer;

  const cookie = req.headers.get("cookie");
  const fromCookie = readCookie(cookie, "linescout_affiliate_session");
  return fromCookie || "";
}

export async function requireAffiliate(req: Request) {
  const token = getAffiliateTokenFromRequest(req);
  if (!token) throw new Error("Unauthorized");

  const tokenHash = sha256(token);

  const affiliate = await queryOne<RowDataPacket & {
    id: number;
    email: string;
    name: string | null;
    status: string;
    referral_code: string;
    country_id: number | null;
    payout_currency: string | null;
  }>(
    `
    SELECT a.id, a.email, a.name, a.status, a.referral_code, a.country_id, a.payout_currency
    FROM linescout_affiliate_sessions s
    JOIN linescout_affiliates a ON a.id = s.affiliate_id
    WHERE s.session_token_hash = ?
      AND s.expires_at > NOW()
    LIMIT 1
    `,
    [tokenHash]
  );

  if (!affiliate) throw new Error("Unauthorized");
  if (String(affiliate.status || "") !== "active") throw new Error("Unauthorized");

  return {
    id: Number(affiliate.id),
    email: String(affiliate.email || ""),
    name: affiliate.name ? String(affiliate.name) : null,
    referral_code: String(affiliate.referral_code || ""),
    country_id: affiliate.country_id ? Number(affiliate.country_id) : null,
    payout_currency: affiliate.payout_currency ? String(affiliate.payout_currency) : null,
  };
}

