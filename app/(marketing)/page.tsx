import crypto from "crypto";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { unstable_cache } from "next/cache";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2/promise";
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  Boxes,
  Check,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  FileText,
  FolderKanban,
  Headphones,
  Lightbulb,
  MessageCircle,
  PackageCheck,
  PackageSearch,
  RefreshCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  WalletCards,
} from "lucide-react";

import { db, queryOne } from "@/lib/db";

export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "LineScout | Your China Sourcing Workspace by Sure Imports",
  description:
    "Discover product ideas, clarify specifications, work with China sourcing specialists, review quotes, make payments, and track shipments in one sourcing workspace.",
  alternates: {
    canonical: "https://linescout.sureimports.com",
  },
};

type PopularProduct = {
  id: number;
  product_name: string;
  slug: string;
  category: string;
  image_url: string | null;
  short_desc: string | null;
  view_count: number;
};

const getPopularProducts = unstable_cache(
  async (): Promise<PopularProduct[]> => {
    const conn = await db.getConnection();
    try {
      const [rows] = await conn.query<RowDataPacket[]>(
        `
        SELECT
          p.id,
          p.product_name,
          p.slug,
          p.category,
          p.image_url,
          p.short_desc,
          COUNT(v.product_id) AS view_count
        FROM linescout_white_label_products p
        LEFT JOIN linescout_white_label_views v ON v.product_id = p.id
        WHERE p.is_active = 1
          AND p.image_url IS NOT NULL
          AND TRIM(p.image_url) <> ''
        GROUP BY p.id
        ORDER BY view_count DESC, p.sort_order ASC, p.id DESC
        LIMIT 6
        `,
      );

      return rows.map((row) => ({
        id: Number(row.id),
        product_name: String(row.product_name || ""),
        slug: String(row.slug || ""),
        category: String(row.category || "Product idea"),
        image_url: row.image_url ? String(row.image_url) : null,
        short_desc: row.short_desc ? String(row.short_desc) : null,
        view_count: Number(row.view_count || 0),
      }));
    } finally {
      conn.release();
    }
  },
  ["linescout-home-popular-white-label-products"],
  { revalidate: 3600, tags: ["white-label-products"] },
);

const capabilities = [
  {
    title: "Discover white-label opportunities",
    description:
      "Search more than 1,000 product ideas by category, demand signal, regulatory status, and estimated landed cost.",
    href: "/white-label",
    cta: "Explore products",
    icon: Lightbulb,
  },
  {
    title: "Turn an idea into a sourcing brief",
    description:
      "Capture the product, quantity, destination, specifications, and commercial goals your sourcing team needs.",
    href: "/sign-in?next=/projects/new",
    cta: "Build a project brief",
    icon: ClipboardCheck,
  },
  {
    title: "Get guidance before you commit",
    description:
      "Use AI chat for early clarity, then bring in a sourcing specialist when the project is ready for execution.",
    href: "/sign-in?next=/machine",
    cta: "Start a conversation",
    icon: Bot,
  },
  {
    title: "Manage sourcing projects",
    description:
      "Keep conversations, requirements, project stages, supplier progress, and important decisions in one workspace.",
    href: "/sign-in?next=/projects",
    cta: "View your workspace",
    icon: FolderKanban,
  },
  {
    title: "Review quotes and pay securely",
    description:
      "See product and shipping costs clearly, follow payment milestones, and use your LineScout wallet where eligible.",
    href: "/sign-in?next=/quotes",
    cta: "Manage quotes",
    icon: WalletCards,
  },
  {
    title: "Follow goods through delivery",
    description:
      "Track shipment updates, packages, shipping milestones, and repeat orders without losing the project history.",
    href: "/track",
    cta: "Track a shipment",
    icon: PackageSearch,
  },
];

const workflow = [
  {
    step: "01",
    title: "Explore or describe what you need",
    description: "Start with a white-label idea, a machine, or any product you want sourced from China.",
    icon: Search,
  },
  {
    step: "02",
    title: "Build a precise brief",
    description: "Share specifications, target quantity, destination, budget, and branding requirements.",
    icon: FileText,
  },
  {
    step: "03",
    title: "Work with a sourcing specialist",
    description: "A verified Sure Imports specialist researches, confirms requirements, and manages supplier execution.",
    icon: Headphones,
  },
  {
    step: "04",
    title: "Approve quotes and milestones",
    description: "Review structured costs and pay against the agreed product and shipping stages.",
    icon: CircleDollarSign,
  },
  {
    step: "05",
    title: "Track delivery and reorder",
    description: "Follow shipment progress and keep the complete record ready for a smoother repeat order.",
    icon: PackageCheck,
  },
];

const sourcingRoutes = [
  {
    eyebrow: "Build a brand",
    title: "White-label products",
    description:
      "Find marketable products, assess the opportunity, and move from inspiration to custom branding and production.",
    href: "/white-label",
    link: "Browse product ideas",
    icon: Sparkles,
  },
  {
    eyebrow: "Buy for your business",
    title: "Bulk product sourcing",
    description:
      "Source finished products in commercial quantities with clearer specifications, quotations, and fulfilment stages.",
    href: "/sign-in?next=/projects/new",
    link: "Start bulk sourcing",
    icon: Boxes,
  },
  {
    eyebrow: "Equip your operation",
    title: "Machinery and equipment",
    description:
      "Define operational requirements and work with specialists to identify suitable manufacturers and machine specifications.",
    href: "/machine-sourcing-webinar",
    link: "Learn about machine sourcing",
    icon: PackageCheck,
  },
];

const testimonials = [
  {
    quote:
      "We had been burned by two previous China imports. Sure Imports delivered early with the correct power rating, and our production capacity is now up by 3.5x.",
    name: "Roberta Edu",
    role: "Founder, Moppet Foods",
  },
  {
    quote:
      "We needed 2,000 custom-branded items and received exactly what we envisioned. Pricing was transparent and even came in lower than expected.",
    name: "Chukwuedozie Nwokoye",
    role: "Business owner",
  },
  {
    quote:
      "Transparent, deeply knowledgeable, and trustworthy. The team listens closely and follows through with care.",
    name: "Chioma Ifeanyi-Eze",
    role: "Founder, Accountinghub & Fresh Eggs Market",
  },
];

const faqs = [
  {
    question: "What is the relationship between LineScout and Sure Imports?",
    answer:
      "LineScout is the digital sourcing workspace built by Sure Imports. You use LineScout to discover ideas, create briefs, communicate, review quotes, make eligible payments, and follow projects. Sure Imports provides the human sourcing and fulfilment expertise behind the execution.",
  },
  {
    question: "What can I source through LineScout?",
    answer:
      "You can begin projects for white-label products, bulk finished goods, machinery, equipment, branded merchandise, and other products that need supplier research or purchasing support in China.",
  },
  {
    question: "Do I work with AI or a real person?",
    answer:
      "Both are available. AI chat can help you clarify an early idea, while real sourcing specialists handle the work that requires supplier research, quotations, negotiation, purchasing, and fulfilment.",
  },
  {
    question: "Do I need a subscription to browse white-label ideas?",
    answer:
      "No. The public white-label catalogue can be browsed without a subscription. When you are ready to source a product, sign in and start a sourcing project.",
  },
  {
    question: "Can I see my quote, payments, and shipment in one place?",
    answer:
      "Yes. Your LineScout workspace keeps active projects, quotes, payment records, wallet information, shipment updates, and project conversations together.",
  },
  {
    question: "Can I track a shipment without signing in?",
    answer:
      "Yes. Use the public shipment tracker with your LineScout tracking number. Signed-in users can also see shipments connected to their projects.",
  },
];

export default async function HomePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("linescout_session")?.value || "";

  if (token) {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const session = await queryOne<RowDataPacket & { id: number }>(
      `
      SELECT id
      FROM linescout_user_sessions
      WHERE refresh_token_hash = ?
        AND revoked_at IS NULL
        AND expires_at > NOW()
      LIMIT 1
      `,
      [tokenHash],
    );
    if (session?.id) redirect("/projects/active");
  }

  let popularProducts: PopularProduct[] = [];
  try {
    popularProducts = await getPopularProducts();
  } catch (error) {
    console.error("Unable to load homepage white-label products", error);
  }

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };

  return (
    <main className="relative overflow-hidden bg-[#F5F6FA] text-neutral-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <section className="si-hero relative overflow-hidden">
        <div className="mx-auto grid w-full min-w-0 max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1.04fr_0.96fr] lg:px-8">
          <div className="min-w-0 max-w-full">
            <div className="inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] sm:px-4 sm:text-xs sm:tracking-[0.16em]">
              <Sparkles className="h-4 w-4" /> A Sure Imports sourcing workspace
            </div>
            <h1 className="mt-6 max-w-full break-words text-4xl font-black leading-[1.06] tracking-[-0.045em] text-white sm:text-5xl lg:text-6xl">
              From product idea to delivered goods, manage sourcing in one place.
            </h1>
            <p className="mt-6 max-w-2xl break-words text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">
              Discover opportunities, define exactly what you need, work with sourcing specialists in China, review
              quotes, make payments, and follow every project through shipping.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/sign-in"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-orange-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-orange-950/20 transition hover:bg-orange-600"
              >
                Start Sourcing <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/white-label"
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/20 bg-white/10 px-6 py-3 text-sm font-bold text-white backdrop-blur transition hover:bg-white/15"
              >
                View Products
              </Link>
            </div>
            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-300">
              {[
                "No subscription required to browse",
                "AI and human sourcing support",
                "Powered by Sure Imports",
              ].map((item) => (
                <span key={item} className="inline-flex items-center gap-2">
                  <Check className="h-4 w-4 text-orange-400" /> {item}
                </span>
              ))}
            </div>
          </div>

          <div className="relative mx-auto hidden w-full max-w-xl md:block lg:mx-0">
            <div className="absolute -inset-8 rounded-full bg-orange-500/10 blur-3xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-white/15 bg-slate-900 p-3 shadow-2xl shadow-black/40">
              <div className="flex items-center justify-between border-b border-white/10 px-3 pb-3">
                <div className="flex gap-1.5" aria-hidden="true">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                </div>
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Sourcing workspace
                </span>
              </div>
              <Image
                src="/hero.png"
                alt="LineScout sourcing dashboard showing a managed project"
                width={520}
                height={980}
                sizes="(min-width: 1024px) 520px, 90vw"
                className="mt-3 max-h-[34rem] w-full rounded-[1.4rem] object-cover object-top"
              />
            </div>
            <div className="absolute -bottom-5 -left-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-xl sm:-left-8">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-neutral-500">Project stage</p>
              <p className="mt-1 flex items-center gap-2 text-sm font-bold text-neutral-900">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Supplier sourcing
              </p>
            </div>
            <div className="absolute -right-2 top-16 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-xl sm:-right-8">
              <p className="flex items-center gap-2 text-sm font-bold text-neutral-900">
                <MessageCircle className="h-4 w-4 text-orange-500" /> Specialist connected
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto -mt-6 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-xl shadow-slate-900/10 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["1,000+", "white-label ideas"],
            ["13", "product categories"],
            ["AI + human", "sourcing guidance"],
            ["One workspace", "idea to delivery"],
          ].map(([value, label], index) => (
            <div
              key={label}
              className={`px-6 py-6 ${index > 0 ? "border-t border-slate-200 sm:border-l sm:border-t-0" : ""} ${index === 2 ? "sm:border-t lg:border-t-0" : ""}`}
            >
              <p className="text-2xl font-black tracking-tight text-neutral-900">{value}</p>
              <p className="mt-1 text-sm text-neutral-600">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-600">One connected system</p>
            <h2 className="mt-4 text-3xl font-black tracking-tight text-neutral-900 sm:text-4xl">
              Everything your sourcing project needs after “I have an idea.”
            </h2>
            <p className="mt-5 text-base leading-7 text-neutral-600">
              LineScout replaces scattered chats, forgotten requirements, and unclear payment stages with a workspace
              designed around the real China sourcing process.
            </p>
            <Link href="/sign-in" className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-orange-600">
              Enter the sourcing workspace <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {capabilities.map((item) => (
              <article key={item.title} className="group rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
                  <item.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 text-lg font-bold text-neutral-900">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-neutral-600">{item.description}</p>
                <Link href={item.href} className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-orange-600">
                  {item.cta} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      {popularProducts.length ? (
        <section className="border-y border-slate-200 bg-white py-20 lg:py-24">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-600">What people are exploring</p>
                <h2 className="mt-3 text-3xl font-black tracking-tight text-neutral-900 sm:text-4xl">
                  Most popular white-label products
                </h2>
                <p className="mt-3 max-w-2xl text-base text-neutral-600">
                  See the product ideas attracting the most attention, then open any idea for positioning, sourcing,
                  cost, and launch guidance.
                </p>
              </div>
              <Link
                href="/white-label"
                className="inline-flex shrink-0 items-center gap-2 text-sm font-bold text-orange-600"
              >
                Browse all 1,000+ ideas <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {popularProducts.map((product, index) => (
                <Link
                  key={product.id}
                  href={`/white-label/${product.slug}`}
                  className="group overflow-hidden rounded-3xl border border-slate-200 bg-neutral-50"
                >
                  <div className="relative flex aspect-[16/10] items-center justify-center overflow-hidden bg-white p-6">
                    {product.image_url ? (
                      <Image
                        src={product.image_url}
                        alt={product.product_name}
                        fill
                        sizes="(min-width: 1024px) 30vw, (min-width: 640px) 46vw, 92vw"
                        className="object-contain p-6 transition duration-300 group-hover:scale-[1.03]"
                      />
                    ) : null}
                    <span className="absolute left-4 top-4 rounded-full border border-slate-200 bg-white/95 px-3 py-1 text-[11px] font-bold text-neutral-700 shadow-sm">
                      #{index + 1} most popular
                    </span>
                  </div>
                  <div className="p-5">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-orange-600">{product.category}</p>
                    <h3 className="mt-2 text-lg font-bold text-neutral-900">{product.product_name}</h3>
                    {product.short_desc ? (
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-neutral-600">{product.short_desc}</p>
                    ) : null}
                    <div className="mt-4 flex items-center justify-between text-xs font-semibold text-neutral-500">
                      <span>{product.view_count.toLocaleString()} views</span>
                      <span className="inline-flex items-center gap-1 text-orange-600">
                        View idea <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-600">How LineScout works</p>
          <h2 className="mt-4 text-3xl font-black tracking-tight text-neutral-900 sm:text-4xl">
            A clear path from first question to final delivery
          </h2>
          <p className="mt-4 text-base leading-7 text-neutral-600">
            Every stage builds on the one before it, so specifications, decisions, costs, and conversations stay connected.
          </p>
        </div>
        <div className="relative mt-12 grid gap-4 lg:grid-cols-5">
          <div className="absolute left-[10%] right-[10%] top-8 hidden h-px bg-slate-200 lg:block" aria-hidden="true" />
          {workflow.map((item) => (
            <article key={item.step} className="relative rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg">
                <item.icon className="h-6 w-6" />
              </div>
              <p className="mt-5 text-xs font-black uppercase tracking-[0.2em] text-orange-600">Step {item.step}</p>
              <h3 className="mt-2 text-base font-bold text-neutral-900">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-neutral-600">{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-slate-950 py-20 text-white lg:py-24">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-3">
            {sourcingRoutes.map((route) => (
              <article key={route.title} className="rounded-[1.75rem] border border-white/10 bg-white/[0.06] p-7">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500 text-white">
                  <route.icon className="h-6 w-6" />
                </div>
                <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-orange-400">{route.eyebrow}</p>
                <h2 className="mt-2 text-2xl font-bold">{route.title}</h2>
                <p className="mt-3 text-sm leading-6 text-slate-300">{route.description}</p>
                <Link href={route.href} className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-white">
                  {route.link} <ArrowRight className="h-4 w-4 text-orange-400" />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8 lg:py-28">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-600">Built for continuity</p>
          <h2 className="mt-4 text-3xl font-black tracking-tight text-neutral-900 sm:text-4xl">
            Your project history does not disappear inside a chat thread.
          </h2>
          <p className="mt-5 text-base leading-7 text-neutral-600">
            LineScout preserves the context behind every sourcing decision. Return to the brief, project stage, quote,
            payment record, shipment, or specialist conversation whenever you need it.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {[
              [ShieldCheck, "Structured project records", "Requirements and milestones stay attached to the right project."],
              [MessageCircle, "Human support in context", "Specialists see the sourcing history instead of asking you to start over."],
              [BadgeCheck, "Clear quote stages", "Product and shipping balances are presented separately and transparently."],
              [RefreshCcw, "Simpler repeat orders", "Past project information gives the next order a stronger starting point."],
            ].map(([Icon, title, description]) => {
              const FeatureIcon = Icon as typeof ShieldCheck;
              return (
                <div key={String(title)} className="rounded-2xl border border-slate-200 bg-white p-5">
                  <FeatureIcon className="h-5 w-5 text-orange-600" />
                  <h3 className="mt-3 text-sm font-bold text-neutral-900">{String(title)}</h3>
                  <p className="mt-1 text-sm leading-6 text-neutral-600">{String(description)}</p>
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-xl shadow-slate-900/10 sm:p-7">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600">Active project</p>
              <h3 className="mt-1 text-xl font-bold text-neutral-900">Custom product sourcing</h3>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">In progress</span>
          </div>
          <div className="mt-7 space-y-5">
            {[
              ["Brief received", "Requirements and destination confirmed", true],
              ["Specialist assigned", "Supplier research and clarification", true],
              ["Quote prepared", "Product, logistics, and payment stages", true],
              ["Production", "Begins after quote approval", false],
              ["Shipment tracking", "Updates through final delivery", false],
            ].map(([title, description, complete], index) => (
              <div key={String(title)} className="relative flex gap-4">
                {index < 4 ? <div className="absolute left-[15px] top-8 h-9 w-px bg-slate-200" /> : null}
                <span
                  className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    complete ? "bg-emerald-500 text-white" : "border border-slate-300 bg-white text-neutral-400"
                  }`}
                >
                  {complete ? <Check className="h-4 w-4" /> : <span className="h-2 w-2 rounded-full bg-current" />}
                </span>
                <div>
                  <p className="text-sm font-bold text-neutral-900">{String(title)}</p>
                  <p className="mt-1 text-sm text-neutral-600">{String(description)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white py-20 lg:py-24">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-600">Proven sourcing experience</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-neutral-900 sm:text-4xl">
                Backed by the Sure Imports team
              </h2>
            </div>
            <div className="flex items-center gap-2 text-sm font-bold text-neutral-900">
              <span className="flex text-amber-400" aria-label="Five stars">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Star key={index} className="h-4 w-4 fill-current" />
                ))}
              </span>
              4.8/5 from 90+ Google reviews
            </div>
          </div>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {testimonials.map((testimonial) => (
              <figure key={testimonial.name} className="rounded-3xl border border-slate-200 bg-neutral-50 p-6">
                <div className="flex text-amber-400" aria-hidden="true">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star key={index} className="h-4 w-4 fill-current" />
                  ))}
                </div>
                <blockquote className="mt-5 text-sm leading-7 text-neutral-700">“{testimonial.quote}”</blockquote>
                <figcaption className="mt-6 border-t border-slate-200 pt-4">
                  <p className="text-sm font-bold text-neutral-900">{testimonial.name}</p>
                  <p className="mt-1 text-xs text-neutral-500">{testimonial.role}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-4xl px-4 py-20 sm:px-6 lg:py-28">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-600">Frequently asked questions</p>
          <h2 className="mt-4 text-3xl font-black tracking-tight text-neutral-900 sm:text-4xl">
            Before you start sourcing
          </h2>
        </div>
        <div className="mt-10 space-y-3">
          {faqs.map((faq) => (
            <details key={faq.question} className="group rounded-2xl border border-slate-200 bg-white shadow-sm">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-5 px-5 py-5 text-left text-base font-bold text-neutral-900 sm:px-6">
                {faq.question}
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-50 text-orange-600 transition group-open:rotate-180">
                  <ChevronDown className="h-4 w-4" />
                </span>
              </summary>
              <div className="border-t border-slate-100 px-5 py-5 text-sm leading-7 text-neutral-600 sm:px-6">
                {faq.answer}
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="px-4 pb-20 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl overflow-hidden rounded-[2rem] bg-slate-950 px-6 py-12 text-center text-white sm:px-10 lg:py-16">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-400">Ready when you are</p>
          <h2 className="mx-auto mt-4 max-w-3xl text-3xl font-black tracking-tight sm:text-4xl">
            Bring the idea. LineScout and Sure Imports will help you move it forward.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-300">
            Start a sourcing project or explore the white-label catalogue until you find the right opportunity.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/sign-in"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-orange-500 px-6 py-3 text-sm font-bold text-white hover:bg-orange-600"
            >
              Start Sourcing <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/white-label"
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/20 bg-white/10 px-6 py-3 text-sm font-bold text-white hover:bg-white/15"
            >
              View Products
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
