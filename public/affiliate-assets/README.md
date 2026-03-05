# LineScout Affiliate Assets

This folder holds AI-generated promo images for LineScout sourcing services.

## What is included
- `manifest.json`: 100 creative concepts and prompts, with sizes and target platforms.
- `square/`: 1080×1080 (Facebook + Instagram feed)
- `story/`: 1080×1920 (Instagram/Facebook Stories)
- `landscape/`: 1200×628 (X + LinkedIn)
- `tiktok/`: 1080×1920 (TikTok cover/story)

## Regenerate the manifest
```bash
node scripts/build_affiliate_assets_manifest.mjs
```

## Generate images (OpenAI)
Requires `OPENAI_API_KEY` in the environment.

```bash
node scripts/generate_affiliate_assets.mjs --skip-existing
```

Optional:
- `--limit=5` to generate only a few for QA.
- `AFFILIATE_IMAGE_QUALITY=high|medium|low`
- `AFFILIATE_IMAGE_MODEL=gpt-image-1`

Notes:
- The script uses the OpenAI Images API, then uses a local Python/Pillow overlay to guarantee the LineScout logo and footer text appear on every image.
- If the overlay fails, it falls back to `sips` resize and keeps the raw image content.
