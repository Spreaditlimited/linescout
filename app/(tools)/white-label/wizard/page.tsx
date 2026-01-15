"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import TokenPanel from "@/components/TokenPanel";

type Category =
  | "Electronics"
  | "Beauty"
  | "Home Goods"
  | "Fashion"
  | "Food & Beverage"
  | "Other";

export default function WhiteLabelWizard() {
    const stepsTotal = 5;
    const router = useRouter();
    const [step, setStep] = useState(1);
    const [category, setCategory] = useState<Category | "">("");
    const [productName, setProductName] = useState("");
    const [productDesc, setProductDesc] = useState("");
    const [referenceLink, setReferenceLink] = useState("");
    const [noLink, setNoLink] = useState(false);
    const [quantityTier, setQuantityTier] = useState<"test" | "scale" | "">("");
    const [brandingLevel, setBrandingLevel] = useState<"logo" | "packaging" | "mould" | "">("");
    const [targetLandedCost, setTargetLandedCost] = useState("");
    const [sourcingToken, setSourcingToken] = useState("");

  const [customerEmail, setCustomerEmail] = useState("");
  const [customerWhatsapp, setCustomerWhatsapp] = useState("");
  const [isActivating, setIsActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successFirstName, setSuccessFirstName] = useState("there");

const canNext = useMemo(() => {
  if (step === 1) return category !== "";

  if (step === 2) {
    const nameOk = productName.trim().length >= 3;
    const descOk = productDesc.trim().length >= 10;
    const linkOk = noLink || referenceLink.trim().length >= 8;
    return nameOk && descOk && linkOk;
  }

  if (step === 3) {
    return quantityTier !== "" && brandingLevel !== "";
  }

  if (step === 4) {
    // allow commas/spaces in user input
    const cleaned = targetLandedCost.replace(/[, ]/g, "");
    const n = Number(cleaned);
    const isNumber = Number.isFinite(n);

    // basic sanity: must be >= ₦100 and <= ₦500,000 per unit
    return isNumber && n >= 100 && n <= 500000;
  }

  return true;
}, [
  step,
  category,
  productName,
  productDesc,
  referenceLink,
  noLink,
  quantityTier,
  brandingLevel,
  targetLandedCost,
]);

const whiteLabelContext = `
WHITE LABEL PROJECT BRIEF

Category: ${category || "N/A"}
Product name: ${productName || "N/A"}

Description:
${productDesc || "N/A"}

Reference link:
${referenceLink || (noLink ? "No reference link provided" : "N/A")}

Quantity tier: ${
  quantityTier === "test"
    ? "Test run (50–200 units)"
    : quantityTier === "scale"
      ? "Scale run (1,000+ units)"
      : "N/A"
}

Branding level: ${
  brandingLevel === "logo"
    ? "Logo only"
    : brandingLevel === "packaging"
      ? "Custom packaging"
      : brandingLevel === "mould"
        ? "Full custom mould"
        : "N/A"
}

Target landed cost: ${targetLandedCost ? `₦${targetLandedCost}` : "N/A"}
`.trim();

  return (
    <main className="relative h-full min-h-0 overflow-hidden bg-neutral-950 text-white">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(900px_circle_at_20%_10%,rgba(59,130,246,0.16),transparent_55%),radial-gradient(900px_circle_at_80%_25%,rgba(34,197,94,0.12),transparent_55%)]" />
        <div className="absolute inset-0 bg-neutral-950/75" />
      </div>

      <div className="relative mx-auto flex h-full min-h-0 max-w-3xl flex-col px-6 py-10 overflow-y-auto">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-white/60">White Label Project Wizard</p>
            <h1 className="mt-1 text-lg font-semibold tracking-tight">
              Step {step} of {stepsTotal}
            </h1>
          </div>

          <div className="w-44">
            <div className="h-2 w-full rounded-full bg-white/10">
              <div
                className="h-2 rounded-full bg-white"
                style={{ width: `${(step / stepsTotal) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Card */}
        <div className="mt-10 rounded-3xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur-xl md:p-8">
          {step === 1 && (
  <div>
    <h2 className="text-2xl font-semibold tracking-tight">Choose your product category</h2>
    <p className="mt-3 text-sm leading-relaxed text-white/70">
      This helps us route your project to the right specialist. If you’re not sure, pick the closest option.
    </p>

    <div className="mt-6 grid gap-3 sm:grid-cols-2">
      <CategoryCard
        title="Electronics"
        selected={category === "Electronics"}
        onClick={() => setCategory("Electronics")}
      />
      <CategoryCard
        title="Beauty"
        selected={category === "Beauty"}
        onClick={() => setCategory("Beauty")}
      />
      <CategoryCard
        title="Home Goods"
        selected={category === "Home Goods"}
        onClick={() => setCategory("Home Goods")}
      />
      <CategoryCard
        title="Fashion"
        selected={category === "Fashion"}
        onClick={() => setCategory("Fashion")}
      />
      <CategoryCard
        title="Food & Beverage"
        selected={category === "Food & Beverage"}
        onClick={() => setCategory("Food & Beverage")}
      />
      <CategoryCard
        title="Other"
        selected={category === "Other"}
        onClick={() => setCategory("Other")}
      />
    </div>
  </div>
)}

{step === 2 && (
  <div>
    <h2 className="text-2xl font-semibold tracking-tight">Define the product clearly</h2>
    <p className="mt-3 text-sm leading-relaxed text-white/70">
      The goal is to remove guessing. A strong reference link makes quoting faster and more accurate.
    </p>

    <div className="mt-6 space-y-4">
      <Field label="Product name (what you call it)">
        <input
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            className="w-full rounded-2xl bg-white/5 px-4 py-3 text-sm text-white ring-1 ring-white/10 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-white/30"
            placeholder="Example: 20,000mAh power bank with fast charge"
            />
      </Field>

      <Field label="Short description (key features)">
        <textarea
            rows={4}
            value={productDesc}
            onChange={(e) => setProductDesc(e.target.value)}
            className="w-full resize-none rounded-2xl bg-white/5 px-4 py-3 text-sm text-white ring-1 ring-white/10 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-white/30"
            placeholder="Example: Type-C input, dual output, LED battery display, matte finish, 2-year shelf life..."
            />
      </Field>

      <Field label="Reference link (Amazon / Alibaba / AliExpress)">
        <input
            value={referenceLink}
            onChange={(e) => setReferenceLink(e.target.value)}
            className="w-full rounded-2xl bg-white/5 px-4 py-3 text-sm text-white ring-1 ring-white/10 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-white/30"
            placeholder="Paste a link that shows the closest product you want"
            />

            <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
            <input
                id="nolink"
                type="checkbox"
                checked={noLink}
                onChange={(e) => setNoLink(e.target.checked)}
                className="h-4 w-4"
            />
            <label htmlFor="nolink" className="text-sm text-white/70">
                I don’t have a reference link. I already described the specs clearly.
            </label>
            </div>
      </Field>

      <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
        <p className="text-sm font-semibold">Quick note</p>
        <p className="mt-1 text-sm text-white/65">
          If you don’t have a link, describe size, material, color, and packaging as clearly as you can.
          The more precise your brief is, the fewer mistakes happen during sampling and production.
        </p>
      </div>
    </div>
  </div>
)}

{step === 3 && (
  <div>
    <h2 className="text-2xl font-semibold tracking-tight">
      Quantity and branding depth
    </h2>
    <p className="mt-3 text-sm leading-relaxed text-white/70">
      These choices determine MOQ, tooling cost, and production timeline.
    </p>

    <div className="mt-6 space-y-8">
      {/* Quantity */}
      <div>
        <p className="text-sm font-semibold text-white/80">Production quantity</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <OptionCard
            title="Test run (50–200 units)"
            desc="Used for market testing or pilot launches."
            selected={quantityTier === "test"}
            onClick={() => setQuantityTier("test")}
          />
          <OptionCard
            title="Scale run (1,000+ units)"
            desc="Factory-optimized pricing and stable supply."
            selected={quantityTier === "scale"}
            onClick={() => setQuantityTier("scale")}
          />
        </div>
      </div>

      {/* Branding */}
      <div>
        <p className="text-sm font-semibold text-white/80">Branding level</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <OptionCard
            title="Logo only"
            desc="Your logo printed on an existing product."
            selected={brandingLevel === "logo"}
            onClick={() => setBrandingLevel("logo")}
          />
          <OptionCard
            title="Custom packaging"
            desc="Branded box, inserts, and presentation."
            selected={brandingLevel === "packaging"}
            onClick={() => setBrandingLevel("packaging")}
          />
          <OptionCard
            title="Full custom mould"
            desc="New product shape or tooling. Higher MOQ."
            selected={brandingLevel === "mould"}
            onClick={() => setBrandingLevel("mould")}
          />
        </div>
      </div>

      {brandingLevel === "mould" && (
        <div className="rounded-2xl bg-amber-500/10 p-4 ring-1 ring-amber-400/30">
          <p className="text-sm font-semibold text-amber-200">
            Important note
          </p>
          <p className="mt-1 text-sm text-amber-100/80">
            Full custom moulds usually require higher MOQs, tooling fees, and
            longer lead times. This will be discussed during sourcing.
          </p>
        </div>
      )}
    </div>
  </div>
)}

{step === 4 && (
  <div>
    <h2 className="text-2xl font-semibold tracking-tight">
      What is your target landed cost per unit?
    </h2>
    <p className="mt-3 text-sm leading-relaxed text-white/70">
      This is your maximum cost per unit after shipping and clearing into Nigeria. If the target is
      unrealistic, we will tell you early to avoid wasted time and money.
    </p>

    <div className="mt-6 space-y-4">
      <Field label="Target landed cost (₦)">
        <div className="flex items-center gap-3 rounded-2xl bg-white/5 px-4 py-3 ring-1 ring-white/10 focus-within:ring-2 focus-within:ring-white/30">
          <span className="text-sm font-semibold text-white/60">₦</span>
          <input
            inputMode="numeric"
            value={targetLandedCost}
            onChange={(e) => setTargetLandedCost(e.target.value)}
            className="w-full bg-transparent text-sm text-white placeholder:text-white/35 focus:outline-none"
            placeholder="Example: 8500"
          />
        </div>
      </Field>
      <p className="mt-3 text-sm text-white/60">
        Not sure what to enter? Use our{" "}
        <a
            href="https://sureimports.com/tools/landed-cost-estimator"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-white underline underline-offset-4 hover:text-white/90"
        >
            landed cost estimator
        </a>{" "}
        to calculate a realistic figure, then return here.
        </p>

      <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
        <p className="text-sm font-semibold">Nigeria reality check</p>
        <p className="mt-1 text-sm text-white/65">
          Landed cost can jump due to exchange rate movement, port delays, duties, and inland
          logistics. Your target should have buffer, not wishful thinking.
        </p>
      </div>
    </div>
  </div>
)}


{step === 5 && (
  <div>
    <h2 className="text-2xl font-semibold tracking-tight">Review your Project File</h2>
    <p className="mt-3 text-sm leading-relaxed text-white/70">
      Confirm everything is correct. This summary is what your specialist will receive after payment.
    </p>

    <div className="mt-6 rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-xs font-semibold text-white/60">Project File</p>
          <p className="mt-1 text-lg font-semibold text-white/90">White Label Sourcing Brief</p>
          <p className="mt-1 text-sm text-white/60">
            Category: <span className="text-white/80">{category || "—"}</span>
          </p>
        </div>

        <div className="rounded-2xl bg-white/10 px-3 py-2 text-xs font-semibold text-white/70 ring-1 ring-white/10">
          Pre-payment
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <SummaryItem label="Product name" value={productName || "—"} />
        <SummaryItem
          label="Quantity tier"
          value={
            quantityTier
              ? quantityTier === "test"
                ? "Test run (50–200)"
                : "Scale run (1,000+)"
              : "—"
          }
        />
        <SummaryItem
          label="Branding level"
          value={
            brandingLevel
              ? brandingLevel === "logo"
                ? "Logo only"
                : brandingLevel === "packaging"
                  ? "Custom packaging"
                  : "Full custom mould"
              : "—"
          }
        />
        <SummaryItem
          label="Target landed cost"
          value={targetLandedCost ? `₦${targetLandedCost}` : "—"}
        />
      </div>

      <div className="mt-4 rounded-2xl bg-neutral-950/40 p-4 ring-1 ring-white/10">
        <p className="text-sm font-semibold text-white/85">Product description</p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/70">
          {productDesc || "—"}
        </p>
      </div>

      <div className="mt-4 rounded-2xl bg-neutral-950/40 p-4 ring-1 ring-white/10">
        <p className="text-sm font-semibold text-white/85">Reference link</p>
        {referenceLink ? (
          <a
            href={referenceLink}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 block break-all text-sm font-semibold text-white underline underline-offset-4 hover:text-white/90"
          >
            {referenceLink}
          </a>
        ) : (
          <p className="mt-2 text-sm text-white/70">
            {noLink ? "No link provided (user described specs clearly)." : "—"}
          </p>
        )}
      </div>

      <div className="mt-6 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-xs font-semibold text-white/60">Project Activation Deposit</p>
            <p className="mt-1 text-2xl font-semibold">₦100,000</p>
            <p className="mt-1 text-sm text-white/60">
              Fully credited to your first production order after sourcing starts.
            </p>
          </div>
          <div className="rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white/70 ring-1 ring-white/10">
            Refundable
          </div>
        </div>
      </div>

      <div className="mt-6">
        <TokenPanel prefillContext={whiteLabelContext} />
     </div>

        <p className="text-center text-xs text-white/55">
          Pay on Paystack. Check your email for your token.
        </p>
      </div>
  </div>
)}


          {/* Nav */}
          <div className="mt-10 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                if (step === 1) {
                  router.push("/white-label");
                } else {
                  setStep((s) => s - 1);
                }
              }}
              className="inline-flex items-center gap-2 rounded-2xl bg-white/5 px-5 py-3 text-sm font-semibold text-white ring-1 ring-white/10 hover:bg-white/10"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>

            {step < 5 && (
        <button
            type="button"
            onClick={() => setStep((s) => Math.min(stepsTotal, s + 1))}
            disabled={!canNext}
            className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-neutral-950 hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
            Next
            <ArrowRight className="h-4 w-4" />
        </button>
        )}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-white/50">
          You’ll review your Project File before any payment.
        </p>
      </div>
    </main>
  );
}

function CategoryCard({
  title,
  selected,
  onClick,
}: {
  title: Category;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full rounded-2xl p-4 text-left ring-1 transition",
        selected
          ? "bg-white text-neutral-950 ring-white"
          : "bg-white/5 text-white ring-white/10 hover:bg-white/10",
      ].join(" ")}
    >
      <p className={selected ? "text-sm font-semibold" : "text-sm font-semibold text-white/90"}>
        {title}
      </p>
      <p className={selected ? "mt-1 text-xs text-neutral-700" : "mt-1 text-xs text-white/60"}>
        Select this category
      </p>
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-white/80">{label}</label>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function OptionCard({
  title,
  desc,
  selected,
  onClick,
}: {
  title: string;
  desc: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full rounded-2xl p-4 text-left ring-1 transition",
        selected
          ? "bg-white text-neutral-950 ring-white"
          : "bg-white/5 text-white ring-white/10 hover:bg-white/10",
      ].join(" ")}
    >
      <p className={selected ? "text-sm font-semibold" : "text-sm font-semibold text-white/90"}>
        {title}
      </p>
      <p className={selected ? "mt-1 text-xs text-neutral-700" : "mt-1 text-xs text-white/60"}>
        {desc}
      </p>
    </button>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-neutral-950/40 p-4 ring-1 ring-white/10">
      <p className="text-xs font-semibold text-white/60">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white/85">{value}</p>
    </div>
  );
}