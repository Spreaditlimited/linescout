"use client";

import { useEffect, useMemo, useState } from "react";

type PayoutAccount = {
  provider: string;
  provider_account: string;
  status: string;
  verified_at?: string | null;
  currency?: string | null;
  country_id?: number | null;
};

type Summary = {
  available: number;
};

type RequestRow = {
  id: number;
  amount: number;
  currency: string;
  status: string;
  requested_at: string | null;
  approved_at: string | null;
  paid_at: string | null;
};

type BankItem = { name: string; code: string };

function fmtMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2,
    }).format(amount || 0);
  } catch {
    return `${currency} ${Number(amount || 0).toFixed(2)}`;
  }
}

export default function AffiliatePayoutsPage() {
  const [account, setAccount] = useState<PayoutAccount | null>(null);
  const [available, setAvailable] = useState(0);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [countryIso2, setCountryIso2] = useState<string>("");
  const [countryCurrency, setCountryCurrency] = useState<string>("");
  const [minPayouts, setMinPayouts] = useState<Record<string, number>>({});
  const [banks, setBanks] = useState<BankItem[]>([]);
  const [bankQuery, setBankQuery] = useState("");
  const [bankOpen, setBankOpen] = useState(false);

  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [paypalEmail, setPaypalEmail] = useState("");

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const filteredBanks = useMemo(() => {
    const q = bankQuery.trim().toLowerCase();
    if (!q) return banks;
    return banks.filter((bank) => bank.name.toLowerCase().includes(q));
  }, [banks, bankQuery]);

  const selectedBank = useMemo(
    () => banks.find((bank) => bank.code === bankCode) || null,
    [banks, bankCode]
  );

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const meRes = await fetch("/api/affiliates/me", { cache: "no-store" });
        const meJson = await meRes.json().catch(() => null);
        if (!meRes.ok || !meJson?.ok) throw new Error(meJson?.error || "Failed to load profile");
        if (!active) return;
        setAccount(meJson.payout_account || null);
        if (meJson?.payout_account?.provider_account) {
          setPaypalEmail(String(meJson.payout_account.provider_account || ""));
        }
        if (meJson?.affiliate?.country_id) {
          const metaRes = await fetch("/api/affiliates/metadata", { cache: "no-store" });
          const metaJson = await metaRes.json().catch(() => null);
          if (metaRes.ok && metaJson?.ok && Array.isArray(metaJson.countries)) {
            const match = metaJson.countries.find((c: any) => Number(c.id) === Number(meJson.affiliate.country_id));
            if (match) {
              setCountryIso2(String(match.iso2 || "").toUpperCase());
              setCountryCurrency(String(match.currency_code || "").toUpperCase());
            }
          }
          if (metaRes.ok && metaJson?.ok && metaJson.affiliate_min_payouts) {
            setMinPayouts(metaJson.affiliate_min_payouts || {});
          }
        }

        const sumRes = await fetch("/api/affiliates/earnings/summary", { cache: "no-store" });
        const sumJson = await sumRes.json().catch(() => null);
        if (!sumRes.ok || !sumJson?.ok) throw new Error(sumJson?.error || "Failed to load summary");
        setAvailable(Number(sumJson?.summary?.available || 0));

        const reqRes = await fetch("/api/affiliates/payout-requests/mine?limit=20&cursor=0", { cache: "no-store" });
        const reqJson = await reqRes.json().catch(() => null);
        if (!reqRes.ok || !reqJson?.ok) throw new Error(reqJson?.error || "Failed to load payout requests");
        setRequests(Array.isArray(reqJson.items) ? reqJson.items : []);
      } catch (e: any) {
        if (active) setErr(e?.message || "Failed to load payouts");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (countryIso2 !== "NG") return () => {};
    (async () => {
      try {
        const res = await fetch("/api/affiliates/banks/list", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (res.ok && json?.ok && Array.isArray(json.banks)) {
          if (active) setBanks(json.banks);
        }
      } catch {
        if (active) setBanks([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [countryIso2]);

  async function saveAccount() {
    setErr(null);
    setMsg(null);
    try {
      const payload: any = countryIso2 === "NG" ? { bank_code: bankCode, account_number: accountNumber } : { paypal_email: paypalEmail };
      const res = await fetch("/api/affiliates/payout-accounts/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to save payout account");
      setMsg("Payout account saved.");
      const meRes = await fetch("/api/affiliates/me", { cache: "no-store" });
      const meJson = await meRes.json().catch(() => null);
      if (meRes.ok && meJson?.ok) setAccount(meJson.payout_account || null);
    } catch (e: any) {
      setErr(e?.message || "Failed to save payout account");
    }
  }

  async function requestPayout() {
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/affiliates/payout-requests/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(withdrawAmount) }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to request payout");
      setMsg("Payout request submitted.");
      setWithdrawAmount("");
      const reqRes = await fetch("/api/affiliates/payout-requests/mine?limit=20&cursor=0", { cache: "no-store" });
      const reqJson = await reqRes.json().catch(() => null);
      if (reqRes.ok && reqJson?.ok) setRequests(Array.isArray(reqJson.items) ? reqJson.items : []);
    } catch (e: any) {
      setErr(e?.message || "Failed to request payout");
    }
  }

  if (loading) {
    return (
      <div className="rounded-3xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600 shadow-sm">Loading…</div>
    );
  }

  if (err) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">{err}</div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">Payout account</p>
        <p className="mt-2 text-sm text-neutral-600">
          Your payout currency is locked to your profile country. Contact admin to change it.
        </p>
        <div className="mt-4 grid gap-3">
          {countryIso2 === "NG" ? (
            <>
              <div className="relative">
                <label className="text-xs font-semibold text-neutral-600">Bank</label>
                <button
                  type="button"
                  onClick={() => setBankOpen((v) => !v)}
                  className="mt-2 flex w-full items-center justify-between rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 shadow-sm focus:border-[rgba(45,52,97,0.45)] focus:outline-none focus:ring-2 focus:ring-[rgba(45,52,97,0.18)]"
                >
                  <span className="truncate">{selectedBank ? selectedBank.name : "Select bank"}</span>
                  <span className="text-neutral-400">▾</span>
                </button>

                {bankOpen ? (
                  <div className="absolute z-20 mt-2 w-full rounded-2xl border border-neutral-200 bg-white p-2 shadow-xl">
                    <input
                      type="text"
                      value={bankQuery}
                      onChange={(e) => setBankQuery(e.target.value)}
                      placeholder="Search banks"
                      className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-900 focus:border-[rgba(45,52,97,0.45)] focus:outline-none focus:ring-2 focus:ring-[rgba(45,52,97,0.12)]"
                    />
                    <div className="mt-2 max-h-56 overflow-y-auto">
                      {filteredBanks.length === 0 ? (
                        <div className="rounded-xl px-3 py-2 text-xs text-neutral-500">No banks found.</div>
                      ) : (
                        filteredBanks.map((bank) => (
                          <button
                            key={bank.code}
                            type="button"
                            onClick={() => {
                              setBankCode(bank.code);
                              setBankOpen(false);
                              setBankQuery("");
                            }}
                            className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition ${
                              bank.code === bankCode
                                ? "bg-[rgba(45,52,97,0.08)] text-[var(--agent-blue)]"
                                : "text-neutral-700 hover:bg-neutral-50"
                            }`}
                          >
                            <span className="truncate">{bank.name}</span>
                            {bank.code === bankCode ? <span className="text-[var(--agent-blue)]">Selected</span> : null}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
              <input
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                className="w-full rounded-2xl border border-neutral-200 px-4 py-3 text-sm"
                placeholder="Account number"
              />
            </>
          ) : (
            <input
              value={paypalEmail}
              onChange={(e) => setPaypalEmail(e.target.value)}
              className="w-full rounded-2xl border border-neutral-200 px-4 py-3 text-sm"
              placeholder="PayPal email"
            />
          )}

          <button
            onClick={saveAccount}
            className="inline-flex items-center justify-center rounded-2xl bg-[var(--agent-blue)] px-5 py-3 text-sm font-semibold text-white"
          >
            Save payout account
          </button>
          {account && (
            <div className="text-xs text-neutral-500">
              Current: {account.provider} • {account.provider_account} • {account.status}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">Request payout</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
            className="w-full max-w-xs rounded-2xl border border-neutral-200 px-4 py-3 text-sm"
            placeholder="Amount"
          />
          <button
            onClick={requestPayout}
            className="inline-flex items-center justify-center rounded-2xl bg-[var(--agent-blue)] px-5 py-3 text-sm font-semibold text-white"
          >
            Submit request
          </button>
          <div className="text-xs text-neutral-500">Available: {fmtMoney(available, account?.currency || countryCurrency || "USD")}</div>
        </div>
        {(() => {
          const currency = (account?.currency || countryCurrency || "").toUpperCase();
          const min = currency ? Number(minPayouts?.[currency] || 0) : 0;
          if (!currency) return null;
          return (
            <div className="mt-2 text-xs text-neutral-500">
              Minimum payout: {fmtMoney(min, currency)}
            </div>
          );
        })()}
        {msg && <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{msg}</div>}
      </div>

      <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">Payout requests</p>
        <div className="mt-4 space-y-3">
          {requests.length === 0 ? (
            <div className="text-sm text-neutral-500">No payout requests yet.</div>
          ) : (
            requests.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-neutral-200 px-4 py-3 text-sm">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">#{r.id}</div>
                  <div className="text-xs text-neutral-500">{r.status}</div>
                </div>
                <div className="text-sm font-semibold text-neutral-900">{fmtMoney(r.amount, r.currency)}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
