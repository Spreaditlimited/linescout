import fs from "fs/promises";
import path from "path";

const root = process.cwd();
const outDir = path.join(root, "public", "affiliate-assets");
const manifestPath = path.join(outDir, "manifest.json");

const headlineVariants = [
  "Source smarter from China",
  "From AI clarity to real sourcing",
  "Reliable quotes. Real suppliers.",
  "White label made simple",
  "Machine sourcing, done right",
  "Import without the guesswork",
  "Trusted since 2018",
  "See costs before you commit",
  "Sourcing that scales with you",
  "Global sourcing, local confidence",
  "Clarity for serious buyers",
  "Made for founders and operators",
  "Better suppliers. Better margins.",
  "Your sourcing partner",
  "Premium sourcing insights",
  "Sourcing built for growth",
  "Verified specialists, on demand",
  "Source. Quote. Ship.",
  "China sourcing without stress",
  "Professional sourcing for real brands",
  "Make smarter buying decisions",
  "Faster path to production",
  "LineScout by Sure Imports",
  "Your sourcing workspace",
  "Ship with confidence",
  "Start with clarity, finish with supply",
  "Factory-ready briefs made simple",
  "Sourcing built on transparency",
  "Sourcing for serious operators",
  "Make sourcing feel effortless",
];

const subheadVariants = [
  "Get market clarity, verified suppliers, and structured quotes.",
  "LineScout helps you think first, then execute with specialists.",
  "Transparent costs, clear timelines, and trusted manufacturers.",
  "Build your brief, explore ideas, and launch faster.",
  "Get verified machinery with specs that match your market.",
  "LineScout aligns specs, pricing, and logistics from day one.",
  "Built by a team that has sourced for 40,000+ users worldwide.",
  "Clear totals, service charges, and shipment options.",
  "From first order to repeat supply, LineScout stays consistent.",
  "LineScout helps brands buy right, across borders.",
  "Get accurate quotes, vetted suppliers, and real timelines.",
  "Smart sourcing guidance, then execution by specialists.",
  "Find the right factory and price for your market.",
  "From product specs to shipping, LineScout handles the details.",
  "Get clarity on risks, pricing, and timelines before you buy.",
  "Scale your supply with confidence and transparency.",
  "Move from research to execution without switching platforms.",
  "LineScout delivers a clean, step-by-step sourcing workflow.",
  "Trusted suppliers and clear pricing in one place.",
  "From brief to delivery, LineScout handles your supply chain.",
  "Get data-backed clarity before you commit.",
  "Streamline your sourcing and get to market quicker.",
  "A trusted sourcing team with 8+ years of experience.",
  "All your quotes, shipments, and payments in one place.",
  "Clear shipping options and dependable delivery timelines.",
  "Verified factories, quality checks, and dependable logistics.",
  "Clear briefs, clear costs, and clean execution.",
  "Confidence in every quote and every shipment.",
  "Expert guidance for complex sourcing decisions.",
  "A sourcing workflow that keeps teams aligned.",
];

const ctaVariants = [
  "Start sourcing",
  "Get clarity",
  "Request a quote",
  "Explore white label",
  "Source machines",
  "Get started",
  "Work with LineScout",
  "See how it works",
  "Start now",
  "Source with confidence",
  "Request clarity",
  "Talk to LineScout",
  "Get insights",
  "Scale with LineScout",
  "Talk to a specialist",
  "See the workflow",
  "View the platform",
  "See shipping",
  "Build a brief",
  "Explore ideas",
];

function buildConcepts(count) {
  const concepts = [];
  for (const headline of headlineVariants) {
    for (const subhead of subheadVariants) {
      for (const cta of ctaVariants) {
        concepts.push({ headline, subhead, cta });
        if (concepts.length >= count) {
          return concepts;
        }
      }
    }
  }
  return concepts;
}

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
    count: 30,
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

const totalCount = packs.reduce((sum, pack) => sum + pack.count, 0);
const concepts = buildConcepts(totalCount);
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
      "Do not include any brand logos or website URLs in the artwork.",
      "Leave clean space at the top-left for a logo and at the bottom for a URL badge.",
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
