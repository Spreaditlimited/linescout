#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cloudinary = require("cloudinary").v2;
const dotenv = require("dotenv");

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config();

typecheckEnv();

const args = parseArgs(process.argv.slice(2));

const OUT_PATH = args.out || path.join(process.cwd(), "data", "machines.json");
const COUNT = Number(args.count || 200);
const BATCH = Number(args.batch || 15);
const IMAGE_COUNT = Number(args.images || 0);
const TEXT_MODEL = args.textModel || "gpt-4.1";
const IMAGE_MODEL = args.imageModel || "gpt-image-1.5";
const IMAGE_SIZE = args.imageSize || "1024x1024";
const IMAGE_QUALITY = args.imageQuality || "medium";
const DRY_RUN = Boolean(args.dryRun);
const RESUME = Boolean(args.resume);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "";
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || "";
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || "";

cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
});

const STYLE_PROMPT =
  "Studio product photo on a clean light-gray background, soft shadow, centered machine, high clarity, modern industrial ecommerce lighting, no people, no props, minimal branding, premium machinery look. Add subtle brand text 'YOUR BRAND' on a panel if appropriate.";

const CATEGORY_GUIDE = [
  "Cassava Processing",
  "Rice Processing",
  "Palm Oil Processing",
  "Maize & Grain Milling",
  "Oilseed Processing",
  "Grain Cleaning & Drying",
  "Fruit & Tomato Processing",
  "Cocoa, Coffee & Spice",
  "Feed & Pellet",
  "Packaging & Ancillary",
  "Cold Storage & Postharvest",
];

const PROMPT_BASE = `
You are generating a curated list of AGRO PROCESSING MACHINES and PRODUCTION LINES Nigerians buy often or need.
Output ONLY a JSON array (no markdown). Each item must match the schema:
{
  "machine_name": string,
  "category": string,
  "processing_stage": string,
  "capacity_range": string,
  "power_requirement": string,
  "short_desc": string,
  "why_sells": string,
  "regulatory_note": string,
  "mockup_prompt": string,
  "seo_title": string,
  "seo_description": string,
  "business_summary": string,
  "market_notes": string,
  "sourcing_notes": string,
  "fob_low_usd": number,
  "fob_high_usd": number,
  "cbm_per_unit": number
}

Rules:
- Small and medium capacity only. If industrial/fully automated, mark in sourcing_notes: "For industrial lines, chat with LineScout team."
- Non-repetitive, human, concise, high-quality content.
- Each machine must be distinct in use case and not a minor variation of another.
- Do NOT reuse sentences across different machines. Every short_desc, why_sells, business_summary, market_notes, sourcing_notes, and seo_description must be unique.
- Price ranges should be realistic FOB for small/medium machines ($800–$60,000). High must be > low.
- cbm_per_unit should be plausible (0.3 to 25.0).
- mockup_prompt must describe a minimal machine shot with branding placement.
- Regulatory note should be "Non-regulated." unless the item directly handles food contact surfaces, then say "NAFDAC regulated (food)." or "NAFDAC regulated (processing)." if needed.
- Include Nigeria-specific usage, capacity sizing, and channel notes.
- Categories must be one of:
${CATEGORY_GUIDE.map((c) => `- ${c}`).join("\n")}

Return ONLY JSON.
`;

async function main() {
  const existing = RESUME ? loadExisting(OUT_PATH) : [];
  const existingKey = new Set(existing.map((p) => keyFor(p.machine_name, p.category)));
  const existingName = new Set(existing.map((p) => normalizeName(p.machine_name)));
  const sentenceSet = new Set();
  for (const p of existing) {
    trackSentences(sentenceSet, p);
  }

  let items = [...existing];

  while (items.length < COUNT) {
    const remaining = COUNT - items.length;
    const take = Math.min(BATCH, remaining);
    const batch = await generateBatch(take, items.length, existing);
    for (const item of batch) {
      const k = keyFor(item.machine_name, item.category);
      if (existingKey.has(k)) continue;
      const nameKey = normalizeName(item.machine_name);
      if (!nameKey || existingName.has(nameKey)) continue;
      if (!isUniqueContent(sentenceSet, item)) continue;
      existingKey.add(k);
      existingName.add(nameKey);
      trackSentences(sentenceSet, item);
      items.push(item);
    }
    console.log(`Generated ${items.length}/${COUNT}`);
    if (!DRY_RUN) saveItems(OUT_PATH, items);
  }

  items = items.map((p, idx) => ({
    ...p,
    image_url: p.image_url || null,
    slug: p.slug || slugify(p.machine_name),
    is_active: 1,
    sort_order: idx + 1,
  }));

  if (IMAGE_COUNT > 0) {
    const toImage = items.filter((p) => !p.image_url).slice(0, IMAGE_COUNT);
    for (const item of toImage) {
      if (DRY_RUN) {
        item.image_url = "https://res.cloudinary.com/demo/image/upload/sample";
        continue;
      }
      try {
        const imageUrl = await generateAndUploadImage(item);
        item.image_url = imageUrl;
        console.log(`Image: ${item.machine_name} -> ${imageUrl}`);
        saveItems(OUT_PATH, items);
      } catch (err) {
        const message = String(err?.message || err || "");
        if (message.includes("moderation_blocked") || message.includes("safety")) {
          console.warn(`Skipped image (safety): ${item.machine_name}`);
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
    item.sourcing_notes,
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
    item.sourcing_notes,
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
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
  } catch {
    return [];
  }
  return [];
}

function saveItems(filePath, items) {
  fs.writeFileSync(filePath, JSON.stringify(items, null, 2));
}

function buildExistingNameBlock(existing) {
  const names = existing
    .map((p) => String(p.machine_name || "").trim())
    .filter(Boolean);
  if (!names.length) return "";
  return `\nAvoid these existing machine names:\n- ${names.join("\n- ")}`;
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
        max_output_tokens: 2200,
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

    target = Math.max(5, Math.floor(target / 2));
  }

  throw new Error("Failed to parse JSON from model after retries.");
}

function normalizeItem(raw) {
  if (!raw) return null;
  const machine_name = String(raw.machine_name || "").trim();
  const category = String(raw.category || "").trim();
  if (!machine_name || !category) return null;

  const processing_stage = String(raw.processing_stage || "").trim() || null;
  const capacity_range = String(raw.capacity_range || "").trim() || null;
  const power_requirement = String(raw.power_requirement || "").trim() || null;
  const short_desc = String(raw.short_desc || "").trim() || null;
  const why_sells = String(raw.why_sells || "").trim() || null;
  const regulatory_note = String(raw.regulatory_note || "").trim() || "Non-regulated.";
  const mockup_prompt = String(raw.mockup_prompt || "").trim() || null;
  const seo_title = String(raw.seo_title || "").trim() || null;
  const seo_description = String(raw.seo_description || "").trim() || null;
  const business_summary = String(raw.business_summary || "").trim() || null;
  const market_notes = String(raw.market_notes || "").trim() || null;
  const sourcing_notes = String(raw.sourcing_notes || "").trim() || null;

  const fob_low_usd = clampNum(raw.fob_low_usd, 800, 60000);
  const fob_high_usd = clampNum(raw.fob_high_usd, 900, 80000);
  const cbm_per_unit = clampNum(raw.cbm_per_unit, 0.3, 25.0);

  const low = fob_low_usd;
  let high = fob_high_usd;
  if (high <= low) high = Number((low + 500).toFixed(2));

  return {
    machine_name,
    category,
    processing_stage,
    capacity_range,
    power_requirement,
    short_desc,
    why_sells,
    regulatory_note,
    mockup_prompt,
    seo_title,
    seo_description,
    business_summary,
    market_notes,
    sourcing_notes,
    slug: slugify(machine_name),
    image_url: null,
    fob_low_usd: Number(low.toFixed(2)),
    fob_high_usd: Number(high.toFixed(2)),
    cbm_per_unit: Number(cbm_per_unit.toFixed(3)),
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
  const prompt = `${STYLE_PROMPT} Machine: ${item.machine_name}. ${item.mockup_prompt || ""}`.trim();

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
  const publicId = `${slugify(item.machine_name)}-${crypto.randomBytes(4).toString("hex")}`;
  const imageUrl = await streamUploadWithRetry(publicId, buffer, 3);
  return imageUrl;
}

function streamUpload(publicId, buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "image",
        folder: "linescout/machines",
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

