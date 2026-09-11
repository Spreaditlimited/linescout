import crypto from "node:crypto";
import mysql from "mysql2/promise";

const centralUrl = process.env.AFFILIATE_DATABASE_URL?.trim();
const encodedKey = process.env.AFFILIATE_SECURITY_KEY?.trim();
if (!centralUrl || !encodedKey) throw new Error("AFFILIATE_DATABASE_URL and AFFILIATE_SECURITY_KEY are required.");
const masterKey = Buffer.from(encodedKey, "base64");
if (masterKey.length !== 32) throw new Error("AFFILIATE_SECURITY_KEY must be a 32-byte base64 value.");

const keyFor = (purpose) => Buffer.from(crypto.hkdfSync("sha256", masterKey, Buffer.alloc(0), purpose, 32));
const token = (bytes = 18) => crypto.randomBytes(bytes).toString("base64url");
const encrypt = (value) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyFor("affiliate-pii-v1"), iv);
  const ciphertext = Buffer.concat([cipher.update(String(value || ""), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
};
const fingerprint = (value, purpose) => crypto.createHmac("sha256", keyFor(purpose)).update(value).digest("hex");

const legacy = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
const central = await mysql.createConnection(centralUrl);
let created = 0;
let merged = 0;
let aliases = 0;
let referrals = 0;
try {
  const [affiliates] = await legacy.query(`SELECT a.id, a.email, a.name, a.referral_code, a.created_at, COALESCE(c.name, 'Nigeria') AS country FROM linescout_affiliates a LEFT JOIN linescout_countries c ON c.id = a.country_id ORDER BY a.id`);
  for (const affiliate of affiliates) {
    const email = String(affiliate.email || "").trim().toLowerCase();
    const emailHash = fingerprint(email, "affiliate-email-v1");
    await central.beginTransaction();
    try {
      const [matches] = await central.query(`SELECT id FROM affiliate_accounts WHERE emailHash = ? LIMIT 1`, [emailHash]);
      let affiliateId = Number(matches?.[0]?.id || 0);
      if (!affiliateId) {
        const parts = String(affiliate.name || "LineScout Affiliate").trim().split(/\s+/);
        const firstName = parts.shift() || "LineScout";
        const lastName = parts.join(" ") || "Affiliate";
        let referralCode = String(affiliate.referral_code || token(8)).toUpperCase();
        const [codeMatches] = await central.query(`SELECT id FROM affiliate_accounts WHERE referralCode = ? LIMIT 1`, [referralCode]);
        if (codeMatches.length) referralCode = token(9).replace(/[-_]/g, "").slice(0, 10).toUpperCase();
        const [result] = await central.query(
          `INSERT INTO affiliate_accounts
            (pidAffiliate, emailHash, emailCiphertext, firstNameCiphertext, lastNameCiphertext, phoneCiphertext, country, passwordHash, referralCode, status, emailVerifiedAt, termsAcceptedAt, consentVersion, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, 'LINESCOUT_MIGRATION_2026_09', ?, ?)`,
          [`aff_${token()}`, emailHash, encrypt(email), encrypt(firstName), encrypt(lastName), encrypt(""), String(affiliate.country || "Nigeria"), "migration-reset-required", referralCode, affiliate.created_at, affiliate.created_at, affiliate.created_at, new Date()],
        );
        affiliateId = Number(result.insertId);
        created += 1;
      } else {
        merged += 1;
      }
      await central.query(`INSERT IGNORE INTO affiliate_external_identities (pidIdentity, affiliateId, sourceSystem, externalAffiliateId, createdAt) VALUES (?, ?, 'LINESCOUT', ?, NOW(3))`, [`afext_${token()}`, affiliateId, String(affiliate.id)]);
      const [aliasResult] = await central.query(`INSERT IGNORE INTO affiliate_referral_code_aliases (pidAlias, affiliateId, sourceSystem, aliasCode, active, createdAt) VALUES (?, ?, 'LINESCOUT', ?, true, NOW(3))`, [`afalias_${token()}`, affiliateId, String(affiliate.referral_code || "").toUpperCase()]);
      aliases += Number(aliasResult.affectedRows || 0);
      await central.commit();
    } catch (error) {
      await central.rollback();
      throw error;
    }
  }

  const [legacyReferrals] = await legacy.query(`SELECT affiliate_id, referred_user_id, source, created_at FROM linescout_affiliate_referrals ORDER BY id`);
  for (const referral of legacyReferrals) {
    const [owners] = await central.query(`SELECT affiliateId FROM affiliate_external_identities WHERE sourceSystem = 'LINESCOUT' AND externalAffiliateId = ? LIMIT 1`, [String(referral.affiliate_id)]);
    const affiliateId = Number(owners?.[0]?.affiliateId || 0);
    if (!affiliateId) throw new Error(`Missing central identity for legacy affiliate ${referral.affiliate_id}.`);
    const customerReference = `linescout:user:${referral.referred_user_id}`;
    const [result] = await central.query(
      `INSERT IGNORE INTO affiliate_referrals
        (pidReferral, affiliateId, visitorHash, landingPath, source, customerReference, firstTouchAt, lastTouchAt, claimedAt)
       VALUES (?, ?, ?, '/linescout', ?, ?, ?, ?, ?)`,
      [`aref_${token()}`, affiliateId, crypto.createHash("sha256").update(customerReference).digest("hex"), referral.source || "LINESCOUT_MIGRATION", customerReference, referral.created_at, referral.created_at, referral.created_at],
    );
    referrals += Number(result.affectedRows || 0);
  }
  console.log(JSON.stringify({ created, merged, aliases, referrals }));
} finally {
  await legacy.end();
  await central.end();
}
