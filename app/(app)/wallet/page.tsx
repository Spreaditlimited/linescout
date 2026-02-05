"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/auth-client";

const money = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

const shortDate = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

type WalletResponse = {
  ok: boolean;
  wallet?: {
    balance: string | number;
    currency: string;
  };
  virtual_account?: {
    account_number: string;
    account_name: string;
    bank_name: string;
  } | null;
  payout_account?: {
    bank_code: string;
    account_number: string;
    status: string;
  } | null;
  accounts?: Array<{
    provider: string;
    account_number: string;
    account_name: string;
    bank_name: string;
  }>;
  transactions?: Array<{
    id: number;
    type: string;
    amount: number;
    currency: string;
    reason: string | null;
    created_at: string;
  }>;
  payouts?: Array<{
    id: number;
    amount: number;
    status: string;
    rejection_reason: string | null;
    created_at: string;
  }>;
};

type BankItem = { name: string; code: string };

export default function WalletPage() {
  const router = useRouter();
  const [data, setData] = useState<WalletResponse | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [banks, setBanks] = useState<BankItem[]>([]);
  const [bankQuery, setBankQuery] = useState("");
  const [bankOpen, setBankOpen] = useState(false);
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState<string | null>(null);
  const [otpRequested, setOtpRequested] = useState(false);
  const [otp, setOtp] = useState("");
  const [payoutMessage, setPayoutMessage] = useState<string | null>(null);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawMessage, setWithdrawMessage] = useState<string | null>(null);
  const [withdrawLoading, setWithdrawLoading] = useState(false);

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

    async function load() {
      setStatus("loading");
      setMessage(null);

      const res = await authFetch("/api/mobile/wallet");
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 401) {
          router.replace("/sign-in");
          return;
        }
        if (active) {
          setStatus("error");
          setMessage(json?.error || "Unable to load wallet.");
        }
        return;
      }

      if (active) {
        setData(json as WalletResponse);
        setStatus("idle");
      }
    }

    async function loadBanks() {
      const res = await authFetch("/api/mobile/banks/list");
      const json = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(json?.banks)) {
        setBanks(json.banks);
      }
    }

    load();
    loadBanks();
    return () => {
      active = false;
    };
  }, [router]);

  async function refreshWallet() {
    const res = await authFetch("/api/mobile/wallet");
    const json = await res.json().catch(() => ({}));
    if (res.ok) setData(json as WalletResponse);
  }

  async function handleVerifyAccount() {
    setPayoutLoading(true);
    setPayoutMessage(null);
    setAccountName(null);
    const res = await authFetch("/api/mobile/payout-accounts/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bank_code: bankCode, account_number: accountNumber }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      setPayoutMessage(json?.error || "Unable to verify account.");
      setPayoutLoading(false);
      return;
    }
    setAccountName(json?.account_name || null);
    setPayoutMessage("Bank account verified.");
    setPayoutLoading(false);
    await refreshWallet();
  }

  async function handleRequestOtp() {
    setPayoutLoading(true);
    setPayoutMessage(null);
    const res = await authFetch("/api/mobile/payout-accounts/request-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bank_code: bankCode, account_number: accountNumber }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      setPayoutMessage(json?.error || "Unable to send OTP.");
      setPayoutLoading(false);
      return;
    }
    setOtpRequested(true);
    setPayoutMessage("OTP sent to your email.");
    setPayoutLoading(false);
  }

  async function handleConfirmChange() {
    setPayoutLoading(true);
    setPayoutMessage(null);
    const res = await authFetch("/api/mobile/payout-accounts/confirm-change", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ otp }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      setPayoutMessage(json?.error || "Unable to confirm change.");
      setPayoutLoading(false);
      return;
    }
    setAccountName(json?.account_name || null);
    setPayoutMessage("Bank account updated.");
    setOtpRequested(false);
    setOtp("");
    setPayoutLoading(false);
    await refreshWallet();
  }

  async function handleWithdraw() {
    const amount = Number(withdrawAmount || 0);
    if (!amount || amount <= 0) {
      setWithdrawMessage("Enter a valid amount.");
      return;
    }
    setWithdrawLoading(true);
    setWithdrawMessage(null);
    const res = await authFetch("/api/mobile/payout-requests/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      setWithdrawMessage(json?.error || "Unable to create payout request.");
      setWithdrawLoading(false);
      return;
    }
    setWithdrawMessage("Withdrawal requested.");
    setWithdrawAmount("");
    setWithdrawLoading(false);
    await refreshWallet();
  }

  return (
    <div className="px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Wallet</h1>
        <p className="mt-1 text-sm text-neutral-600">Manage your LineScout wallet and virtual accounts.</p>
      </div>

      {status === "loading" ? (
        <div className="mt-6 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="animate-pulse space-y-3">
            <div className="h-5 w-1/3 rounded-full bg-neutral-100" />
            <div className="h-20 w-full rounded-2xl bg-neutral-100" />
            <div className="h-20 w-full rounded-2xl bg-neutral-100" />
          </div>
        </div>
      ) : null}

      {status === "error" ? (
        <div className="mt-6 rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
          {message}
        </div>
      ) : null}

      {message && message.toLowerCase().includes("phone number is required") ? (
        <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800 shadow-sm">
          Add your phone number in Settings to generate a virtual account.
        </div>
      ) : null}

      {data ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">Wallet balance</p>
            <p className="mt-2 text-3xl font-semibold text-neutral-900">
              {money.format(Number(data.wallet?.balance || 0))}
            </p>
            <p className="mt-2 text-xs text-neutral-600">Currency: {data.wallet?.currency || "NGN"}</p>
          </div>

          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Primary virtual account</p>
            {data.virtual_account ? (
              <div className="mt-3 rounded-2xl border border-neutral-200 p-4">
                <p className="text-xs font-semibold text-neutral-500">{data.virtual_account.bank_name}</p>
                <p className="mt-2 text-sm font-semibold text-neutral-900">
                  {data.virtual_account.account_number}
                </p>
                <p className="mt-1 text-xs text-neutral-500">{data.virtual_account.account_name}</p>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(data.virtual_account?.account_number || "");
                      setCopyMessage("Account number copied.");
                      setTimeout(() => setCopyMessage(null), 2000);
                    } catch {
                      setCopyMessage("Copy failed.");
                      setTimeout(() => setCopyMessage(null), 2000);
                    }
                  }}
                  className="btn btn-outline mt-3 px-3 py-1 text-xs"
                >
                  Copy account number
                </button>
                {copyMessage ? (
                  <p className="mt-2 text-xs text-emerald-700">{copyMessage}</p>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-xs text-neutral-600">No virtual account found yet.</p>
            )}
          </div>

          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-neutral-900">Withdrawal bank account</h2>
            {data.payout_account ? (
              <div className="mt-3 rounded-2xl border border-neutral-200 p-4">
                <p className="text-xs font-semibold text-neutral-500">Bank code</p>
                <p className="mt-1 text-sm font-semibold text-neutral-900">{data.payout_account.bank_code}</p>
                <p className="mt-2 text-xs font-semibold text-neutral-500">Account number</p>
                <p className="mt-1 text-sm text-neutral-700">{data.payout_account.account_number}</p>
                <p className="mt-2 text-xs text-neutral-500">Status: {data.payout_account.status}</p>
              </div>
            ) : (
              <p className="mt-3 text-xs text-neutral-600">No withdrawal bank account on file.</p>
            )}

            <div className="mt-4 space-y-3">
              <div className="relative">
                <label className="text-xs font-semibold text-neutral-600">Bank</label>
                <button
                  type="button"
                  onClick={() => setBankOpen((v) => !v)}
                  className="mt-2 flex w-full items-center justify-between rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                >
                  <span className="truncate">
                    {selectedBank ? selectedBank.name : "Select bank"}
                  </span>
                  <span className="text-neutral-400">▾</span>
                </button>

                {bankOpen ? (
                  <div className="absolute z-20 mt-2 w-full rounded-2xl border border-neutral-200 bg-white p-2 shadow-xl">
                    <input
                      type="text"
                      value={bankQuery}
                      onChange={(e) => setBankQuery(e.target.value)}
                      placeholder="Search banks"
                      className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-900 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                    />
                    <div className="mt-2 max-h-56 overflow-y-auto">
                      {filteredBanks.length === 0 ? (
                        <div className="rounded-xl px-3 py-2 text-xs text-neutral-500">
                          No banks found.
                        </div>
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
                                ? "bg-emerald-50 text-emerald-700"
                                : "text-neutral-700 hover:bg-neutral-50"
                            }`}
                          >
                            <span className="truncate">{bank.name}</span>
                            {bank.code === bankCode ? (
                              <span className="text-emerald-600">Selected</span>
                            ) : null}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
              <input
                type="text"
                inputMode="numeric"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="Account number"
                className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
              {accountName ? (
                <p className="text-xs text-emerald-700">Resolved name: {accountName}</p>
              ) : null}
              {payoutMessage ? (
                <p className="text-xs text-neutral-600">{payoutMessage}</p>
              ) : null}
              {!data.payout_account ? (
                <button
                  type="button"
                  onClick={handleVerifyAccount}
                  className="btn btn-outline px-4 py-2 text-xs"
                  disabled={payoutLoading}
                >
                  {payoutLoading ? "Verifying..." : "Verify account"}
                </button>
              ) : (
                <div className="space-y-3">
                  {!otpRequested ? (
                    <button
                      type="button"
                      onClick={handleRequestOtp}
                      className="btn btn-outline px-4 py-2 text-xs"
                      disabled={payoutLoading}
                    >
                      {payoutLoading ? "Sending OTP..." : "Change bank account"}
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="Enter OTP"
                        className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                      />
                      <button
                        type="button"
                        onClick={handleConfirmChange}
                        className="btn btn-outline px-4 py-2 text-xs"
                        disabled={payoutLoading}
                      >
                        {payoutLoading ? "Confirming..." : "Confirm change"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-neutral-900">All accounts</h2>
            <div className="mt-4 grid gap-3">
              {(data.accounts || []).length === 0 ? (
                <p className="text-xs text-neutral-600">No virtual accounts yet.</p>
              ) : (
                data.accounts?.map((acct) => (
                  <div key={`${acct.provider}-${acct.account_number}`} className="rounded-2xl border border-neutral-200 p-4">
                    <p className="text-xs font-semibold text-neutral-500">{acct.provider}</p>
                    <p className="mt-2 text-sm font-semibold text-neutral-900">{acct.bank_name}</p>
                    <p className="mt-1 text-sm text-neutral-700">{acct.account_number}</p>
                    <p className="mt-1 text-xs text-neutral-500">{acct.account_name}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-neutral-900">Recent transactions</h2>
            <div className="mt-4 grid gap-3">
              {(data.transactions || []).length === 0 ? (
                <p className="text-xs text-neutral-600">No transactions yet.</p>
              ) : (
                data.transactions?.map((tx) => (
                  <div key={tx.id} className="rounded-2xl border border-neutral-200 p-4">
                    <p className="text-sm font-semibold text-neutral-900">
                      {money.format(Number(tx.amount || 0))}
                    </p>
                    <p className="mt-1 text-xs text-neutral-600">
                      {tx.reason || tx.type} · {shortDate.format(new Date(tx.created_at))}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm lg:col-span-2">
            <h2 className="text-lg font-semibold text-neutral-900">Payouts</h2>
            <div className="mt-4 rounded-2xl border border-neutral-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Withdraw from wallet</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <input
                  type="text"
                  inputMode="numeric"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="Amount (NGN)"
                  className="flex-1 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
                <button
                  type="button"
                  onClick={handleWithdraw}
                  className="btn btn-primary px-4 py-2 text-xs"
                  disabled={withdrawLoading}
                >
                  {withdrawLoading ? "Requesting..." : "Request payout"}
                </button>
              </div>
              {withdrawMessage ? (
                <p className="mt-2 text-xs text-neutral-600">{withdrawMessage}</p>
              ) : null}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {(data.payouts || []).length === 0 ? (
                <p className="text-xs text-neutral-600">No payout requests yet.</p>
              ) : (
                data.payouts?.map((payout) => (
                  <div key={payout.id} className="rounded-2xl border border-neutral-200 p-4">
                    <p className="text-sm font-semibold text-neutral-900">
                      {money.format(Number(payout.amount || 0))}
                    </p>
                    <p className="mt-1 text-xs text-neutral-600">
                      {payout.status} · {shortDate.format(new Date(payout.created_at))}
                    </p>
                    {payout.rejection_reason ? (
                      <p className="mt-2 text-xs text-red-600">{payout.rejection_reason}</p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
