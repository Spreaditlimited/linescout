import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const inbox = readFileSync("app/internal/paid-chat/page.tsx", "utf8");
const thread = readFileSync(
  "app/internal/paid-chat/[conversation_id]/page.tsx",
  "utf8",
);
const css = readFileSync("app/internal/paid-chat/PaidChat.module.css", "utf8");
test("inbox exposes scoped search, assignment filters, and honest loaded counts", () => {
  for (const text of [
    "Search loaded conversations",
    "Conversations loaded",
    "Awaiting assignment",
    "Assigned to me",
    "No matching conversations",
  ])
    assert.ok(inbox.includes(text), text);
  assert.match(inbox, /aria-pressed/);
  assert.doesNotMatch(inbox, /function RowShell/);
});
test("claim and takeover use the existing endpoint and confirmation", () => {
  assert.match(inbox, /\/api\/internal\/paid-chat\/claim/);
  assert.match(inbox, /confirmTakeoverId/);
  assert.match(inbox, /!isAdmin/);
});
test("conversation keeps existing messaging and attachment paths with accessible controls", () => {
  for (const text of [
    "/api/internal/paid-chat/send",
    "/api/internal/paid-chat/assign",
    "/api/internal/paid-chat/unclaim",
    "attachmentsByMessageId",
    "Message to customer",
    "Dialog.Title",
    "bootLoading",
  ])
    assert.ok(thread.includes(text), text);
});
test("paid chat styling uses shared theme tokens and responsive layouts", () => {
  for (const token of [
    "--ls-theme-surface",
    "--ls-theme-ink",
    "--ls-theme-primary",
    "--ls-theme-soft",
  ])
    assert.ok(css.includes(token));
  assert.match(css, /@media\s*\(max-width:\s*640px\)/);
});
