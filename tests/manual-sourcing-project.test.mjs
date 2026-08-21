import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("manual sourcing creation is admin-only at the route handler", async () => {
  const route = await source("app/api/linescout-handoffs/manual/route.ts");

  assert.match(route, /async function requireAdmin\(\)/);
  assert.match(route, /const auth = await requireAdmin\(\)/);
  assert.match(route, /role \|\| ""\) !== "admin"/);
  assert.ok(
    route.indexOf("const auth = await requireAdmin()") < route.indexOf("await req.json()"),
    "authorization must happen before request processing",
  );
});

test("manual sourcing supports verified gateways and admin-recorded external payments", async () => {
  const [route, settings] = await Promise.all([
    source("app/api/linescout-handoffs/manual/route.ts"),
    source("app/internal/settings/page.tsx"),
  ]);

  for (const method of ["paystack", "paypal", "bank_transfer", "cash", "other"]) {
    assert.match(route, new RegExp(`"${method}"`));
    assert.match(settings, new RegExp(`value: "${method}"`));
  }

  assert.match(route, /paystackVerifyTransaction\(paymentRef\)/);
  assert.match(route, /paypalGetOrder\(paymentRef\)/);
  assert.match(route, /payment_amount must be greater than 0 for external payments/);
  assert.match(route, /created_by_admin_user_id: auth\.userId/);
  assert.match(settings, /Amount received/);
  assert.match(settings, /generateManualPaymentReference/);
  assert.match(settings, /crypto\.getRandomValues/);
  assert.match(settings, /Generate reference/);
  assert.match(settings, /Start sourcing project/);
});

test("payment references are single-use and project types match the selected route", async () => {
  const route = await source("app/api/linescout-handoffs/manual/route.ts");

  assert.match(route, /WHERE paystack_ref = \?/);
  assert.match(route, /\$\.paypal\.order_id/);
  assert.match(route, /\$\.manual\.reference/);
  assert.match(route, /This payment reference has already been used/);
  assert.match(route, /routeType === "white_label" \? "white_label" : "sourcing"/);
  assert.match(route, /const status = "pending"/);
  assert.doesNotMatch(route, /body\.status/);
});
