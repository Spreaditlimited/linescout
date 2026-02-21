import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Settings, Wrench } from "lucide-react";
import { db } from "@/lib/db";
import {
  computeMachineLandedRange,
  ensureMachinesReady,
  getMachinePricingSettings,
  slugify,
} from "@/lib/machines";
import MachineViewTracker from "@/components/machines/MachineViewTracker";

export const runtime = "nodejs";
export const revalidate = 3600;

const BASE_URL = "https://linescout.sureimports.com";

type MachineRow = {
  id: number;
  machine_name: string;
  category: string;
  processing_stage: string | null;
  capacity_range: string | null;
  power_requirement: string | null;
  short_desc: string | null;
  why_sells: string | null;
  regulatory_note: string | null;
  image_url: string | null;
  slug: string | null;
  seo_title: string | null;
  seo_description: string | null;
  business_summary: string | null;
  market_notes: string | null;
  sourcing_notes: string | null;
  fob_low_usd: number | null;
  fob_high_usd: number | null;
  cbm_per_unit: number | null;
};

function formatNaira(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return `₦${Math.round(value).toLocaleString()}`;
}

function formatUsd(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return `$${Math.round(value).toLocaleString()}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const conn = await db.getConnection();
  try {
    await ensureMachinesReady(conn);
    const [rows]: any = await conn.query(
      `SELECT * FROM linescout_machines WHERE slug = ? LIMIT 1`,
      [slug]
    );
    const machine = rows?.[0] as MachineRow | undefined;
    if (!machine) {
      return {
        title: "Machine not found | LineScout",
        description: "This machine could not be found.",
      };
    }
    const title = machine.seo_title || `${machine.machine_name} | LineScout`;
    const description =
      machine.seo_description ||
      `Learn about ${machine.machine_name} for agro processing and get sourcing support from LineScout.`;
    const image =
      machine.image_url ||
      `${BASE_URL}/linescout-social.PNG`;
    const url = `${BASE_URL}/machines/${machine.slug || slugify(machine.machine_name)}`;
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url,
        siteName: "LineScout",
        type: "website",
        images: [{ url: image, width: 1200, height: 630, alt: machine.machine_name }],
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [image],
      },
    };
  } finally {
    conn.release();
  }
}

export default async function MachineDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const conn = await db.getConnection();
  let machine: MachineRow | null = null;
  let pricing = await getMachinePricingSettings(conn);
  try {
    await ensureMachinesReady(conn);
    const [rows]: any = await conn.query(
      `SELECT * FROM linescout_machines WHERE slug = ? LIMIT 1`,
      [slug]
    );
    machine = rows?.[0] || null;
  } finally {
    conn.release();
  }

  if (!machine) return notFound();

  const landed = computeMachineLandedRange({
    fob_low_usd: machine.fob_low_usd,
    fob_high_usd: machine.fob_high_usd,
    cbm_per_unit: machine.cbm_per_unit,
    exchange_rate_usd: pricing.exchange_rate_usd,
    cbm_rate_ngn: pricing.cbm_rate_ngn,
    markup_percent: pricing.markup_percent,
  });

  return (
    <main className="min-h-screen bg-[#F5F6FA] text-neutral-900">
      <MachineViewTracker machineId={machine.id} slug={machine.slug || slug} />
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-6">
          <Link href="/machines" className="text-xs font-semibold text-neutral-500">
            ← Back to machines
          </Link>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
          <div className="rounded-[28px] border border-neutral-200 bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
            <div className="h-80 w-full rounded-[22px] border border-neutral-100 bg-[#F2F3F5] p-4">
              {machine.image_url ? (
                <img
                  src={machine.image_url}
                  alt={machine.machine_name}
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm text-neutral-500">
                  Image coming soon
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-neutral-200 bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
              {machine.category}
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-neutral-900">{machine.machine_name}</h1>
            <p className="mt-4 text-sm text-neutral-600">{machine.short_desc || ""}</p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm">
                <p className="text-xs font-semibold text-neutral-500">FOB price (USD)</p>
                <p className="mt-1 text-lg font-semibold">
                  {formatUsd(machine.fob_low_usd)}–{formatUsd(machine.fob_high_usd)}
                </p>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm">
                <p className="text-xs font-semibold text-neutral-500">Estimated landed (sea freight)</p>
                <p className="mt-1 text-lg font-semibold">
                  {formatNaira(landed.landed_ngn_low)}–{formatNaira(landed.landed_ngn_high)}
                </p>
              </div>
            </div>

            <div className="mt-4 text-xs text-neutral-500">
              Sea freight • Last‑mile delivery not included • Small & medium capacity
            </div>

            <div className="mt-6 space-y-3 text-sm text-neutral-600">
              {machine.processing_stage ? (
                <p>
                  <span className="font-semibold text-neutral-800">Processing stage:</span>{" "}
                  {machine.processing_stage}
                </p>
              ) : null}
              {machine.capacity_range ? (
                <p>
                  <span className="font-semibold text-neutral-800">Capacity:</span>{" "}
                  {machine.capacity_range}
                </p>
              ) : null}
              {machine.power_requirement ? (
                <p>
                  <span className="font-semibold text-neutral-800">Power:</span>{" "}
                  {machine.power_requirement}
                </p>
              ) : null}
              {machine.why_sells ? (
                <p>
                  <span className="font-semibold text-neutral-800">Why it sells:</span>{" "}
                  {machine.why_sells}
                </p>
              ) : null}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={`/sourcing-project?route_type=machine_sourcing&machine_id=${encodeURIComponent(
                  String(machine.id)
                )}&machine_name=${encodeURIComponent(
                  machine.machine_name
                )}&machine_category=${encodeURIComponent(
                  machine.category
                )}&machine_landed_ngn=${encodeURIComponent(
                  `${formatNaira(landed.landed_ngn_low)}–${formatNaira(landed.landed_ngn_high)}`
                )}`}
                className="inline-flex items-center gap-2 rounded-2xl bg-[#2D3461] px-5 py-3 text-xs font-semibold text-white"
              >
                Start sourcing <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/sign-in"
                className="inline-flex items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-5 py-3 text-xs font-semibold text-neutral-700"
              >
                Talk to LineScout <Wrench className="h-4 w-4" />
              </Link>
            </div>
            <p className="mt-4 text-xs text-neutral-500">
              For industrial and fully automated lines, chat with LineScout team.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
