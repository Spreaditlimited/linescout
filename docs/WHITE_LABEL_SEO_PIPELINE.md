# White-label SEO content pipeline

LineScout keeps product catalogue data in `linescout_white_label_products` and stores long-form SEO guides as versioned revisions in `linescout_white_label_seo_revisions`.

## Publishing guarantees

- Product pages read only the newest revision whose status is `published`.
- Drafts, queued briefs and review-ready content never render publicly.
- Publishing archives the previous revision rather than deleting it.
- The original five reviewed guides remain code fallbacks if the content store is unavailable for an individual product.
- A guide must pass `validateWhiteLabelSeoContent` before the publishing command accepts it.
- Product sourcing links continue to carry the exact product ID, name, category and landed estimate into LineScout.

## One-time setup

```bash
npm run seo:migrate
npm run seo:seed-approved
npm run seo:plan -- --target=20
```

The initial batch contains the five approved guides plus the next 15 products selected from GSC demand and LineScout views.

## Scheduling

Vercel calls `/api/internal/cron/white-label-seo` every day at 06:15 UTC. The endpoint requires `Authorization: Bearer $CRON_SECRET` and is idempotent: it will not create another batch while an earlier one contains open items. Later batches contain up to 25 products.

Set these optional LineScout production variables to include Sure Imports GSC signals:

```txt
SUREIMPORTS_SEO_API_ORIGIN=https://www.sureimports.com
SEO_INTERNAL_API_SECRET=<same scoped secret configured on Sure Imports>
```

Without those variables, scheduling continues safely using LineScout product views. The Sure Imports GSC importer remains manual and does not invoke an AI model.

## Editorial workflow

1. Select the oldest `queued` batch item.
2. Use `authoring_brief_json` and its recorded GSC queries to write a product-specific guide.
3. Save the guide as a `draft` revision.
4. Validate title, description, completeness, unsupported claims and duplication.
5. Source-check regulatory, certification, price and timeline warnings.
6. Mark the revision review-ready.
7. Publish explicitly:

```bash
node --env-file=.env.local scripts/white-label-seo/publish.cjs --slug=product-slug --confirm
```

Run `npm run test:seo` after changing content.
