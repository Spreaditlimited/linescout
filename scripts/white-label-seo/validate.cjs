require("./register-ts.cjs");

const { WHITE_LABEL_SEO_CONTENT } = require("../../data/white-label-seo-content.ts");
const { validateWhiteLabelSeoContent } = require("../../lib/white-label-seo-types.ts");

let failed = false;
const introductions = new Set();
for (const [slug, content] of Object.entries(WHITE_LABEL_SEO_CONTENT)) {
  const validation = validateWhiteLabelSeoContent(content);
  if (!validation.valid) {
    failed = true;
    console.error(`${slug}: ${validation.errors.join(" ")}`);
  }
  if (introductions.has(content.introduction)) {
    failed = true;
    console.error(`${slug}: introduction duplicates another guide.`);
  }
  introductions.add(content.introduction);
}

if (failed) process.exit(1);
console.log(JSON.stringify({ ok: true, validated: Object.keys(WHITE_LABEL_SEO_CONTENT).length }));

