import assert from "node:assert/strict";
import test from "node:test";

process.env.WEBINAR_ACCESS_SECRET = "test-only-webinar-secret";
const { createWebinarAccessToken, verifyWebinarAccessToken } = await import(
  "../lib/webinar-access.ts"
);

test("webinar access tokens are scoped, tamper-resistant and expire", () => {
  const issuedAt = new Date("2026-08-19T10:00:00.000Z");
  const token = createWebinarAccessToken("white-label", 42, issuedAt);

  assert.equal(verifyWebinarAccessToken(token, "white-label", issuedAt)?.leadId, 42);
  assert.equal(verifyWebinarAccessToken(token, "machine-sourcing", issuedAt), null);
  assert.equal(verifyWebinarAccessToken(`${token}x`, "white-label", issuedAt), null);
  assert.equal(
    verifyWebinarAccessToken(token, "white-label", new Date("2026-09-19T10:00:01.000Z")),
    null,
  );
});

