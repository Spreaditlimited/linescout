import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("both webinar video pages are protected centrally and excluded from indexing", async () => {
  const [proxy, whiteLabelPage, machinePage] = await Promise.all([
    source("proxy.ts"),
    source("app/(marketing)/white-label-webinar/page.tsx"),
    source("app/(marketing)/machine-sourcing-webinar-video/page.tsx"),
  ]);

  assert.match(proxy, /"\/white-label-webinar"/);
  assert.match(proxy, /"\/machine-sourcing-webinar-video"/);
  assert.match(proxy, /verifyWebinarAccessToken/);
  assert.match(proxy, /httpOnly: true/);
  assert.match(proxy, /registrationUrl\.pathname = registrationPath/);
  assert.match(whiteLabelPage, /robots: \{ index: false/);
  assert.match(machinePage, /robots: \{ index: false/);
  assert.doesNotMatch(whiteLabelPage, /Join WhatsApp channel/);
  assert.doesNotMatch(machinePage, /Join WhatsApp channel/);
  assert.doesNotMatch(whiteLabelPage, /whatsapp\.com\/channel/);
  assert.doesNotMatch(machinePage, /whatsapp\.com\/channel/);
});

test("public webinar lead pages are canonical, substantial and discoverable", async () => {
  const [whiteLabelLeadPage, machineLeadPage, landing, sitemap] = await Promise.all([
    source("app/(marketing)/white-label-leads/page.tsx"),
    source("app/(marketing)/machine-sourcing-webinar/page.tsx"),
    source("components/marketing/WebinarLeadLanding.tsx"),
    source("app/sitemap.ts"),
  ]);

  assert.match(whiteLabelLeadPage, /alternates: \{ canonical: PAGE_URL \}/);
  assert.match(machineLeadPage, /alternates: \{ canonical: PAGE_URL \}/);
  assert.match(whiteLabelLeadPage, /White Label Products from China/);
  assert.match(machineLeadPage, /How to Source Machines from China/);
  assert.match(whiteLabelLeadPage, /contextParagraphs=\{\[/);
  assert.match(machineLeadPage, /contextParagraphs=\{\[/);
  assert.match(landing, /<details key=\{faq\.question\}/);
  assert.match(landing, /Related sourcing resources/);
  assert.match(sitemap, /\$\{BASE_URL\}\/white-label-leads/);
  assert.match(sitemap, /\$\{BASE_URL\}\/machine-sourcing-webinar/);
  assert.doesNotMatch(sitemap, /\$\{BASE_URL\}\/white-label-webinar`/);
  assert.doesNotMatch(sitemap, /\$\{BASE_URL\}\/machine-sourcing-webinar-video/);
});

test("registration sends signed access by Hostinger email without exposing it in the response", async () => {
  const [whiteLabelRoute, machineRoute, email] = await Promise.all([
    source("app/api/white-label-webinar/lead/route.ts"),
    source("app/api/machine-sourcing-webinar/lead/route.ts"),
    source("lib/webinar-email.ts"),
  ]);

  for (const route of [whiteLabelRoute, machineRoute]) {
    assert.match(route, /createWebinarAccessToken/);
    assert.match(route, /sendWebinarAccessEmail/);
    assert.match(
      route,
      /NextResponse\.json\(\{ ok: true, email_sent: true, already_registered: !isNewLead \}\)/,
    );
  }
  assert.match(email, /SMTP_HOST/);
  assert.match(email, /SMTP_USER/);
  assert.match(email, /SMTP_PASS/);
  assert.match(email, /pool: true/);
});

test("home and default sign-in flow lead to the three-route project selector", async () => {
  const [home, heroCta, navbar, otpForm, selector] = await Promise.all([
    source("app/(marketing)/page.tsx"),
    source("components/marketing/HomeHeroCta.tsx"),
    source("components/home/NavBar.tsx"),
    source("components/auth/EmailOtpForm.tsx"),
    source("app/(app)/projects/new/page.tsx"),
  ]);

  assert.match(home, /href="\/sign-in\?next=\/projects\/new"/);
  assert.match(home, /redirect\("\/projects\/new"\)/);
  assert.match(heroCta, /href="\/sign-in\?next=\/projects\/new"/);
  assert.match(navbar, /const signInHref = '\/sign-in\?next=\/projects\/new'/);
  assert.match(otpForm, /router\.replace\("\/projects\/new"\)/);
  assert.match(selector, /Machine sourcing/);
  assert.match(selector, /Simple sourcing/);
  assert.match(selector, /White label/);
});
