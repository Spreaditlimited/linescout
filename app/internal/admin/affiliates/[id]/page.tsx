"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type Affiliate = {
  id: number;
  email: string;
  name: string | null;
  status: string;
  referral_code: string;
  country_id: number | null;
  payout_currency: string | null;
};

type Country = { id: number; name: string; iso2: string; currency_code?: string | null };

export default function AdminAffiliateDetailPage() {
  const params = useParams<{ id: string }>();
  const affiliateId = Number(params?.id || 0);
  const [affiliate, setAffiliate] = useState<Affiliate | null>(null);
  const [countries, setCountries] = useState<Country[]>([]);
  const [status, setStatus] = useState("");
  const [countryId, setCountryId] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const [affRes, metaRes] = await Promise.all([
          fetch(`/api/internal/admin/affiliates/${affiliateId}`, { cache: "no-store" }),
          fetch("/api/affiliates/metadata", { cache: "no-store" }),
        ]);
        const affJson = await affRes.json().catch(() => null);
        const metaJson = await metaRes.json().catch(() => null);
        if (!affRes.ok || !affJson?.ok) throw new Error(affJson?.error || "Failed to load affiliate");
        setAffiliate(affJson.affiliate);
        setStatus(String(affJson.affiliate?.status || ""));
        setCountryId(String(affJson.affiliate?.country_id || ""));
        setName(String(affJson.affiliate?.name || ""));
        if (metaRes.ok && metaJson?.ok && Array.isArray(metaJson.countries)) {
          setCountries(metaJson.countries);
        }
      } catch (e: any) {
        setErr(e?.message || "Failed to load affiliate");
      } finally {
        setLoading(false);
      }
    })();
  }, [affiliateId]);

  async function save() {
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/internal/admin/affiliates/${affiliateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          name,
          country_id: countryId ? Number(countryId) : null,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to update affiliate");
      setAffiliate(json.affiliate);
      setMsg("Affiliate updated.");
    } catch (e: any) {
      setErr(e?.message || "Failed to update affiliate");
    }
  }

  if (loading) {
    return (
      <div className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6 text-sm text-neutral-200">
        Loading…
      </div>
    );
  }

  if (err) {
    return (
      <div className="rounded-3xl border border-red-700/40 bg-red-900/20 p-6 text-sm text-red-200">{err}</div>
    );
  }

  if (!affiliate) return null;

  return (
    <div className="space-y-6">
      <Link href="/internal/admin/affiliates" className="text-xs text-neutral-400 hover:text-neutral-200">
        ← Back to affiliates
      </Link>

      <div className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6">
        <h2 className="text-lg font-semibold text-neutral-100">Affiliate #{affiliate.id}</h2>
        <p className="text-sm text-neutral-400">{affiliate.email}</p>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
            placeholder="Name"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
          >
            <option value="active">active</option>
            <option value="paused">paused</option>
            <option value="banned">banned</option>
          </select>
          <select
            value={countryId}
            onChange={(e) => setCountryId(e.target.value)}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
          >
            <option value="">Select country</option>
            {countries.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name} ({c.iso2})
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={save}
          className="mt-3 rounded-xl border border-neutral-700 bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-950"
        >
          Save changes
        </button>

        {msg && <div className="mt-3 rounded-xl border border-emerald-700/40 bg-emerald-900/20 p-3 text-sm text-emerald-200">{msg}</div>}
        {err && <div className="mt-3 rounded-xl border border-red-700/40 bg-red-900/20 p-3 text-sm text-red-200">{err}</div>}
      </div>
    </div>
  );
}
