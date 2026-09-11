import crypto from "node:crypto";

export const SUREIMPORTS_ATTRIBUTION_COOKIE = "sure_linescout_attribution";

type CentralAttribution = {
  referralCode: string;
  expiresAt: number;
};

export function parseCentralAffiliateAttribution(
  value: string | undefined,
  now = Date.now(),
): CentralAttribution | null {
  const secret = process.env.LINESCOUT_LEDGER_SECRET?.trim();
  if (!secret || !value) return null;

  const [version, payload, suppliedSignature] = value.split(".");
  if (version !== "v1" || !payload || !suppliedSignature) return null;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`v1.${payload}`)
    .digest();
  let supplied: Buffer;
  try {
    supplied = Buffer.from(suppliedSignature, "base64url");
  } catch {
    return null;
  }
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const referralCode = String(parsed?.code || "").trim().toUpperCase();
    const expiresAt = Number(parsed?.expiresAt);
    if (!/^[A-Z0-9]{4,24}$/.test(referralCode) || !Number.isFinite(expiresAt) || expiresAt <= now) {
      return null;
    }
    return { referralCode, expiresAt };
  } catch {
    return null;
  }
}
