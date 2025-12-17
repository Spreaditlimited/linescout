"use client";

import { useState } from "react";
import { callN8nWebhook } from "@/lib/n8n";

export default function TestBusinessPlanButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // This payload is similar to the curl test you used earlier
      const data = await callN8nWebhook("linescout_business_plan", {
        token: "BP-RCDIGG-PQRKQ",
        type: "business_plan",
        currency: "NGN",
        exchangeRate: 1500,
        format: "both",
        intake: {
          businessName: "Premium Groundnut Oil Ltd",
          country: "Nigeria",
          city: "Lagos",
          productLine: "Groundnut/Peanut Oil Extraction Line",
          capacity: "5 tons per day",
          targetCustomers: "wholesalers, supermarkets, bulk buyers",
          startupCapital: 150000000,
          ownerContribution: 30000000,
          loanAmount: 120000000,
          loanTenorYears: 5,
          equityPartners: false,
          existingExperience: "We already run a kulikuli business",
          distributionChannels: "open markets, supermarkets, wholesalers",
          pricingApproach: "slightly below imported oil, premium packaging",
          uniqueAngle: "locally processed, healthier oil, transparent sourcing",
          extraNotes: "Focus on Lagos and Ogun state first, then expand",
        },
      });

      // Show the JSON nicely formatted
      setResult(JSON.stringify(data, null, 2));
    } catch (err: any) {
      console.error(err);
      setError("Something went wrong while talking to LineScout backend.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
      <p className="text-xs text-slate-300">
        Temporary test button for LineScout business plan connection.
      </p>
      <button
        onClick={handleClick}
        disabled={loading}
        className="mt-3 rounded-full bg-emerald-500 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-60"
      >
        {loading ? "Contacting LineScout..." : "Test Business Plan Connection"}
      </button>

      {error && (
        <p className="mt-3 text-xs text-red-400">
          {error}
        </p>
      )}

      {result && (
        <pre className="mt-3 max-h-64 overflow-auto rounded-md bg-slate-900 p-3 text-[10px] text-slate-100">
          {result}
        </pre>
      )}
    </div>
  );
}