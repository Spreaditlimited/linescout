"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Rule = {
  id: number;
  transaction_type: string;
  mode: string;
  value: number;
  currency: string | null;
  is_active: number;
};

type DraftRule = Rule & { value_text: string };

const TYPES = ["commitment_fee", "project_payment", "shipping_payment", "future_service"];

export default function AdminAffiliateCommissionsPage() {
  const pathname = usePathname();
  const [items, setItems] = useState<Rule[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftRule>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/internal/admin/affiliate-commissions", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load rules");
      const loaded = Array.isArray(json.items) ? json.items : [];
      setItems(loaded);
      const nextDrafts: Record<string, DraftRule> = {};
      for (const type of TYPES) {
        const existing = loaded.find((r: Rule) => r.transaction_type === type);
        nextDrafts[type] = existing
          ? { ...existing, value_text: Number(existing.value || 0).toFixed(2) }
          : {
              id: 0,
              transaction_type: type,
              mode: "percent",
              value: 0,
              value_text: "0.00",
              currency: "NGN",
              is_active: 1,
            };
      }
      setDrafts(nextDrafts);
    } catch (e: any) {
      setErr(e?.message || "Failed to load rules");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function saveRule(rule: DraftRule) {
    setErr(null);
    setMsg(null);
    try {
      const value = Number(rule.value_text);
      if (!Number.isFinite(value) || value <= 0) {
        setErr("Commission value must be greater than 0.");
        return;
      }
      if (rule.mode === "flat" && !String(rule.currency || "").trim()) {
        setErr("Currency is required for flat commissions.");
        return;
      }
      const payload: Rule = { ...rule, value };
      const res = await fetch("/api/internal/admin/affiliate-commissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to save rule");
      setMsg("Commission rule updated.");
      await load();
    } catch (e: any) {
      setErr(e?.message || "Failed to save rule");
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
        <h2 className="text-lg font-semibold text-neutral-100">Affiliate commissions</h2>
        <p className="text-sm text-neutral-400">Configure commission per transaction type.</p>

        <div className="mt-4 space-y-4">
          {TYPES.map((type) => {
            const rule = drafts[type];
            if (!rule) return null;
            const valueText = typeof rule.value_text === "string" ? rule.value_text : Number(rule.value || 0).toFixed(2);

            return (
              <div key={type} className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">
                  {type.replace(/_/g, " ")}
                </div>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <select
                    value={rule.mode}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [type]: { ...prev[type], mode: e.target.value },
                      }))
                    }
                    className="min-w-[160px] rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
                  >
                    <option value="percent">Percent</option>
                    <option value="flat">Flat</option>
                  </select>
                  {rule.mode === "percent" ? (
                    <input
                      value={valueText}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [type]: { ...prev[type], value_text: e.target.value },
                        }))
                      }
                      onBlur={() =>
                        setDrafts((prev) => {
                          const current = prev[type];
                          const parsed = Number(current?.value_text || 0);
                          return {
                            ...prev,
                            [type]: { ...current, value_text: Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00" },
                          };
                        })
                      }
                      className="min-w-[160px] rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
                      placeholder="Percent value"
                    />
                  ) : (
                    <div className="flex flex-wrap gap-3">
                      <input
                        value={valueText}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [type]: { ...prev[type], value_text: e.target.value },
                          }))
                        }
                        onBlur={() =>
                          setDrafts((prev) => {
                            const current = prev[type];
                            const parsed = Number(current?.value_text || 0);
                            return {
                              ...prev,
                              [type]: { ...current, value_text: Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00" },
                            };
                          })
                        }
                        className="min-w-[160px] rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
                        placeholder="Flat amount"
                      />
                      <input
                        value={rule.currency || ""}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [type]: { ...prev[type], currency: e.target.value.toUpperCase() },
                          }))
                        }
                        className="min-w-[120px] rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
                        placeholder="Currency (e.g. NGN)"
                      />
                    </div>
                  )}
                  <button
                    onClick={() => saveRule(rule)}
                    className="rounded-xl border border-neutral-700 bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-950"
                  >
                    Save
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {err && <div className="mt-3 rounded-xl border border-red-700/40 bg-red-900/20 p-3 text-sm text-red-200">{err}</div>}
        {msg && <div className="mt-3 rounded-xl border border-emerald-700/40 bg-emerald-900/20 p-3 text-sm text-emerald-200">{msg}</div>}
      </div>
    </div>
  );
}
