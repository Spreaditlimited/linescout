import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  isLineScoutPaystackEvent,
  shouldForwardPaystackEventToSureImports,
} from "../lib/paystack-webhook-routing.ts";

test("LineScout Paystack references never get forwarded back to Sure Imports", () => {
  for (const reference of ["LS_363_1789212894454_YKXI0Q", "LSQ_82_123", "LSSQ_91_456"]) {
    const payload = { data: { reference } };
    assert.equal(isLineScoutPaystackEvent(payload), true);
    assert.equal(shouldForwardPaystackEventToSureImports("charge.success", payload), false);
  }
});

test("LineScout source metadata also prevents forwarding loops", () => {
  const payload = { data: { reference: "provider-reference", metadata: { source: "LineScout" } } };
  assert.equal(isLineScoutPaystackEvent(payload), true);
  assert.equal(shouldForwardPaystackEventToSureImports("charge.success", payload), false);
});

test("shared non-LineScout events continue to reach Sure Imports", () => {
  const payload = { data: { reference: "SI_123" } };
  assert.equal(shouldForwardPaystackEventToSureImports("charge.success", payload), true);
  assert.equal(shouldForwardPaystackEventToSureImports("subscription.create", payload), true);
  assert.equal(shouldForwardPaystackEventToSureImports("unrelated.event", payload), false);
});

test("project verification failures are returned for retry instead of swallowed", async () => {
  const route = await readFile(
    new URL("../app/api/webhooks/paystack/route.ts", import.meta.url),
    "utf8",
  );
  const triggerStart = route.indexOf("async function triggerSourcingVerify");
  const triggerEnd = route.indexOf("async function forwardSureImportsPaystackWebhook");
  const triggerSource = route.slice(triggerStart, triggerEnd);

  assert.doesNotMatch(triggerSource, /\.catch\(\(\) => \{\}\)/);
  assert.match(route, /Paystack project-start verification failed/);
  assert.match(route, /\{ status: 503 \}/);
});
