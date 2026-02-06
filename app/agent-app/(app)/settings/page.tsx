"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AgentAppShell from "../_components/AgentAppShell";

type Bank = { name: string; code: string };

function clean(v: any) {
  return String(v ?? "").trim();
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const [profile, setProfile] = useState<any>(null);
  const [payout, setPayout] = useState<any>(null);
  const [banks, setBanks] = useState<Bank[]>([]);

  const [ngPhone, setNgPhone] = useState("");
  const [chinaCity, setChinaCity] = useState("");
  const [address, setAddress] = useState("");
  const [nin, setNin] = useState("");
  const [emailNotifications, setEmailNotifications] = useState(true);

  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [accountName, setAccountName] = useState("");
  const [showNin, setShowNin] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [profileRes, banksRes] = await Promise.all([
        fetch("/api/internal/agents/profile/me", { cache: "no-store", credentials: "include" }),
        fetch("/api/internal/agents/payout-accounts/banks", { cache: "no-store", credentials: "include" }),
      ]);
      const profileJson = await profileRes.json().catch(() => null);
      const banksJson = await banksRes.json().catch(() => null);

      if (profileRes.ok && profileJson?.ok) {
        setProfile(profileJson.profile || null);
        setPayout(profileJson.payout_account || null);
        setNgPhone(profileJson.profile?.ng_phone || "");
        setChinaCity(profileJson.profile?.china_city || "");
        setAddress(profileJson.profile?.full_address || "");
        setNin(profileJson.profile?.nin || "");
        setEmailNotifications(profileJson.profile?.email_notifications_enabled !== false);
        setBankCode(profileJson.payout_account?.bank_code || "");
        setAccountNumber(profileJson.payout_account?.account_number || "");
        setAccountName(profileJson.payout_account?.account_name || "");
      }

      if (banksRes.ok && banksJson?.ok) {
        setBanks(Array.isArray(banksJson.banks) ? banksJson.banks : []);
      }

      if (!profileRes.ok && profileJson?.error) {
        setErr(String(profileJson.error));
      }
    } catch (e: any) {
      setErr(e?.message || "Failed to load settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const ninInvalid = nin.trim().length > 0 && !/^\d{11}$/.test(nin.trim());
  const phoneInvalid = ngPhone.trim().length > 0 && ngPhone.trim().length < 8;
  const addressInvalid = address.trim().length > 0 && chinaCity.trim().length === 0;
  const bankInvalid = bankCode && !/^\d{10}$/.test(accountNumber.trim());

  const updateNgPhone = async () => {
    if (phoneInvalid) {
      setToast({ type: "error", message: "Enter a valid Nigeria phone number." });
      return;
    }
    setSaving(true);
    setErr(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/internal/agents/profile/update-ng-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({ ng_phone: clean(ngPhone) }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setErr(String(json?.error || `Failed (${res.status})`));
        setToast({ type: "error", message: String(json?.error || "Phone update failed.") });
        return;
      }
      setSuccess("Nigeria phone updated.");
      setToast({ type: "success", message: "Nigeria phone updated." });
      await load();
    } catch (e: any) {
      setErr(e?.message || "Failed to update phone.");
    } finally {
      setSaving(false);
    }
  };

  const updateAddress = async () => {
    if (addressInvalid || !address.trim() || !chinaCity.trim()) {
      setToast({ type: "error", message: "China address and city are required." });
      return;
    }
    setSaving(true);
    setErr(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/internal/agents/profile/update-address", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({ full_address: clean(address), china_city: clean(chinaCity), country: "China" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setErr(String(json?.error || `Failed (${res.status})`));
        setToast({ type: "error", message: String(json?.error || "Address update failed.") });
        return;
      }
      setSuccess("Address updated.");
      setToast({ type: "success", message: "Address updated." });
      await load();
    } catch (e: any) {
      setErr(e?.message || "Failed to update address.");
    } finally {
      setSaving(false);
    }
  };

  const updateNin = async () => {
    if (ninInvalid || !nin.trim()) {
      setToast({ type: "error", message: "NIN must be 11 digits." });
      return;
    }
    setSaving(true);
    setErr(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/internal/agents/profile/update-nin", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({ nin: clean(nin) }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setErr(String(json?.error || `Failed (${res.status})`));
        setToast({ type: "error", message: String(json?.error || "NIN update failed.") });
        return;
      }
      setSuccess("NIN updated.");
      setToast({ type: "success", message: "NIN updated." });
      await load();
    } catch (e: any) {
      setErr(e?.message || "Failed to update NIN.");
    } finally {
      setSaving(false);
    }
  };

  const updateNotifications = async () => {
    setSaving(true);
    setErr(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/internal/agents/profile/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({ email_notifications_enabled: emailNotifications }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setErr(String(json?.error || `Failed (${res.status})`));
        setToast({ type: "error", message: String(json?.error || "Notifications update failed.") });
        return;
      }
      setSuccess("Notification preferences saved.");
      setToast({ type: "success", message: "Notification preferences saved." });
      await load();
    } catch (e: any) {
      setErr(e?.message || "Failed to update notifications.");
    } finally {
      setSaving(false);
    }
  };

  const verifyBank = async () => {
    if (!bankCode || !/^\d{10}$/.test(accountNumber.trim())) {
      setToast({ type: "error", message: "Select a bank and enter a 10-digit account number." });
      return;
    }
    setSaving(true);
    setErr(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/internal/agents/payout-accounts/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({ bank_code: clean(bankCode), account_number: clean(accountNumber) }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setErr(String(json?.error || `Failed (${res.status})`));
        setToast({ type: "error", message: String(json?.error || "Bank verification failed.") });
        return;
      }
      setAccountName(String(json.account_name || ""));
      setSuccess("Bank verified and saved.");
      setToast({ type: "success", message: "Bank verified and saved." });
      await load();
    } catch (e: any) {
      setErr(e?.message || "Failed to verify bank.");
    } finally {
      setSaving(false);
    }
  };

  const requestOtp = async () => {
    if (!bankCode || !/^\d{10}$/.test(accountNumber.trim())) {
      setToast({ type: "error", message: "Select a bank and enter a 10-digit account number." });
      return;
    }
    setSaving(true);
    setErr(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/internal/agents/payout-accounts/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({ bank_code: clean(bankCode), account_number: clean(accountNumber) }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setErr(String(json?.error || `Failed (${res.status})`));
        setToast({ type: "error", message: String(json?.error || "OTP request failed.") });
        return;
      }
      setSuccess("OTP sent to your email.");
      setToast({ type: "success", message: "OTP sent to your email." });
    } catch (e: any) {
      setErr(e?.message || "Failed to request OTP.");
    } finally {
      setSaving(false);
    }
  };

  const confirmOtp = async () => {
    if (!/^\d{6}$/.test(otp.trim())) {
      setToast({ type: "error", message: "OTP must be 6 digits." });
      return;
    }
    setSaving(true);
    setErr(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/internal/agents/payout-accounts/confirm-change", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({ otp: clean(otp) }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setErr(String(json?.error || `Failed (${res.status})`));
        setToast({ type: "error", message: String(json?.error || "OTP confirmation failed.") });
        return;
      }
      setSuccess("Bank change confirmed.");
      setToast({ type: "success", message: "Bank change confirmed." });
      await load();
    } catch (e: any) {
      setErr(e?.message || "Failed to confirm OTP.");
    } finally {
      setSaving(false);
    }
  };

  const bankVerified = useMemo(() => {
    const status = String(payout?.status || "").toLowerCase();
    return status === "verified" || !!payout?.verified_at;
  }, [payout]);

  return (
    <AgentAppShell title="Settings" subtitle="Update your details, payout account, and notifications.">
      {toast ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            toast.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {toast.message}
        </div>
      ) : null}
      {err ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
      ) : null}

      {loading ? (
        <div className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-6 text-sm text-neutral-600 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
          Loading settings…
        </div>
      ) : (
        <div className="grid gap-6">
          <section className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2D3461]">Contact</p>
                <p className="mt-1 text-sm text-neutral-500">Keep your contact information up to date.</p>
              </div>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Nigeria phone</label>
                <input
                  value={ngPhone}
                  onChange={(e) => setNgPhone(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[rgba(45,52,97,0.2)] bg-white px-4 py-2 text-sm"
                  placeholder="0803..."
                />
                {phoneInvalid ? <p className="mt-2 text-xs text-amber-600">Phone looks too short.</p> : null}
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">China city</label>
                <input
                  value={chinaCity}
                  onChange={(e) => setChinaCity(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[rgba(45,52,97,0.2)] bg-white px-4 py-2 text-sm"
                  placeholder="Guangzhou"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">China address</label>
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[rgba(45,52,97,0.2)] bg-white px-4 py-2 text-sm"
                  rows={2}
                />
                {addressInvalid ? (
                  <p className="mt-2 text-xs text-amber-600">City is required when address is provided.</p>
                ) : null}
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">NIN</label>
                <input
                  value={nin}
                  onChange={(e) => setNin(e.target.value)}
                  type={showNin ? "text" : "password"}
                  className="mt-2 w-full rounded-2xl border border-[rgba(45,52,97,0.2)] bg-white px-4 py-2 text-sm"
                  placeholder="11-digit NIN"
                />
                <div className="mt-2 flex items-center gap-2 text-xs text-neutral-500">
                  <button
                    type="button"
                    onClick={() => setShowNin((prev) => !prev)}
                    className="rounded-full border border-[rgba(45,52,97,0.2)] px-3 py-1 text-xs font-semibold text-[#2D3461]"
                  >
                    {showNin ? "Hide" : "Show"}
                  </button>
                  {ninInvalid ? <span className="text-amber-600">NIN must be 11 digits.</span> : null}
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={updateNgPhone}
                disabled={saving}
                className="rounded-full border border-[rgba(45,52,97,0.2)] px-4 py-2 text-xs font-semibold text-[#2D3461] hover:bg-[rgba(45,52,97,0.08)]"
              >
                Update phone
              </button>
              <button
                type="button"
                onClick={updateAddress}
                disabled={saving}
                className="rounded-full border border-[rgba(45,52,97,0.2)] px-4 py-2 text-xs font-semibold text-[#2D3461] hover:bg-[rgba(45,52,97,0.08)]"
              >
                Update address
              </button>
              <button
                type="button"
                onClick={updateNin}
                disabled={saving}
                className="rounded-full bg-[#2D3461] px-4 py-2 text-xs font-semibold text-white shadow-[0_10px_30px_rgba(45,52,97,0.3)]"
              >
                Save NIN
              </button>
            </div>
          </section>

          <section className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2D3461]">Payout account</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Bank</label>
                <select
                  value={bankCode}
                  onChange={(e) => setBankCode(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[rgba(45,52,97,0.2)] bg-white px-4 py-2 text-sm"
                >
                  <option value="">Select bank</option>
                  {banks.map((bank) => (
                    <option key={bank.code} value={bank.code}>
                      {bank.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Account number</label>
                <input
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[rgba(45,52,97,0.2)] bg-white px-4 py-2 text-sm"
                />
                {bankInvalid ? <p className="mt-2 text-xs text-amber-600">Account number must be 10 digits.</p> : null}
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Account name</label>
                <input
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  disabled
                  className="mt-2 w-full rounded-2xl border border-[rgba(45,52,97,0.2)] bg-neutral-50 px-4 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Status</label>
                <input
                  value={bankVerified ? "Verified" : "Pending"}
                  disabled
                  className="mt-2 w-full rounded-2xl border border-[rgba(45,52,97,0.2)] bg-neutral-50 px-4 py-2 text-sm"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={verifyBank}
                disabled={saving}
                className="rounded-full bg-[#2D3461] px-4 py-2 text-xs font-semibold text-white shadow-[0_10px_30px_rgba(45,52,97,0.3)]"
              >
                Verify bank
              </button>
              <button
                type="button"
                onClick={requestOtp}
                disabled={saving}
                className="rounded-full border border-[rgba(45,52,97,0.2)] px-4 py-2 text-xs font-semibold text-[#2D3461] hover:bg-[rgba(45,52,97,0.08)]"
              >
                Request OTP
              </button>
              <div className="flex items-center gap-2">
                <input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="OTP"
                  className="w-24 rounded-full border border-[rgba(45,52,97,0.2)] bg-white px-3 py-2 text-xs"
                />
                <button
                  type="button"
                  onClick={confirmOtp}
                  disabled={saving}
                  className="rounded-full border border-[rgba(45,52,97,0.2)] px-3 py-2 text-xs font-semibold text-[#2D3461] hover:bg-[rgba(45,52,97,0.08)]"
                >
                  Confirm
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2D3461]">Notifications</p>
            <div className="mt-4 flex items-center justify-between rounded-2xl border border-[rgba(45,52,97,0.12)] bg-[rgba(45,52,97,0.04)] px-4 py-3 text-sm">
              <div>
                <p className="font-semibold text-neutral-900">Email updates</p>
                <p className="text-xs text-neutral-500">Receive updates about handoffs and payouts.</p>
              </div>
              <button
                type="button"
                onClick={() => setEmailNotifications((prev) => !prev)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  emailNotifications ? "bg-emerald-100 text-emerald-700" : "bg-neutral-200 text-neutral-600"
                }`}
              >
                {emailNotifications ? "On" : "Off"}
              </button>
            </div>
            <div className="mt-4">
              <button
                type="button"
                onClick={updateNotifications}
                disabled={saving}
                className="rounded-full border border-[rgba(45,52,97,0.2)] px-4 py-2 text-xs font-semibold text-[#2D3461] hover:bg-[rgba(45,52,97,0.08)]"
              >
                Save notification settings
              </button>
            </div>
          </section>

          {success ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {success}
            </div>
          ) : null}
        </div>
      )}
    </AgentAppShell>
  );
}
