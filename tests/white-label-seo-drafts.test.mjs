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
  assert.match(publisher, /NOT EXISTS \(/);
  assert.match(publisher, /SET b\.status = 'completed'/);
});

test('scheduler enforces five guides per day and 35 per week', async () => {
  const scheduler = await readFile(
    new URL('../lib/white-label-seo-scheduler.ts', import.meta.url),
    'utf8',
  );
  const cronConfig = JSON.parse(
    await readFile(new URL('../vercel.json', import.meta.url), 'utf8'),
  );
  const seoCron = cronConfig.crons.find(
    (entry) => entry.path === '/api/internal/cron/white-label-seo',
  );

  assert.match(scheduler, /Math\.min\(5,/);
  assert.match(scheduler, /35 - scheduledThisWeek/);
  assert.match(scheduler, /reason: "daily_limit"/);
  assert.match(scheduler, /reason: "weekly_limit"/);
  assert.equal(seoCron?.schedule, '15 6 * * *');
});
