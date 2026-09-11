import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import {
  parseCentralAffiliateAttribution,
  SUREIMPORTS_ATTRIBUTION_COOKIE,
} from "../lib/central-affiliate-attribution.ts";

const secret = "test-linescout-ledger-secret-with-enough-entropy";

function signedCookie(code, expiresAt) {
  const payload = Buffer.from(JSON.stringify({ code, expiresAt })).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`v1.${payload}`)
    .digest("base64url");
  return `v1.${payload}.${signature}`;
}

test.before(() => {
  process.env.LINESCOUT_LEDGER_SECRET = secret;
});

test("accepts a signed lowercase Sure Imports affiliate code", () => {
  const now = 1_800_000_000_000;
  assert.equal(SUREIMPORTS_ATTRIBUTION_COOKIE, "sure_linescout_attribution");
  assert.deepEqual(
    parseCentralAffiliateAttribution(signedCookie("freshcode1", now + 60_000), now),
    { referralCode: "FRESHCODE1", expiresAt: now + 60_000 },
  );
});

test("rejects tampered, expired, and unsigned attribution", () => {
  const now = 1_800_000_000_000;
  const valid = signedCookie("freshcode1", now + 60_000);
  assert.equal(parseCentralAffiliateAttribution(`${valid}x`, now), null);
  assert.equal(parseCentralAffiliateAttribution(signedCookie("freshcode1", now - 1), now), null);
  assert.equal(parseCentralAffiliateAttribution("freshcode1", now), null);
});
