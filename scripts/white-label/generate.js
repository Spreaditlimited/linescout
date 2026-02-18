#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cloudinary = require("cloudinary").v2;
const dotenv = require("dotenv");

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config();

const args = parseArgs(process.argv.slice(2));

const OUT_PATH = args.out || path.join(process.cwd(), "data", "white-label-products.json");
const COUNT = Number(args.count || 1000);
const BATCH = Number(args.batch || 25);
const IMAGE_COUNT = Number(args.images || 0);
const TEXT_MODEL = args.textModel || "gpt-4.1";
const IMAGE_MODEL = args.imageModel || "gpt-image-1.5";
const IMAGE_SIZE = args.imageSize || "1024x1024";
const IMAGE_QUALITY = args.imageQuality || "medium";
const DRY_RUN = Boolean(args.dryRun);
const RESUME = Boolean(args.resume);
const NAMES_FILE = args.namesFile || args.names || "";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "";
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || "";
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || "";

const EXPLAIN = Boolean(args.explain || args.noApi);
if (!EXPLAIN) {
  typecheckEnv();
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
  });
}

const STYLE_PROMPT =
  "Studio product photo on a clean light-gray background, soft shadow, centered product, high clarity, modern ecommerce lighting, no people, no props, minimal packaging, premium white label look. Add subtle brand text 'YOUR BRAND' on product or packaging if appropriate.";

const CATEGORY_GUIDE = [
  { name: "Phone & Computer Accessories", regulated: false },
  { name: "Home & Kitchen (Non-food contact)", regulated: false },
  { name: "Home Organization", regulated: false },
  { name: "Travel Accessories", regulated: false },
  { name: "Fitness & Wellness Accessories", regulated: false },
  { name: "Stationery & Office", regulated: false },
  { name: "Baby & Kids (Non-regulated items)", regulated: false },
  { name: "Fashion Accessories", regulated: false },
  { name: "Automotive Accessories", regulated: false },
  { name: "Beauty & Skincare", regulated: true },
  { name: "Health & Medical Devices", regulated: true },
  { name: "Food & Beverage", regulated: true },
  { name: "Household Chemicals", regulated: true },
];

const PROMPT_BASE = `
You are generating a curated list of WHITE LABEL product ideas for Nigerian founders.
Output ONLY a JSON array (no markdown). Each item must match the schema:
{
  "product_name": string,
  "category": string,
  "short_desc": string,
  "why_sells": string,
  "regulatory_note": string,
  "mockup_prompt": string,
  "seo_title": string,
  "seo_description": string,
  "business_summary": string,
  "market_notes": string,
  "white_label_angle": string,
  "fob_low_usd": number,
  "fob_high_usd": number,
  "cbm_per_1000": number
}

Rules:
- Non-repetitive, human, concise, high-quality content.
- Each product must be distinct in use case and not a minor variation of another.
- Do NOT reuse sentences or phrases across different products. Every short_desc, why_sells, business_summary, market_notes, white_label_angle, and seo_description must be unique.
- Prefer low-priced, high-repeat-demand items in Nigeria.
- Heavily favor NON-regulated categories; include some regulated for completeness.
- Regulatory note must say either "Non-regulated." or "NAFDAC regulated (cosmetics)." or "NAFDAC regulated (medical device)." or "NAFDAC regulated (food)." or "NAFDAC regulated (household chemical)."
- FOB low/high should be realistic and low-cost (typically $0.3-$20). High must be > low.
- cbm_per_1000 should be plausible (0.05 to 4.0).
- mockup_prompt must describe a minimal white-label product shot with branding placement.
- Product name should be clear and buyer-friendly.
- Do NOT include branded trademarks.
- seo_title should be <= 65 characters and include the product name.
- seo_description should be <= 155 characters and be business-focused.
- business_summary should be 2-3 sentences.
- market_notes should be 2-3 sentences.
- white_label_angle should be 2-3 sentences describing how to position/brand.
- Make the content Nigeria-specific (buying habits, channels, common needs).
- Use categories from this list (exactly):
${CATEGORY_GUIDE.map((c) => `- ${c.name} (${c.regulated ? "regulated" : "non-regulated"})`).join("\n")}

Return ONLY JSON.
`;

async function main() {
  if (EXPLAIN) {
    const existing = RESUME ? loadExisting(OUT_PATH) : [];
    const existingCount = existing.length;
    const names = NAMES_FILE ? loadNamesFile(NAMES_FILE) : [];
    const existingName = new Set(existing.map((p) => normalizeName(p.product_name)));
    const filteredNames = names.filter((n) => !existingName.has(normalizeName(n)));
    const targetTotal = names.length ? existingCount + filteredNames.length : COUNT;
    const toGenerate = names.length ? filteredNames.length : Math.max(targetTotal - existingCount, 0);
    console.log("Explain mode: no API calls will be made.");
    console.log(`Output path: ${OUT_PATH}`);
    console.log(`Resume: ${RESUME ? "yes" : "no"}`);
    console.log(`Existing items: ${existingCount}`);
    console.log(`Target total: ${targetTotal}`);
    console.log(`Will generate: ${toGenerate}`);
    console.log(`Batch size: ${BATCH}`);
    console.log(`Images requested: ${IMAGE_COUNT}`);
    if (!RESUME) {
      console.log("Note: without --resume, existing JSON file is ignored.");
    }
    return;
  }
  const existing = RESUME ? loadExisting(OUT_PATH) : [];
  const existingKey = new Set(existing.map((p) => keyFor(p.product_name, p.category)));
  const existingName = new Set(existing.map((p) => normalizeName(p.product_name)));
  const existingSlug = new Set(existing.map((p) => normalizeName(p.slug || slugify(p.product_name))));
  const sentenceSet = new Set();
  for (const p of existing) {
    trackSentences(sentenceSet, p);
  }
  const names = NAMES_FILE ? loadNamesFile(NAMES_FILE) : [];
  const namesToGenerate = names.length
    ? names.filter((n) => !existingName.has(normalizeName(n)))
    : [];

  const targetTotal = names.length ? existing.length + namesToGenerate.length : COUNT;

  let items = [...existing];
  let namesQueue = [...namesToGenerate];
  let stagnantBatches = 0;

  while (items.length < targetTotal) {
    const remaining = targetTotal - items.length;
    const take = Math.min(BATCH, remaining);
    let batch;
    let expectedNames = null;

    if (namesToGenerate.length) {
      expectedNames = namesQueue.slice(0, take);
      batch = await generateBatchForNames(expectedNames, items.length, existing);
    } else {
      batch = await generateBatch(take, items.length, existing);
    }

    let added = 0;
    const addedNameKeys = new Set();
    for (const item of batch) {
      const k = keyFor(item.product_name, item.category);
      if (existingKey.has(k)) continue;
      const nameKey = normalizeName(item.product_name);
      const slugKey = normalizeName(item.slug || slugify(item.product_name));
      if (!nameKey || existingName.has(nameKey)) continue;
      if (expectedNames) {
        const expectedSet = new Set(expectedNames.map((n) => normalizeName(n)));
        if (!expectedSet.has(nameKey)) continue;
      }
      if (slugKey && existingSlug.has(slugKey)) continue;
      if (!isUniqueContent(sentenceSet, item)) continue;
      existingKey.add(k);
      existingName.add(nameKey);
      if (slugKey) existingSlug.add(slugKey);
      trackSentences(sentenceSet, item);
      items.push(item);
      addedNameKeys.add(nameKey);
      added += 1;
    }

    if (expectedNames) {
      namesQueue = namesQueue.filter((n) => !addedNameKeys.has(normalizeName(n)));
    }

    if (added === 0) stagnantBatches += 1;
    else stagnantBatches = 0;

    if (stagnantBatches >= 3) {
      throw new Error("Model returned no usable items for 3 consecutive batches.");
    }

    console.log(`Generated ${items.length}/${targetTotal}`);
    if (!DRY_RUN) {
      saveItems(OUT_PATH, items);
    }
  }

  // Apply sort_order and defaults
  items = items.map((p, idx) => ({
    ...p,
    image_url: p.image_url || null,
    slug: p.slug || slugify(p.product_name),
    is_active: 1,
    sort_order: idx + 1,
  }));

  if (IMAGE_COUNT > 0) {
    const allowNames = new Set(
      (namesToGenerate.length ? namesToGenerate : []).map((n) => normalizeName(n))
    );
    const toImage = items
      .filter((p) => !p.image_url)
      .filter((p) => (allowNames.size ? allowNames.has(normalizeName(p.product_name)) : true))
      .slice(0, IMAGE_COUNT);
    for (const item of toImage) {
      if (DRY_RUN) {
        item.image_url = "https://res.cloudinary.com/demo/image/upload/sample";
        continue;
      }
      try {
        const imageUrl = await generateAndUploadImage(item);
        item.image_url = imageUrl;
        console.log(`Image: ${item.product_name} -> ${imageUrl}`);
        saveItems(OUT_PATH, items);
      } catch (err) {
        const message = String(err?.message || err || "");
        if (message.includes("moderation_blocked") || message.includes("safety")) {
          console.warn(`Skipped image (safety): ${item.product_name}`);
          continue;
        }
        throw err;
      }
    }
  }

  if (!DRY_RUN) {
    saveItems(OUT_PATH, items);
    console.log(`Saved ${items.length} items to ${OUT_PATH}`);
  } else {
    console.log(`DRY RUN: would save ${items.length} items to ${OUT_PATH}`);
  }
}

function keyFor(name, category) {
  return `${String(name || "").toLowerCase()}||${String(category || "").toLowerCase()}`;
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSentences(text) {
  return String(text || "")
    .split(/[.!?]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeSentence(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]+/g, "")
    .trim();
}

function shouldTrackSentence(s) {
  const words = s.split(" ").filter(Boolean);
  return words.length >= 6;
}

function trackSentences(set, item) {
  const fields = [
    item.short_desc,
    item.why_sells,
    item.business_summary,
    item.market_notes,
    item.white_label_angle,
    item.seo_description,
  ];
  for (const field of fields) {
    for (const sentence of splitSentences(field)) {
      const norm = normalizeSentence(sentence);
      if (!norm || !shouldTrackSentence(norm)) continue;
      set.add(norm);
    }
  }
}

function isUniqueContent(set, item) {
  const fields = [
    item.short_desc,
    item.why_sells,
    item.business_summary,
    item.market_notes,
    item.white_label_angle,
    item.seo_description,
  ];
  for (const field of fields) {
    for (const sentence of splitSentences(field)) {
      const norm = normalizeSentence(sentence);
      if (!norm || !shouldTrackSentence(norm)) continue;
      if (set.has(norm)) return false;
    }
  }
  return true;
}

function loadExisting(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => {
          if (!item) return null;
          const category = normalizeCategory(item.category || "");
          const regulatory_note = normalizeRegulatory(item.regulatory_note || "");
          return {
            ...item,
            category: category || item.category || "",
            regulatory_note: regulatory_note || item.regulatory_note || "Non-regulated.",
            slug: item.slug || slugify(item.product_name),
          };
        })
        .filter(Boolean);
    }
  } catch {
    return [];
  }
  return [];
}

function saveItems(filePath, items) {
  fs.writeFileSync(filePath, JSON.stringify(items, null, 2));
}

function loadNamesFile(filePath) {
  if (!filePath) return [];
  const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  if (!fs.existsSync(abs)) return [];
  const raw = fs.readFileSync(abs, "utf8");
  const names = raw
    .split(/\r?\n/g)
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const name of names) {
    const key = normalizeName(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

function buildExistingNameBlock(existing) {
  const names = existing
    .map((p) => String(p.product_name || "").trim())
    .filter(Boolean);
  if (!names.length) return "";
  return `\nAvoid these existing product names:\n- ${names.join("\n- ")}`;
}

function buildRequestedNameBlock(names) {
  const list = (names || []).map((n) => String(n || "").trim()).filter(Boolean);
  if (!list.length) return "";
  return `\nUse ONLY these product names for this batch:\n- ${list.join("\n- ")}`;
}

async function generateBatch(count, offset, existing) {
  let attempt = 0;
  let target = count;
  while (attempt < 3) {
    attempt += 1;
    const existingBlock = buildExistingNameBlock(existing || []);
    const prompt = `${PROMPT_BASE}${existingBlock}\nReturn a JSON object with shape {\"items\": [ ... ]}.\nGenerate ${target} items. Avoid repeating items already generated. Batch offset: ${offset}.`;

    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: TEXT_MODEL,
        input: prompt,
        temperature: 0.7,
        max_output_tokens: 2000,
        text: { format: { type: "json_object" } },
      }),
    });

    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      throw new Error(`OpenAI text error (${res.status}): ${raw}`);
    }

    const data = await res.json();
    const text = extractOutputText(data);
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = tryParseJsonObject(text);
    }

    const items = Array.isArray(parsed?.items) ? parsed.items : null;
    if (items) {
      return items.map(normalizeItem).filter(Boolean);
    }

    // back off and try a smaller batch
    target = Math.max(5, Math.floor(target / 2));
  }

  throw new Error("Failed to parse JSON from model after retries.");
}

async function generateBatchForNames(names, offset, existing) {
  let attempt = 0;
  let target = names.length;
  while (attempt < 3) {
    attempt += 1;
    const existingBlock = buildExistingNameBlock(existing || []);
    const requestedBlock = buildRequestedNameBlock(names);
    const prompt = `${PROMPT_BASE}${existingBlock}${requestedBlock}\nReturn a JSON object with shape {\"items\": [ ... ]}.\nGenerate ${target} items. Each item must use EXACTLY one of the provided product names.\nBatch offset: ${offset}.`;

    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: TEXT_MODEL,
        input: prompt,
        temperature: 0.5,
        max_output_tokens: 2000,
        text: { format: { type: "json_object" } },
      }),
    });

    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      throw new Error(`OpenAI text error (${res.status}): ${raw}`);
    }

    const data = await res.json();
    const text = extractOutputText(data);
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = tryParseJsonObject(text);
    }

    const items = Array.isArray(parsed?.items) ? parsed.items : null;
    if (items) {
      return items.map(normalizeItem).filter(Boolean);
    }

    target = Math.max(1, Math.floor(target / 2));
  }

  throw new Error("Failed to parse JSON from model after retries.");
}

function normalizeItem(raw) {
  if (!raw) return null;
  const product_name = String(raw.product_name || "").trim();
  const category = normalizeCategory(String(raw.category || "").trim());
  if (!product_name || !category) return null;

  const short_desc = String(raw.short_desc || "").trim() || null;
  const why_sells = String(raw.why_sells || "").trim() || null;
  const regulatory_note = normalizeRegulatory(String(raw.regulatory_note || "").trim());
  const mockup_prompt = String(raw.mockup_prompt || "").trim() || null;
  const seo_title = String(raw.seo_title || "").trim() || null;
  const seo_description = String(raw.seo_description || "").trim() || null;
  const business_summary = String(raw.business_summary || "").trim() || null;
  const market_notes = String(raw.market_notes || "").trim() || null;
  const white_label_angle = String(raw.white_label_angle || "").trim() || null;

  const fob_low_usd = clampNum(raw.fob_low_usd, 0.3, 50);
  const fob_high_usd = clampNum(raw.fob_high_usd, 0.5, 80);
  const cbm_per_1000 = clampNum(raw.cbm_per_1000, 0.05, 4.0);

  const low = fob_low_usd;
  let high = fob_high_usd;
  if (high <= low) high = Number((low + 0.5).toFixed(2));

  return {
    product_name,
    category,
    short_desc,
    why_sells,
    regulatory_note,
    mockup_prompt,
    seo_title,
    seo_description,
    business_summary,
    market_notes,
    white_label_angle,
    slug: slugify(product_name),
    image_url: null,
    fob_low_usd: Number(low.toFixed(2)),
    fob_high_usd: Number(high.toFixed(2)),
    cbm_per_1000: Number(cbm_per_1000.toFixed(3)),
  };
}

function tryParseJsonObject(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeCategory(value) {
  if (!value) return value;
  let v = String(value).trim();
  // Only strip trailing tags that mention regulated/non-regulated, preserve legit category qualifiers
  v = v.replace(/\s*\((?:non-)?regulated.*?\)\s*$/i, "").trim();
  return v;
}

function normalizeRegulatory(value) {
  const v = String(value || "").toLowerCase();
  if (!v || v.includes("non")) return "Non-regulated.";
  if (v.includes("cosmetic")) return "NAFDAC regulated (cosmetics).";
  if (v.includes("medical")) return "NAFDAC regulated (medical device).";
  if (v.includes("food")) return "NAFDAC regulated (food).";
  if (v.includes("chemical") || v.includes("detergent")) return "NAFDAC regulated (household chemical).";
  return "Non-regulated.";
}

function clampNum(val, min, max) {
  const n = Number(val);
  if (!Number.isFinite(n)) return min;
  return Math.min(Math.max(n, min), max);
}

function extractOutputText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  const outputs = Array.isArray(data?.output) ? data.output : [];
  for (const item of outputs) {
    const content = item?.content || [];
    for (const c of content) {
      if (c?.type === "output_text" && typeof c?.text === "string") return c.text;
    }
  }
  throw new Error("No output_text found in OpenAI response");
}

async function generateAndUploadImage(item) {
  const prompt = `${STYLE_PROMPT} Product: ${item.product_name}. ${item.mockup_prompt || ""}`.trim();

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      prompt,
      size: IMAGE_SIZE,
      quality: IMAGE_QUALITY,
    }),
  });

  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    throw new Error(`OpenAI image error (${res.status}): ${raw}`);
  }

  const data = await res.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image returned from OpenAI");

  const buffer = Buffer.from(b64, "base64");
  const publicId = `${slugify(item.product_name)}-${crypto.randomBytes(4).toString("hex")}`;
  const imageUrl = await streamUploadWithRetry(publicId, buffer, 3);
  return imageUrl;
}

function streamUpload(publicId, buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "image",
        folder: "linescout/white-label",
        public_id: publicId,
        overwrite: true,
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result?.secure_url);
      }
    );
    stream.end(buffer);
  });
}

async function streamUploadWithRetry(publicId, buffer, attempts) {
  let lastErr = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await streamUpload(publicId, buffer);
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message || err || "");
      const isTimeout = msg.toLowerCase().includes("timeout") || msg.includes("http_code: 499");
      if (!isTimeout || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr;
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function typecheckEnv() {
  const required = [
    "OPENAI_API_KEY",
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Missing env vars: ${missing.join(", ")}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
