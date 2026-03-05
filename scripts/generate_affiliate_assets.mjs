import fs from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const root = process.cwd();
const manifestPath = path.join(root, "public", "affiliate-assets", "manifest.json");
const outDir = path.join(root, "public", "affiliate-assets");

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("Missing OPENAI_API_KEY in env.");
  process.exit(1);
}

const model = process.env.AFFILIATE_IMAGE_MODEL || "gpt-image-1";
const quality = process.env.AFFILIATE_IMAGE_QUALITY || "high";
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;
const skipExisting = process.argv.includes("--skip-existing");

const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const items = Array.isArray(manifest.items) ? manifest.items : [];

const tempDir = await fs.mkdtemp(path.join("/tmp", "ls-affiliate-assets-"));

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function composeWithPython(inputPath, outputPath, width, height) {
  const logoPath = path.join(root, "public", "linescout-logo.png");
  try {
    await execFileAsync("python3", [
      path.join(root, "scripts", "overlay_linescout_logo.py"),
      inputPath,
      outputPath,
      String(width),
      String(height),
      logoPath,
    ]);
    return true;
  } catch (error) {
    console.warn(`Python overlay failed for ${outputPath}: ${error?.message || error}`);
    return false;
  }
}

async function resizeWithSips(inputPath, outputPath, width, height) {
  try {
    await execFileAsync("sips", ["-z", String(height), String(width), inputPath, "--out", outputPath]);
    return true;
  } catch (error) {
    console.warn(`sips resize failed for ${outputPath}: ${error?.message || error}`);
    return false;
  }
}

async function generateImage(item, index) {
  const destPath = path.join(outDir, item.filename);
  const destDir = path.dirname(destPath);
  await fs.mkdir(destDir, { recursive: true });

  if (skipExisting && (await fileExists(destPath))) {
    console.log(`Skipping existing ${item.filename}`);
    return;
  }

  const payload = {
    model,
    prompt: item.prompt,
    size: item.source_size || "1024x1024",
    n: 1,
    quality,
  };

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const imageB64 = data?.data?.[0]?.b64_json;
  if (!imageB64) {
    throw new Error("No image data returned from OpenAI API.");
  }

  const rawPath = path.join(tempDir, `raw-${item.id}.png`);
  await fs.writeFile(rawPath, Buffer.from(imageB64, "base64"));

  const [targetWidth, targetHeight] = String(item.size).split("x").map(Number);
  const [sourceWidth, sourceHeight] = String(item.source_size || "").split("x").map(Number);
  const needsResize =
    Number.isFinite(targetWidth) &&
    Number.isFinite(targetHeight) &&
    Number.isFinite(sourceWidth) &&
    Number.isFinite(sourceHeight) &&
    (targetWidth !== sourceWidth || targetHeight !== sourceHeight);

  const composed = await composeWithPython(rawPath, destPath, targetWidth, targetHeight);
  if (!composed) {
    if (needsResize) {
      const resized = await resizeWithSips(rawPath, destPath, targetWidth, targetHeight);
      if (!resized) {
        await fs.copyFile(rawPath, destPath);
      }
    } else {
      await fs.copyFile(rawPath, destPath);
    }
  }

  console.log(`[${index + 1}/${items.length}] Wrote ${item.filename}`);
}

const total = limit > 0 ? Math.min(limit, items.length) : items.length;
for (let i = 0; i < total; i += 1) {
  await generateImage(items[i], i);
}

console.log(`Done. Generated ${total} image(s).`);
