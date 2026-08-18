import assert from 'node:assert/strict';
import test from 'node:test';

import { WHITE_LABEL_SEO_CONTENT } from '../data/white-label-seo-content.ts';

const entries = Object.entries(WHITE_LABEL_SEO_CONTENT);

test('the first SEO batch contains five complete product guides', () => {
  assert.equal(entries.length, 5);

  for (const [slug, guide] of entries) {
    assert.ok(guide.seoTitle.length >= 35 && guide.seoTitle.length <= 65, slug);
    assert.ok(
      guide.seoDescription.length >= 120 && guide.seoDescription.length <= 165,
      slug,
    );
    assert.ok(guide.keywords.length >= 5, slug);
    assert.equal(new Set(guide.keywords).size, guide.keywords.length, slug);
    assert.ok(guide.introduction.length >= 300, slug);
    assert.ok(guide.businessSummary.length >= 300, slug);
    assert.ok(guide.marketNotes.length >= 250, slug);
    assert.ok(guide.whiteLabelAngle.length >= 250, slug);
    assert.ok(guide.demandDrivers.length >= 4, slug);
    assert.ok(guide.targetBuyers.length >= 4, slug);
    assert.ok(guide.specifications.length >= 7, slug);
    assert.ok(guide.customizationIdeas.length >= 4, slug);
    assert.ok(guide.supplierQuestions.length >= 6, slug);
    assert.ok(guide.qualityChecks.length >= 6, slug);
    assert.ok(guide.sourcingRisks.length >= 4, slug);
    assert.ok(guide.shippingNotes.length >= 250, slug);
    assert.ok(guide.positioningIdeas.length >= 4, slug);
    assert.ok(guide.faqs.length >= 6, slug);
  }
});

test('product introductions are distinct and avoid unsupported guarantees', () => {
  const introductions = entries.map(([, guide]) => guide.introduction);
  assert.equal(new Set(introductions).size, introductions.length);

  for (const [slug, guide] of entries) {
    const content = JSON.stringify(guide);
    assert.doesNotMatch(content, /guaranteed profit|risk[- ]free|guaranteed sales/i, slug);
  }
});
