import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { computeQuoteDisplayPayment } from "../lib/quote-display-payment.ts";
import { computeGrossFromBaseWithPaypalFee } from "../lib/paypal-quote-fees.ts";

test("PayPal uses the same GBP product payable shown on the customer quote", () => {
  const payment = computeQuoteDisplayPayment({
    purpose: "full_product_payment",
    displayCurrency: "GBP",
    productTotalNgn: 2_892_960,
    totalProductRmbWithAgent: 12_720,
    totalShippingUsd: 450,
    totalMarkupNgn: 184_800,
    totalVatNgn: 36_960,
    addonTotalDisplay: 0,
    depositPercent: 0,
    commitmentAmount: 20,
    commitmentCurrency: "GBP",
    commitmentAmountNgn: 20_000,
    depositPaidDisplay: 0,
    productPaidDisplay: 0,
    shippingPaidDisplay: 0,
    ngnToDisplay: 0.001,
    rmbToDisplay: 0.12,
    usdToDisplay: 0.8,
  });

  assert.equal(payment.productRemainingDisplay, 1_728.16);
  assert.equal(payment.shippingRemainingDisplay, 360);

  const fee = computeGrossFromBaseWithPaypalFee({
    baseAmount: payment.remainingDisplay,
    percent: 4.89,
    fixed: 0.3,
  });
  assert.deepEqual(fee, { base: 1_728.16, fee: 89.17, gross: 1_817.33 });
});

test("NGN, deposit, partial-payment, shipping, and add-on paths reconcile", () => {
  const base = {
    displayCurrency: "GBP",
    productTotalNgn: 2_892_960,
    totalProductRmbWithAgent: 12_720,
    totalShippingUsd: 450,
    totalMarkupNgn: 184_800,
    totalVatNgn: 36_960,
    addonTotalDisplay: 0,
    depositPercent: 40,
    commitmentAmount: 20,
    commitmentCurrency: "GBP",
    commitmentAmountNgn: 20_000,
    depositPaidDisplay: 0,
    productPaidDisplay: 0,
    shippingPaidDisplay: 0,
    ngnToDisplay: 0.001,
    rmbToDisplay: 0.12,
    usdToDisplay: 0.8,
  };

  assert.equal(computeQuoteDisplayPayment({ ...base, purpose: "deposit" }).remainingDisplay, 1_157.18);
  assert.equal(computeQuoteDisplayPayment({ ...base, purpose: "shipping_payment" }).remainingDisplay, 360);
  assert.equal(
    computeQuoteDisplayPayment({ ...base, purpose: "full_product_payment", productPaidDisplay: 500 })
      .remainingDisplay,
    1_228.16
  );
  assert.equal(
    computeQuoteDisplayPayment({ ...base, purpose: "full_product_payment", addonTotalDisplay: 100 })
      .remainingDisplay,
    1_828.16
  );

  const ngn = computeQuoteDisplayPayment({
    ...base,
    purpose: "full_product_payment",
    displayCurrency: "NGN",
    commitmentAmount: 20_000,
    commitmentCurrency: "NGN",
    ngnToDisplay: 1,
    rmbToDisplay: 210,
    usdToDisplay: 1_500,
  });
  assert.equal(ngn.productRemainingDisplay, 2_872_960);
  assert.equal(ngn.shippingRemainingDisplay, 675_000);
});

test("the PayPal route no longer converts the NGN remainder as one GBP amount", async () => {
  const [route, handoffPayments, internalQuotes] = await Promise.all([
    readFile(new URL("../app/api/quote/[token]/pay/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/linescout-handoffs/payments/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/internal/quotes/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(route, /computeQuoteDisplayPayment\(\{/);
  assert.doesNotMatch(route, /convertAmount\(conn, remaining, "NGN", paypalCurrency\)/);
  assert.match(route, /base_amount_ngn: remaining/);
  assert.match(route, /recordedBaseAmountNgn > 0/);
  assert.ok(
    route.match(/computeQuoteDisplayPayment\(\{/g)?.length >= 2,
    "PayPal and direct-bank checkout must share the customer display calculation"
  );
  assert.match(handoffPayments, /total_addons_ngn/);
  assert.match(handoffPayments, /total_vat_ngn/);
  assert.match(handoffPayments, /baseAmountNgn > 0/);
  assert.match(internalQuotes, /\$\.base_amount_ngn/);
});
