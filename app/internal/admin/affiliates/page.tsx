"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Affiliate = {
  id: number;
  email: string;
  name: string | null;
  status: string;
  referral_code: string;
  country_id: number | null;
  payout_currency: string | null;
  created_at: string;
};

type Country = { id: number; name: string; iso2: string; currency_code?: string | null };

export default function AdminAffiliatesPage() {
  const pathname = usePathname();
  const [items, setItems] = useState<Affiliate[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [countryId, setCountryId] = useState("");

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const [affRes, metaRes] = await Promise.all([
        fetch("/api/internal/admin/affiliates?limit=100&cursor=0", { cache: "no-store" }),
        fetch("/api/affiliates/metadata", { cache: "no-store" }),
      ]);
      const affJson = await affRes.json().catch(() => null);
      const metaJson = await metaRes.json().catch(() => null);
      if (!affRes.ok || !affJson?.ok) throw new Error(affJson?.error || "Failed to load affiliates");
      setItems(Array.isArray(affJson.items) ? affJson.items : []);
      if (metaRes.ok && metaJson?.ok && Array.isArray(metaJson.countries)) {
        setCountries(metaJson.countries);
      }
    } catch (e: any) {
      setErr(e?.message || "Failed to load affiliates");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createAffiliate() {
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/internal/admin/affiliates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, country_id: Number(countryId || 0) }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to create affiliate");
      setMsg("Affiliate created.");
      setEmail("");
      setName("");
      setCountryId("");
      await load();
    } catch (e: any) {
      setErr(e?.message || "Failed to create affiliate");
    }
  }

  if (loading) {
    return (
      <div className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6 text-sm text-neutral-200">
        Loading…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {[
          { href: "/internal/admin/affiliates", label: "Affiliates" },
          { href: "/internal/admin/affiliate-commissions", label: "Commissions" },
          { href: "/internal/admin/affiliate-payouts", label: "Payouts" },
        ].map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                active
                  ? "border-neutral-600 bg-neutral-100 text-neutral-950"
                  : "border-neutral-800 bg-neutral-900/60 text-neutral-300"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
      <div className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6">
        <h2 className="text-lg font-semibold text-neutral-100">Affiliates</h2>
        <p className="text-sm text-neutral-400">Create and manage affiliate profiles.</p>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
          />
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
          onClick={createAffiliate}
          className="mt-3 rounded-xl border border-neutral-700 bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-950"
        >
          Create affiliate
        </button>

        {err && <div className="mt-3 rounded-xl border border-red-700/40 bg-red-900/20 p-3 text-sm text-red-200">{err}</div>}
        {msg && <div className="mt-3 rounded-xl border border-emerald-700/40 bg-emerald-900/20 p-3 text-sm text-emerald-200">{msg}</div>}
      </div>

      <div className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-neutral-200">
            <thead className="text-xs uppercase text-neutral-500">
              <tr>
                <th className="py-2">ID</th>
                <th className="py-2">Name</th>
                <th className="py-2">Email</th>
                <th className="py-2">Code</th>
                <th className="py-2">Status</th>
                <th className="py-2">Currency</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-neutral-800">
                  <td className="py-2">{item.id}</td>
                  <td className="py-2">{item.name || "—"}</td>
                  <td className="py-2">{item.email}</td>
                  <td className="py-2 font-mono text-xs">{item.referral_code}</td>
                  <td className="py-2">{item.status}</td>
                  <td className="py-2">{item.payout_currency || "—"}</td>
                  <td className="py-2">
                    <a
                      href={`/internal/admin/affiliates/${item.id}`}
                      className="text-xs text-neutral-300 hover:text-neutral-100"
                    >
                      Edit
                    </a>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-4 text-sm text-neutral-500">
                    No affiliates yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
