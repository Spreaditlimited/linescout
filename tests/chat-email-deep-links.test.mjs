import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("unread-message emails deep-link customers and agents to the correct chat", async () => {
  const [agentPaid, agentQuick, customerPaid, customerQuick] = await Promise.all([
    source("app/api/mobile/paid-chat/send/route.ts"),
    source("app/api/mobile/messages/route.ts"),
    source("app/api/internal/paid-chat/send/route.ts"),
    source("app/api/agent/quick-human/send/route.ts"),
  ]);

  assert.match(agentPaid, /agent-app\/inbox\/\$\{conversationId\}/);
  assert.match(agentQuick, /agent-app\/inbox\/\$\{conversationId\}\?kind=quick/);
  assert.match(customerPaid, /conversations\/\$\{conversationId\}/);
  assert.match(customerQuick, /quick-chat\?route_type=\$\{encodeURIComponent\(routeType\)\}&conversation_id=\$\{conversationId\}/);
});

test("agent authentication preserves and validates the complete chat destination", async () => {
  const [gate, signIn, emailVerify, phoneVerify] = await Promise.all([
    source("app/agent-app/(app)/_components/AgentAppGate.tsx"),
    source("app/agent-app/sign-in/AgentAppSignInClient.tsx"),
    source("app/agent-app/email-verify/AgentAppEmailVerifyClient.tsx"),
    source("app/agent-app/phone-verify/AgentAppPhoneVerifyClient.tsx"),
  ]);

  assert.match(gate, /window\.location\.pathname/);
  assert.match(gate, /window\.location\.search/);
  assert.match(gate, /&next=\$\{nextParam\}/);
  for (const authSource of [signIn, emailVerify, phoneVerify]) {
    assert.match(authSource, /getSafeNextPath/);
    assert.match(authSource, /safeNext \|\| "\/agent-app\/inbox"/);
  }
});

test("customer paid-chat authorization redirects preserve the conversation", async () => {
  const conversation = await source("app/(app)/conversations/[id]/page.tsx");

  assert.doesNotMatch(conversation, /router\.replace\("\/sign-in"\)/);
  assert.match(
    conversation,
    /\/sign-in\?next=\$\{encodeURIComponent\(`\/conversations\/\$\{conversationId\}`\)\}/,
  );
});

test("the customer Projects navigation and authorization redirect target the project list", async () => {
  const [shell, projects] = await Promise.all([
    source("components/app/AppShell.tsx"),
    source("app/(app)/projects/page.tsx"),
  ]);

  assert.match(shell, /href: "\/projects", label: "Projects"/);
  assert.doesNotMatch(projects, /router\.replace\("\/sign-in"\)/);
  assert.match(projects, /\/sign-in\?next=\$\{encodeURIComponent\("\/projects"\)\}/);
});

test("customer authorization provisions a missing personal account context", async () => {
  const [auth, accounts] = await Promise.all([
    source("lib/auth.ts"),
    source("lib/accounts.ts"),
  ]);

  assert.match(auth, /ensureAccountContextForUser\(Number\(user\.id\)\)/);
  assert.match(auth, /s\.revoked_at IS NULL/);
  assert.match(auth, /s\.expires_at > NOW\(\)/);
  assert.match(accounts, /export async function ensureAccountContextForUser/);
  assert.match(accounts, /INSERT INTO linescout_accounts/);
  assert.match(accounts, /INSERT INTO linescout_account_members/);
  assert.match(accounts, /INSERT INTO linescout_account_user_contexts/);
  assert.match(accounts, /beginTransaction\(\)/);
  assert.match(accounts, /await conn\.commit\(\)/);
});
