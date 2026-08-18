import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const proxySource = await readFile(
  new URL('../app/api/sureimports-newsletter/route.ts', import.meta.url),
  'utf8',
);
const footerSource = await readFile(
  new URL('../components/home/FooterNewsletterForm.tsx', import.meta.url),
  'utf8',
);
const popupSource = await readFile(
  new URL('../components/marketing/LeadCapturePopup.tsx', import.meta.url),
  'utf8',
);
const shellSource = await readFile(
  new URL('../components/Shell.tsx', import.meta.url),
  'utf8',
);

test('LineScout footer and popup share the protected Sure Imports proxy', () => {
  assert.match(footerSource, /fetch\('\/api\/sureimports-newsletter'/);
  assert.match(popupSource, /fetch\('\/api\/sureimports-newsletter'/);
  assert.match(proxySource, /https:\/\/www\.sureimports\.com\/api\/subscribe/);
  assert.match(proxySource, /linescout_footer_newsletter/);
  assert.match(proxySource, /linescout_lead_capture_popup/);
});

test('the popup is mounted only with the public LineScout shell', () => {
  assert.match(shellSource, /isPublicSite \? <LeadCapturePopup \/>/);
  assert.match(popupSource, /window\.setTimeout\(showPopup, 7000\)/);
  assert.match(popupSource, /scrollY \/ scrollableHeight >= 0\.35/);
});
