import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

import { validateWhiteLabelSeoContent } from '../lib/white-label-seo-types.ts';

const draftsUrl = new URL('../data/white-label-seo-drafts/', import.meta.url);
const files = (await readdir(draftsUrl)).filter((file) => file.endsWith('.json')).sort();

test('scheduled white-label drafts pass the complete guide validator', async () => {
  assert.ok(files.length > 0);
  const introductions = new Set();
  for (const file of files) {
    const content = JSON.parse(await readFile(new URL(file, draftsUrl), 'utf8'));
    const validation = validateWhiteLabelSeoContent(content);
    assert.equal(validation.valid, true, `${file}: ${validation.errors.join(' ')}`);
    assert.equal(validation.score, 100, file);
    assert.equal(introductions.has(content.introduction), false, `${file}: duplicate introduction`);
    introductions.add(content.introduction);
  }
});

test('publishing archives every superseded public or reviewable revision', async () => {
  const publisher = await readFile(
    new URL('../scripts/white-label-seo/publish.cjs', import.meta.url),
    'utf8',
  );

  assert.match(publisher, /id <> \?/);
  assert.match(publisher, /status IN \('published', 'draft', 'review_ready'\)/);
});
