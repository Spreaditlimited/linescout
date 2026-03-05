import fs from "fs/promises";
import path from "path";

const root = process.cwd();
const outDir = path.join(root, "public", "affiliate-assets");
const manifestPath = path.join(outDir, "manifest.json");

const concepts = [
  {
    headline: "Source smarter from China",
    subhead: "Get market clarity, verified suppliers, and structured quotes.",
    cta: "Start sourcing",
  },
  {
    headline: "From AI clarity to real sourcing",
    subhead: "LineScout helps you think first, then execute with specialists.",
    cta: "Get clarity",
  },
  {
    headline: "Reliable quotes. Real suppliers.",
    subhead: "Transparent costs, clear timelines, and trusted manufacturers.",
    cta: "Request a quote",
  },
  {
    headline: "White label made simple",
    subhead: "Build your brief, explore ideas, and launch faster.",
    cta: "Explore white label",
  },
  {
    headline: "Machine sourcing, done right",
    subhead: "Get verified machinery with specs that match your market.",
    cta: "Source machines",
  },
  {
    headline: "Import without the guesswork",
    subhead: "LineScout aligns specs, pricing, and logistics from day one.",
    cta: "Get started",
  },
  {
    headline: "Trusted since 2018",
    subhead: "Built by a team that has sourced for 40,000+ users worldwide.",
    cta: "Work with LineScout",
  },
  {
    headline: "See costs before you commit",
    subhead: "Clear totals, service charges, and shipment options.",
    cta: "See how it works",
  },
  {
    headline: "Sourcing that scales with you",
    subhead: "From first order to repeat supply, LineScout stays consistent.",
    cta: "Start now",
  },
  {
    headline: "Global sourcing, local confidence",
    subhead: "LineScout helps brands buy right, across borders.",
    cta: "Source with confidence",
  },
  {
    headline: "Clarity for serious buyers",
    subhead: "Get accurate quotes, vetted suppliers, and real timelines.",
    cta: "Request clarity",
  },
  {
    headline: "Made for founders and operators",
    subhead: "Smart sourcing guidance, then execution by specialists.",
    cta: "Talk to LineScout",
  },
  {
    headline: "Better suppliers. Better margins.",
    subhead: "Find the right factory and price for your market.",
    cta: "Start sourcing",
  },
  {
    headline: "Your sourcing partner",
    subhead: "From product specs to shipping, LineScout handles the details.",
    cta: "Work with us",
  },
  {
    headline: "Premium sourcing insights",
    subhead: "Get clarity on risks, pricing, and timelines before you buy.",
    cta: "Get insights",
  },
  {
    headline: "Sourcing built for growth",
    subhead: "Scale your supply with confidence and transparency.",
    cta: "Scale with LineScout",
  },
  {
    headline: "Verified specialists, on demand",
    subhead: "Move from research to execution without switching platforms.",
    cta: "Talk to a specialist",
  },
  {
    headline: "Source. Quote. Ship.",
    subhead: "LineScout delivers a clean, step-by-step sourcing workflow.",
    cta: "See the workflow",
  },
  {
    headline: "China sourcing without stress",
    subhead: "Trusted suppliers and clear pricing in one place.",
    cta: "Start sourcing",
  },
  {
    headline: "Professional sourcing for real brands",
    subhead: "From brief to delivery, LineScout handles your supply chain.",
    cta: "Get started",
  },
  {
    headline: "Make smarter buying decisions",
    subhead: "Get data-backed clarity before you commit.",
    cta: "Get clarity",
  },
  {
    headline: "Faster path to production",
    subhead: "Streamline your sourcing and get to market quicker.",
    cta: "Start now",
  },
  {
    headline: "LineScout by Sure Imports",
    subhead: "A trusted sourcing team with 8+ years of experience.",
    cta: "Work with LineScout",
  },
  {
    headline: "Your sourcing workspace",
    subhead: "All your quotes, shipments, and payments in one place.",
    cta: "View the platform",
  },
  {
    headline: "Ship with confidence",
    subhead: "Clear shipping options and dependable delivery timelines.",
    cta: "See shipping",
  },
];

const styleVariants = [
  "premium minimal layout, soft white background, navy accents, subtle abstract curves",
  "premium minimal layout, off-white gradient background, clean geometric shapes, navy accent",
  "premium minimal layout, light paper texture, soft shadow cards, navy accent",
  "premium minimal layout, airy spacing, subtle glassmorphism panels, navy accent",
  "premium minimal layout, faint grid pattern, clean typography, navy accent",
];

const packs = [
  {
    key: "square",
    width: 1080,
    height: 1080,
    count: 70,
    platforms: ["Facebook", "Instagram"],
    sourceSize: "1024x1024",
  },
  {
    key: "story",
    width: 1080,
    height: 1920,
    count: 10,
    platforms: ["Instagram Story", "Facebook Story"],
    sourceSize: "1024x1536",
  },
  {
    key: "landscape",
    width: 1200,
    height: 628,
    count: 10,
    platforms: ["X", "LinkedIn"],
    sourceSize: "1536x1024",
  },
  {
    key: "tiktok",
    width: 1080,
    height: 1920,
    count: 10,
    platforms: ["TikTok"],
    sourceSize: "1024x1536",
  },
];

const items = [];
let globalIndex = 1;

for (const pack of packs) {
  for (let i = 0; i < pack.count; i += 1) {
    const concept = concepts[(globalIndex - 1) % concepts.length];
    const style = styleVariants[(globalIndex - 1) % styleVariants.length];
    const id = `${pack.key}-${String(i + 1).padStart(3, "0")}`;
    const filename = `${pack.key}/ls-affiliate-${pack.key}-${String(i + 1).padStart(3, "0")}.png`;

    const prompt = [
      "Premium minimal social promo image promoting LineScout sourcing services.",
      style + ".",
      "Include the LineScout logo and footer text 'www.linescout.sureimports.com'.",
      `Headline: "${concept.headline}".`,
      `Subhead: "${concept.subhead}".`,
      `CTA button text: "${concept.cta}".`,
      "Clean modern typography, high contrast, generous spacing, safe margins.",
      `Output size ${pack.width}x${pack.height}.`,
    ].join(" ");

    items.push({
      id,
      platform: pack.platforms.join(" / "),
      size: `${pack.width}x${pack.height}`,
      source_size: pack.sourceSize,
      filename,
      headline: concept.headline,
      subhead: concept.subhead,
      cta: concept.cta,
      style,
      prompt,
    });

    globalIndex += 1;
  }
}

await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(manifestPath, JSON.stringify({ generated_at: new Date().toISOString(), items }, null, 2));

console.log(`Wrote ${items.length} items to ${path.relative(root, manifestPath)}`);
