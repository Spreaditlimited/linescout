"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AgentAppShell from "../_components/AgentAppShell";
import PremiumSelect from "../_components/PremiumSelect";
import { fetchAgentOtpMode, type AgentOtpMode } from "../../lib/otp";

type Bank = { name: string; code: string };

function clean(v: any) {
  return String(v ?? "").trim();
}

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const [profile, setProfile] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [payout, setPayout] = useState<any>(null);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [checklist, setChecklist] = useState<any>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [otpMode, setOtpMode] = useState<AgentOtpMode | null>(null);

  const [ngPhone, setNgPhone] = useState("");
  const [addrLine, setAddrLine] = useState("");
  const [addrDistrict, setAddrDistrict] = useState("");
  const [addrCity, setAddrCity] = useState("");
  const [addrProvince, setAddrProvince] = useState("");
  const [addrPostal, setAddrPostal] = useState("");
  const [cities, setCities] = useState<string[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [citiesError, setCitiesError] = useState<string | null>(null);
  const [nin, setNin] = useState("");
  const [emailNotifications, setEmailNotifications] = useState(true);

  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [accountName, setAccountName] = useState("");
  const [showNin, setShowNin] = useState(false);
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [profileRes, banksRes, mode] = await Promise.all([
        fetch("/api/internal/agents/profile/me", { cache: "no-store", credentials: "include" }),
        fetch("/api/internal/agents/payout-accounts/banks", { cache: "no-store", credentials: "include" }),
        fetchAgentOtpMode(),
      ]);
      const profileJson = await profileRes.json().catch(() => null);
      const banksJson = await banksRes.json().catch(() => null);

      if (profileRes.ok && profileJson?.ok) {
        setProfile(profileJson.profile || null);
        setUser(profileJson.user || null);
        setPayout(profileJson.payout_account || null);
        setChecklist(profileJson.checklist || null);
        setNgPhone(profileJson.profile?.ng_phone || "");
        const city = String(profileJson.profile?.china_city || "");
        const fullAddr = String(profileJson.profile?.full_address || "");
        setAddrCity(city);
        if (fullAddr) {
          const parts = fullAddr.split(",").map((p: string) => p.trim());
          setAddrLine(parts[0] || "");
          setAddrDistrict(parts[1] || "");
          if (!city) setAddrCity(parts[2] || "");
          setAddrProvince(parts[3] || "");
          setAddrPostal(parts[4] || "");
        }
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
      setOtpMode(mode);
    } catch (e: any) {
      setErr(e?.message || "Failed to load settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCities = useCallback(async () => {
    setCitiesLoading(true);
    setCitiesError(null);
    try {
      const res = await fetch("/api/internal/agents/profile/china-cities", { cache: "no-store", credentials: "include" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setCities([]);
        setCitiesError(String(json?.error || `Failed (${res.status})`));
        return;
      }
      setCities(Array.isArray(json.cities) ? json.cities : []);
    } catch (e: any) {
      setCities([]);
      setCitiesError(e?.message || "Failed to load cities.");
    } finally {
      setCitiesLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
    loadCities();
  }, [load, loadCities]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!checklist) return;
    const mode = otpMode || (checklist?.otp_mode === "email" ? "email" : "phone");
    const resolvedOk =
      mode === "email" ? !!checklist?.email_verified : !!(checklist?.phone_verified ?? checklist?.otp_verified);
    const steps = [
      resolvedOk,
      !!checklist?.nin_provided,
      !!checklist?.bank_verified,
      !!checklist?.address_provided,
    ];
    const next = steps.findIndex((s) => !s);
    setActiveStep(next === -1 ? steps.length : next);
  }, [checklist, otpMode]);

  const ninInvalid = nin.trim().length > 0 && !/^\d{11}$/.test(nin.trim());
  const phoneInvalid = ngPhone.trim().length > 0 && ngPhone.trim().length < 8;
  const addressInvalid = addrLine.trim().length > 0 && addrCity.trim().length === 0;
  const bankInvalid = bankCode && !/^\d{10}$/.test(accountNumber.trim());
  const selectedCity = useMemo(
    () => cities.find((c) => c.toLowerCase() === addrCity.trim().toLowerCase()) || null,
    [cities, addrCity]
  );

  const resolvedOtpMode = otpMode || (checklist?.otp_mode === "email" ? "email" : "phone");
  const phoneOk = !!(checklist?.phone_verified ?? checklist?.otp_verified);
  const emailOk = !!checklist?.email_verified;
  const resolvedOtpOk = resolvedOtpMode === "email" ? emailOk : phoneOk;

  const steps = useMemo(() => {
    const otpLabel = resolvedOtpMode === "email" ? "Email" : "Phone";
    return [
      { label: otpLabel, done: resolvedOtpOk },
      { label: "NIN", done: !!checklist?.nin_provided },
      { label: "Bank", done: !!checklist?.bank_verified },
      { label: "Address", done: !!checklist?.address_provided },
    ];
  }, [checklist, resolvedOtpMode]);

  const progressPct = useMemo(() => {
    if (!steps.length) return 0;
    const done = steps.filter((s) => s.done).length;
    return Math.round((done / steps.length) * 100);
  }, [steps]);

  const awaitingApproval = checklist
    ? resolvedOtpOk
      ? checklist?.nin_provided && checklist?.bank_verified && checklist?.address_provided
      : false
    : false;

  const stepLabel = activeStep >= steps.length ? "Complete" : steps[activeStep]?.label || "Complete";
  const stepNumber = Math.min(activeStep + 1, steps.length);

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
    const line = clean(addrLine);
    const district = clean(addrDistrict);
    const city = clean(addrCity);
    const province = clean(addrProvince);
    const postal = clean(addrPostal);

    if (addressInvalid || !line || !city) {
      setToast({ type: "error", message: "China address and city are required." });
      return;
    }
    if (cities.length && !selectedCity) {
      setToast({ type: "error", message: "Select a city from the list." });
      return;
    }
    const full = [line, district, city, province, postal, "China"].filter(Boolean).join(", ");
    setSaving(true);
    setErr(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/internal/agents/profile/update-address", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({ full_address: full, china_city: city, country: "China" }),
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
    const existingCode = String(payout?.bank_code || "").trim();
    const existingAcct = String(payout?.account_number || "").trim();
    const hasExisting = !!existingCode && !!existingAcct;
    const isChange = hasExisting && (existingCode !== clean(bankCode) || existingAcct !== clean(accountNumber));

    if (!bankCode || !/^\d{10}$/.test(accountNumber.trim())) {
      setToast({ type: "error", message: "Select a bank and enter a 10-digit account number." });
      return;
    }

    if (isChange) {
      await requestOtp();
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
    setOtpSending(true);
    setOtpError(null);
    try {
      const res = await fetch("/api/internal/agents/payout-accounts/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({ bank_code: clean(bankCode), account_number: clean(accountNumber) }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setOtpError(String(json?.error || `Failed (${res.status})`));
        return;
      }
      setOtpModalOpen(true);
      setOtp("");
      setOtpCooldown(60);
    } catch (e: any) {
      setOtpError(e?.message || "Failed to request OTP.");
    } finally {
      setOtpSending(false);
    }
  };

  const confirmOtp = async () => {
    if (!/^\d{6}$/.test(otp.trim())) {
      setOtpError("OTP must be 6 digits.");
      return;
    }
    setOtpVerifying(true);
    setOtpError(null);
    try {
      const res = await fetch("/api/internal/agents/payout-accounts/confirm-change", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({ otp: clean(otp) }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setOtpError(String(json?.error || `Failed (${res.status})`));
        return;
      }
      setOtpModalOpen(false);
      setOtp("");
      setOtpCooldown(0);
      await load();
    } catch (e: any) {
      setOtpError(e?.message || "Failed to confirm OTP.");
    } finally {
      setOtpVerifying(false);
    }
  };

  const bankVerified = useMemo(() => {
    const status = String(payout?.status || "").toLowerCase();
    return status === "verified" || !!payout?.verified_at;
  }, [payout]);

  const bankChange = useMemo(() => {
    const existingCode = String(payout?.bank_code || "").trim();
    const existingAcct = String(payout?.account_number || "").trim();
    if (!existingCode || !existingAcct) return false;
    return existingCode !== clean(bankCode) || existingAcct !== clean(accountNumber);
  }, [payout, bankCode, accountNumber]);

  useEffect(() => {
    if (!bankChange) {
      setOtpModalOpen(false);
      setOtp("");
      setOtpCooldown(0);
    }
  }, [bankChange]);

  useEffect(() => {
    if (otpCooldown <= 0) return;
    const t = setTimeout(() => setOtpCooldown((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [otpCooldown]);

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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2D3461]">Verification progress</p>
                <p className="mt-2 text-sm text-neutral-500">
                  Complete each step to unlock approval. We review profiles manually.
                </p>
              </div>
              <div className="text-xs text-neutral-500">Step {stepNumber} of {steps.length}</div>
            </div>

            <div className="mt-4 h-2 rounded-full bg-[rgba(45,52,97,0.12)]">
              <div
                className="h-2 rounded-full bg-[#2D3461]"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {steps.map((s, i) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => setActiveStep(i)}
                  className={`rounded-2xl border px-3 py-2 text-xs font-semibold ${
                    s.done
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-[rgba(45,52,97,0.2)] text-[#2D3461]"
                  }`}
                >
                  {i + 1}. {s.label}
                </button>
              ))}
            </div>

            {awaitingApproval ? (
              <div className="mt-4 rounded-2xl border border-[rgba(45,52,97,0.12)] bg-[rgba(45,52,97,0.04)] p-4 text-sm text-neutral-600">
                All steps complete. Your account is awaiting approval.
              </div>
            ) : null}
          </section>

          <section className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2D3461]">Step 1 · {steps[0]?.label}</p>
                <p className="mt-1 text-sm text-neutral-500">Verify your account to unlock the workspace.</p>
              </div>
              <div className="text-xs text-neutral-500">
                Status: {resolvedOtpOk ? "Verified" : "Not verified"}
              </div>
            </div>
            {!resolvedOtpOk && user?.id ? (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => {
                    const mode = resolvedOtpMode === "email" ? "email-verify" : "phone-verify";
                    const emailParam =
                      resolvedOtpMode === "email" && profile?.email
                        ? `&email=${encodeURIComponent(profile.email)}`
                        : "";
                    router.push(`/agent-app/${mode}?user_id=${encodeURIComponent(user.id)}${emailParam}`);
                  }}
                  className="rounded-2xl border border-[rgba(45,52,97,0.2)] px-4 py-2 text-xs font-semibold text-[#2D3461]"
                >
                  Verify {resolvedOtpMode === "email" ? "email" : "phone"}
                </button>
              </div>
            ) : null}
          </section>

          <section className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2D3461]">Step 2 · NIN</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
            <div className="mt-4">
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
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2D3461]">Step 3 · Bank</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <PremiumSelect
                label="Bank"
                value={bankCode}
                onChange={(value) => setBankCode(value)}
                options={banks.map((bank) => ({ value: bank.code, label: bank.name }))}
                placeholder="Select bank"
              />
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
                {bankChange ? "Update bank" : "Verify bank"}
              </button>
            </div>
            {bankChange ? (
              <div className="mt-2 text-xs text-neutral-500">
                Changing bank details requires OTP confirmation.
              </div>
            ) : null}
            {otpModalOpen ? (
              <div className="mt-4 rounded-2xl border border-[rgba(45,52,97,0.12)] bg-[rgba(45,52,97,0.04)] p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-neutral-900">Confirm bank change</p>
                  <button
                    type="button"
                    onClick={() => setOtpModalOpen(false)}
                    className="text-xs text-neutral-500"
                  >
                    Close
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
                    placeholder="Enter OTP"
                    className="w-36 rounded-full border border-[rgba(45,52,97,0.2)] bg-white px-3 py-2 text-xs"
                  />
                  <button
                    type="button"
                    onClick={confirmOtp}
                    disabled={otpVerifying}
                    className="rounded-full border border-[rgba(45,52,97,0.2)] px-3 py-2 text-xs font-semibold text-[#2D3461] hover:bg-[rgba(45,52,97,0.08)]"
                  >
                    {otpVerifying ? "Confirming…" : "Confirm OTP"}
                  </button>
                  <button
                    type="button"
                    onClick={requestOtp}
                    disabled={otpSending || otpCooldown > 0}
                    className="rounded-full border border-[rgba(45,52,97,0.2)] px-3 py-2 text-xs font-semibold text-neutral-500"
                  >
                    {otpCooldown > 0 ? `Resend in ${otpCooldown}s` : otpSending ? "Sending…" : "Resend OTP"}
                  </button>
                </div>
                {otpError ? (
                  <p className="mt-2 text-xs text-amber-600">{otpError}</p>
                ) : (
                  <p className="mt-2 text-xs text-neutral-500">We sent a 6‑digit code to your email.</p>
                )}
              </div>
            ) : null}
          </section>

          <section className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2D3461]">Step 4 · Address</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Address line</label>
                <input
                  value={addrLine}
                  onChange={(e) => setAddrLine(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[rgba(45,52,97,0.2)] bg-white px-4 py-2 text-sm"
                  placeholder="Building, street, area"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">District</label>
                <input
                  value={addrDistrict}
                  onChange={(e) => setAddrDistrict(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[rgba(45,52,97,0.2)] bg-white px-4 py-2 text-sm"
                  placeholder="Baiyun"
                />
              </div>
              <PremiumSelect
                label="China city"
                value={addrCity}
                onChange={(value) => setAddrCity(value)}
                options={cities.map((city) => ({ value: city, label: city }))}
                placeholder={citiesLoading ? "Loading cities…" : "Select city"}
                disabled={citiesLoading}
                error={citiesError || (addressInvalid ? "City is required when address is provided." : "")}
              />
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Province</label>
                <input
                  value={addrProvince}
                  onChange={(e) => setAddrProvince(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[rgba(45,52,97,0.2)] bg-white px-4 py-2 text-sm"
                  placeholder="Guangdong"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Postal code</label>
                <input
                  value={addrPostal}
                  onChange={(e) => setAddrPostal(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[rgba(45,52,97,0.2)] bg-white px-4 py-2 text-sm"
                  placeholder="510000"
                />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={updateAddress}
                disabled={saving}
                className="rounded-full border border-[rgba(45,52,97,0.2)] px-4 py-2 text-xs font-semibold text-[#2D3461] hover:bg-[rgba(45,52,97,0.08)]"
              >
                Update address
              </button>
            </div>
          </section>

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
