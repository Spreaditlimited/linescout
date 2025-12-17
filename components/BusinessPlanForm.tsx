"use client";

import React, { useState } from "react";
import { callN8nWebhook } from "@/lib/n8n";

type Intake = {
  businessName: string;
  country: string;
  city: string;
  productLine: string;
  capacity: string;
  targetCustomers: string;
  startupCapital: number | "";
  ownerContribution: number | "";
  loanAmount: number | "";
  loanTenorYears: number | "";
  equityPartners: boolean;
  existingExperience: string;
  distributionChannels: string;
  pricingApproach: string;
  uniqueAngle: string;
  extraNotes: string;
};

type ResultState = {
  ok: boolean;
  canGenerate?: boolean;
  consumed?: boolean;
  message?: string;
  error?: string;
  code?: string;
  token?: string;
  type?: string;
  currency?: string;
  exchangeRate?: number;
  intake?: {
    businessName?: string;
    [key: string]: any;
  };
  planText?: string;
};

type Purpose =
  | "loan"
  | "investor"
  | "internal"
  | "grant"
  | "other";

export default function BusinessPlanForm() {
  const [token, setToken] = useState("");
  const [purpose, setPurpose] = useState<Purpose>("loan");
  const [currency, setCurrency] = useState<"NGN" | "USD">("NGN");
  const [exchangeRate, setExchangeRate] = useState<string>("1500");

  const [intake, setIntake] = useState<Intake>({
    businessName: "",
    country: "Nigeria",
    city: "",
    productLine: "",
    capacity: "",
    targetCustomers: "",
    startupCapital: "",
    ownerContribution: "",
    loanAmount: "",
    loanTenorYears: "",
    equityPartners: false,
    existingExperience: "",
    distributionChannels: "",
    pricingApproach: "",
    uniqueAngle: "",
    extraNotes: "",
  });

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<number>(0);
  const [result, setResult] = useState<ResultState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tokenUsed, setTokenUsed] = useState(false);

  function updateField<K extends keyof Intake>(key: K, value: Intake[K]) {
    setIntake((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  async function handleDownload(format: "pdf" | "docx") {
    try {
      if (!result || !result.planText || !result.planText.trim()) {
        alert("Please generate a plan first before downloading.");
        return;
      }

      const fileName =
        intake.businessName.trim() || "linescout-business-plan";

      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planText: result.planText,
          format,
          fileName,
        }),
      });

      if (!response.ok) {
        console.error("Export error:", response.status);
        alert("Could not export file. Please try again.");
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download =
        format === "pdf" ? `${fileName}.pdf` : `${fileName}.docx`;

      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
      alert("Something went wrong while downloading the file.");
    }
  }
  async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  setError(null);
  setResult(null);
  setProgress(0);

  // Basic front-end validation
  if (!token.trim()) {
    setError("Please paste your valid business plan token.");
    return;
  }

  if (!intake.businessName || !intake.productLine) {
    setError("Please fill in at least the business name and project / product line.");
    return;
  }

  try {
    setLoading(true);
    setProgress(20);

    const payload = {
      token: token.trim(),
      type: "business_plan",
      currency,
      exchangeRate: currency === "NGN" ? exchangeRate : undefined,
      purpose,
      format: "both",
      intake: {
        ...intake,
        startupCapital:
          intake.startupCapital === "" ? 0 : Number(intake.startupCapital),
        ownerContribution:
          intake.ownerContribution === "" ? 0 : Number(intake.ownerContribution),
        loanAmount:
          intake.loanAmount === "" ? 0 : Number(intake.loanAmount),
        loanTenorYears:
          intake.loanTenorYears === "" ? 0 : Number(intake.loanTenorYears),
      },
    };

    const response = await callN8nWebhook(
      "/webhook/linescout_business_plan",
      payload
    );

    setProgress(60);

    const next: ResultState = {
      ok: Boolean(response.ok),
      canGenerate: response.canGenerate,
      consumed: response.consumed,
      message: response.message,
      error: response.error,
      code: response.code,
      token: response.token,
      type: response.type,
      currency: response.currency,
      exchangeRate: response.exchangeRate,
      intake: response.intake,
      planText: response.planText,
    };

       // Handle failure / invalid token / already-used token
    if (!next.ok || !next.planText) {
      const rawMsg =
        (typeof next.error === "string" && next.error) ||
        (typeof next.message === "string" && next.message) ||
        "";

      const lc = rawMsg.toLowerCase();
      let friendlyError = "";

      // Invalid / expired token
      if (
        lc.includes("invalid or expired") ||      // matches "Invalid or expired token."
        lc.includes("invalid token") ||
        lc.includes("token not found") ||
        lc.includes("token not valid") ||
        lc.includes("token invalid")
      ) {
        friendlyError =
          "This business plan token is not valid or has expired. Please double-check it or get a new token.";
      }
      // Already-used token
      else if (
        lc.includes("already used") ||
        lc.includes("already been used")
      ) {
        friendlyError =
          "This business plan token has already been used to generate a plan. Each LineScout token is single-use. Please purchase a new token to generate another business plan.";
      }
      // Generic failure
      else {
        friendlyError =
          rawMsg ||
          "LineScout could not generate a plan. Please check your token and details, then try again.";
      }

      setError(friendlyError);
      setResult(next);
      setProgress(0);
      return;
    }

    // ✅ Success – we have a plan
    setResult(next);
    setError(null);
    setProgress(100);
    setTokenUsed(true);
  } catch (err: any) {
    console.error("Business plan error:", err);
    setError("Something went wrong while talking to LineScout backend.");
    setProgress(0);
  } finally {
    setLoading(false);
  }
}

  const showLoanFields = purpose === "loan" || purpose === "investor";

  return (
    <div className="w-full max-w-3xl mx-auto rounded-2xl border border-slate-800 bg-slate-950/60 p-6 sm:p-8 shadow-xl shadow-black/40">
      <h2 className="text-2xl font-semibold text-slate-50 mb-2">
        LineScout Business Plan Writer
      </h2>
      <p className="text-sm text-slate-300 mb-6">
        Paste your LineScout business plan token, fill in your project details,
        and let LineScout draft a full, bank-ready business plan tailored to
        Nigeria.
      </p>

      {/* Get token helper */}
    
<div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-200">
  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    
    {/* Text section */}
    <div className="space-y-1">
      <p className="font-semibold text-slate-50">
        Don’t have a token yet?
      </p>
      <p className="text-slate-300 text-sm leading-relaxed">
        To generate your business plan, click the button below to pay 
        <span className="font-semibold text-slate-50"> ₦20,000</span> via Paystack.
        You will receive a unique business plan token in the email address you provide.
        Then come back here and paste the token to continue.
      </p>
    </div>

    {/* Button section */}
    <a
  href="https://paystack.shop/pay/linescoutbusinessplan"
  target="_blank"
  rel="noreferrer"
  className="
    inline-flex items-center justify-center
    rounded-xl
    bg-emerald-500/15
    px-5 py-2.5
    text-sm font-semibold
    text-emerald-100
    ring-1 ring-emerald-400/35
    hover:bg-emerald-500/20
    transition-colors
    whitespace-nowrap
  "
>
  Get your token
</a>

  </div>
</div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Token */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-200">
            Business plan token
          </label>
          <input
            type="text"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            placeholder="Paste token from your email, e.g. BP-XXXXXX-YYYYY"
          />
        </div>

        {/* Purpose & currency */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-200">
              Purpose of business plan
            </label>
            <select
  value={purpose}
  onChange={(e) => setPurpose(e.target.value as Purpose)}
  className="
    w-full
    h-10                /* ⬅ ensures same height as currency select */
    rounded-lg
    border border-slate-700
    bg-slate-900
    px-3
    text-sm text-slate-50
    focus:outline-none
    focus:ring-2 focus:ring-emerald-500
    focus:border-emerald-500
  "
>
  <option value="loan">Bank loan / financing</option>
  <option value="investor">Investor funding</option>
  <option value="internal">Internal planning</option>
  <option value="grant">Grant / donor funding</option>
  <option value="other">Other purpose</option>
</select>
          </div>

          <div className="space-y-2">
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
  {/* Currency */}
  <div className="space-y-2">
    <label className="block text-sm font-medium text-slate-200">
      Currency
    </label>

    <select
      value={currency}
      onChange={(e) =>
        setCurrency(e.target.value as "NGN" | "USD")
      }
      className="
        w-full h-11 rounded-lg border border-slate-700
        bg-slate-900 px-3 text-sm text-slate-50
        focus:outline-none focus:ring-2 focus:ring-emerald-500
        focus:border-emerald-500
      "
    >
      <option value="NGN">NGN</option>
      <option value="USD">USD</option>
    </select>
  </div>

  {/* Exchange Rate - only show if NGN */}
  {currency === "NGN" && (
    <div className="space-y-2 sm:col-span-2">
      <label className="block text-sm font-medium text-slate-200">
        Exchange rate (₦ per $1)
      </label>

      <input
        type="number"
        value={exchangeRate}
        onChange={(e) => setExchangeRate(e.target.value)}
        placeholder="1500"
        className="
          w-full h-11 rounded-lg border border-slate-700
          bg-slate-900 px-3 text-sm text-slate-50
          focus:outline-none focus:ring-2 focus:ring-emerald-500
          focus:border-emerald-500
        "
      />
    </div>
  )}
</div>
          </div>
        </div>

        {/* Basic info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-200">
              Business name
            </label>
            <input
              type="text"
              value={intake.businessName}
              onChange={(e) => updateField("businessName", e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              placeholder="Spreadit Limited"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-200">
              City & country
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={intake.city}
                onChange={(e) => updateField("city", e.target.value)}
                className="w-1/2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="Lagos"
              />
              <input
                type="text"
                value={intake.country}
                onChange={(e) => updateField("country", e.target.value)}
                className="w-1/2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="Nigeria"
              />
            </div>
          </div>
        </div>

        {/* Line & capacity */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-200">
              Product line / project
            </label>
            <input
              type="text"
              value={intake.productLine}
              onChange={(e) => updateField("productLine", e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              placeholder="Groundnut/Peanut Oil Extraction Line"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-200">
              Planned capacity
            </label>
            <input
              type="text"
              value={intake.capacity}
              onChange={(e) => updateField("capacity", e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              placeholder="5 tons per day"
            />
          </div>
        </div>

        {/* Customers & channels */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-200">
            Target customers
          </label>
          <input
            type="text"
            value={intake.targetCustomers}
            onChange={(e) => updateField("targetCustomers", e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            placeholder="Wholesalers, supermarkets, bulk buyers"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-200">
            Distribution channels
          </label>
          <input
            type="text"
            value={intake.distributionChannels}
            onChange={(e) => updateField("distributionChannels", e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            placeholder="Open markets, supermarkets, wholesalers"
          />
        </div>

        {/* Pricing & unique angle */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-200">
              Pricing approach
            </label>
            <input
              type="text"
              value={intake.pricingApproach}
              onChange={(e) => updateField("pricingApproach", e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              placeholder="Slightly below imported oil, premium packaging"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-200">
              Unique angle
            </label>
            <input
              type="text"
              value={intake.uniqueAngle}
              onChange={(e) => updateField("uniqueAngle", e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              placeholder="Locally processed, healthier oil, transparent sourcing"
            />
          </div>
        </div>

        {/* Money section – shown only when relevant */}
        {showLoanFields && (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="space-y-2 sm:col-span-2">
              <label className="block text-sm font-medium text-slate-200">
                Total project cost (startup capital) in {currency}
              </label>
              <input
                type="number"
                value={intake.startupCapital}
                onChange={(e) =>
                  updateField(
                    "startupCapital",
                    e.target.value === "" ? "" : Number(e.target.value)
                  )
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="150000000"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-200">
                Owner contribution ({currency})
              </label>
              <input
                type="number"
                value={intake.ownerContribution}
                onChange={(e) =>
                  updateField(
                    "ownerContribution",
                    e.target.value === "" ? "" : Number(e.target.value)
                  )
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="30000000"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-200">
                Loan amount ({currency})
              </label>
              <input
                type="number"
                value={intake.loanAmount}
                onChange={(e) =>
                  updateField(
                    "loanAmount",
                    e.target.value === "" ? "" : Number(e.target.value)
                  )
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="120000000"
              />
            </div>
          </div>
        )}

        {showLoanFields && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-200">
                Loan tenor (years)
              </label>
              <input
                type="number"
                value={intake.loanTenorYears}
                onChange={(e) =>
                  updateField(
                    "loanTenorYears",
                    e.target.value === "" ? "" : Number(e.target.value)
                  )
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="5"
              />
            </div>

            <div className="space-y-2">
  <label className="block text-sm font-medium text-slate-200">
    Equity partners involved?
  </label>

  <select
    value={intake.equityPartners ? "yes" : "no"}
    onChange={(e) =>
      updateField("equityPartners", e.target.value === "yes")
    }
    className="
      w-full
      h-9                  /* ⬅ Ensures same height as Purpose dropdown */
      rounded-lg
      border border-slate-700
      bg-slate-900
      px-3
      text-sm text-slate-50
      focus:outline-none
      focus:ring-2 focus:ring-emerald-500
      focus:border-emerald-500
    "
  >
    <option value="no">No</option>
    <option value="yes">Yes</option>
  </select>
</div>
          </div>
        )}

        {/* Experience & notes */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-200">
            Existing experience
          </label>
          <textarea
            value={intake.existingExperience}
            onChange={(e) => updateField("existingExperience", e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            rows={2}
            placeholder="We already run a kulikuli business..."
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-200">
            Extra notes
          </label>
          <textarea
            value={intake.extraNotes}
            onChange={(e) => updateField("extraNotes", e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            rows={2}
            placeholder="Focus on Lagos and Ogun first, then expand..."
          />
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-700 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        {/* Progress bar */}
        {loading && (
          <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {tokenUsed ? (
  <div
    className="
      w-full
      rounded-xl
      border border-emerald-600
      bg-emerald-500/5
      px-4 py-3
      sm:px-5 sm:py-4
      flex flex-col sm:flex-row
      sm:items-center sm:justify-between
      gap-3
    "
  >
    <div className="flex items-start gap-2">
      <div className="mt-0.5 h-6 w-6 flex items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300 text-sm">
        ✓
      </div>
      <div>
        <p className="text-sm sm:text-base font-semibold text-emerald-200">
          Your business plan is ready.
        </p>
        <p className="mt-1 text-xs sm:text-sm text-emerald-100/80">
          This token has now been used. To write another plan, please get a new token.
        </p>
      </div>
    </div>

    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
      <a
        href="https://paystack.shop/pay/linescoutbusinessplan"
        target="_blank"
        rel="noreferrer"
        className="
          inline-flex items-center justify-center
          rounded-xl
          bg-emerald-500/15
          px-4 py-2
          text-sm font-semibold
          text-emerald-100
          ring-1 ring-emerald-400/35
          hover:bg-emerald-500/20
          transition-colors
        "
      >
        Get new token
      </a>

      <button
        type="button"
        onClick={() => window.location.reload()}
        className="
          inline-flex items-center justify-center
          rounded-xl
          bg-emerald-500/15
          px-4 py-2
          text-sm font-semibold
          text-emerald-100
          ring-1 ring-emerald-400/35
          hover:bg-emerald-500/20
          transition-colors
        "
      >
        Start another plan
      </button>
    </div>
  </div>
) : (
  <button
    type="submit"
    disabled={loading || tokenUsed}
    className="
      w-full sm:w-auto
      inline-flex items-center justify-center
      rounded-xl
      bg-emerald-500/15
      px-4 py-2
      text-sm font-semibold
      text-emerald-100
      ring-1 ring-emerald-400/35
      hover:bg-emerald-500/20
      disabled:opacity-60 disabled:cursor-not-allowed
      transition-colors
    "
  >
    {loading ? "Writing plan..." : "Write business plan"}
  </button>
)}
      </form>

      {/* Result */}
      {result && result.ok && result.planText && (
        <div className="mt-8 space-y-4">
          <div className="rounded-lg border border-emerald-600 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            <p className="font-semibold">
              Your business plan is ready.
            </p>
            <p className="text-emerald-100/80">
              You can review the preview below or download it as DOCX.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => handleDownload("docx")}
              className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-50 hover:border-emerald-500 hover:text-emerald-300"
            >
              Download DOCX
            </button>
                {/*
                <button
                type="button"
                onClick={() => handleDownload("pdf")}
                className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-50 hover:border-emerald-500 hover:text-emerald-300"
                >
                Download PDF
                </button>
                */}
          </div>

          <div className="mt-2 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 max-h-[480px] overflow-y-auto">
            <h3 className="text-base font-semibold text-slate-50 mb-3">
              Plan preview
            </h3>
            <pre className="whitespace-pre-wrap text-sm leading-relaxed text-slate-100">
              {result.planText}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}