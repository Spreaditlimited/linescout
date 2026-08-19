import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("the agent workspace and agreement routes are excluded from crawling", async () => {
  const [layout, agreement, robots, proxy] = await Promise.all([
    source("app/agent-app/layout.tsx"),
    source("app/agents/page.tsx"),
    source("app/robots.ts"),
    source("proxy.ts"),
  ]);

  assert.match(layout, /index: false/);
  assert.match(layout, /follow: false/);
  assert.match(layout, /noarchive: true/);
  assert.match(agreement, /index: false/);
  assert.match(agreement, /follow: false/);
  assert.match(agreement, /noarchive: true/);
  assert.match(robots, /"\/agent-app"/);
  assert.match(robots, /"\/agents"/);
  assert.match(proxy, /"\/agent-app\/:path\*"/);
  assert.match(proxy, /"\/agents"/);
  assert.match(proxy, /X-Robots-Tag/);
  assert.match(proxy, /noindex, nofollow, noarchive, nosnippet, noimageindex/);
});

test("agent landing page reflects the working web workspace without mobile app promotion", async () => {
  const [landing, footer, notifications] = await Promise.all([
    source("app/agent-app/page.tsx"),
    source("components/AgentFooter.tsx"),
    source("app/agent-app/(app)/notifications/page.tsx"),
  ]);
  const combined = `${landing}\n${footer}\n${notifications}`;

  for (const capability of [
    "Paid chat inbox",
    "Project ownership",
    "Quote builder",
    "Reorder management",
    "Earnings and payouts",
    "Agent verification",
    "Agent support",
  ]) {
    assert.match(landing, new RegExp(capability, "i"));
  }
  assert.doesNotMatch(combined, /mobile app|download on ios|get it on android/i);
});
