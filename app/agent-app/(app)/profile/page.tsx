"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AgentAppShell from "../_components/AgentAppShell";
import { fetchAgentOtpMode, type AgentOtpMode } from "../../lib/otp";

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [checklist, setChecklist] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [otpMode, setOtpMode] = useState<AgentOtpMode | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [res, mode] = await Promise.all([
        fetch("/api/internal/agents/profile/me", { cache: "no-store", credentials: "include" }),
        fetchAgentOtpMode(),
      ]);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setErr(String(json?.error || `Failed (${res.status})`));
        return;
      }
      setProfile(json.profile || null);
      setChecklist(json.checklist || null);
      setUser(json.user || null);
      setOtpMode(mode);
    } catch (e: any) {
      setErr(e?.message || "Failed to load profile.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const approvalLabel = useMemo(() => {
    if (!profile?.approval_status) return "Pending";
    return String(profile.approval_status).replace(/\b\w/g, (m: string) => m.toUpperCase());
  }, [profile?.approval_status]);

  const maskedNin = useMemo(() => {
    const raw = String(profile?.nin || "").trim();
    if (!raw) return "—";
    if (raw.length <= 4) return raw;
    return `•••••••${raw.slice(-4)}`;
  }, [profile?.nin]);

  const resolvedOtpMode = otpMode || (checklist?.otp_mode === "email" ? "email" : "phone");
  const phoneOk = !!(checklist?.phone_verified ?? checklist?.otp_verified);
  const emailOk = !!checklist?.email_verified;
  const otpLabel = resolvedOtpMode === "email" ? "Email verified" : "China phone verified";
  const otpOk = resolvedOtpMode === "email" ? emailOk : phoneOk;

  return (
    <AgentAppShell title="Profile" subtitle="Your agent identity and approval checklist.">
      {err ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
      ) : null}

      {loading ? (
        <div className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-6 text-sm text-neutral-600 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
          Loading profile…
        </div>
      ) : (
        <div className="grid gap-6">
          <section className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2D3461]">Agent profile</p>
                <h2 className="mt-2 text-2xl font-semibold text-neutral-900">
                  {profile?.first_name || ""} {profile?.last_name || ""}
                </h2>
                <p className="mt-1 text-sm text-neutral-500">{profile?.email || "—"}</p>
              </div>
              <div className="rounded-full border border-[rgba(45,52,97,0.2)] bg-[rgba(45,52,97,0.06)] px-4 py-2 text-xs font-semibold text-[#2D3461]">
                Status: {approvalLabel}
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="text-xs text-neutral-500">China phone</p>
                <p className="text-sm font-semibold text-neutral-900">{profile?.china_phone || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500">China phone</p>
                <p className="text-sm font-semibold text-neutral-900">{profile?.china_phone || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500">China city</p>
                <p className="text-sm font-semibold text-neutral-900">{profile?.china_city || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500">Nationality</p>
                <p className="text-sm font-semibold text-neutral-900">{profile?.nationality || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500">NIN</p>
                <p className="text-sm font-semibold text-neutral-900">{maskedNin}</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500">Address</p>
                <p className="text-sm font-semibold text-neutral-900">{profile?.full_address || "—"}</p>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            <p className="text-sm font-semibold text-neutral-900">Approval checklist</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                { label: otpLabel, ok: otpOk },
                { label: "NIN provided", ok: checklist?.nin_provided },
                { label: "Bank verified", ok: checklist?.bank_verified },
                { label: "Address provided", ok: checklist?.address_provided },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between rounded-2xl border border-[rgba(45,52,97,0.12)] bg-[rgba(45,52,97,0.04)] px-4 py-3 text-sm"
                >
                  <span className="text-neutral-700">{item.label}</span>
                  <span className={`text-xs font-semibold ${item.ok ? "text-emerald-600" : "text-amber-600"}`}>
                    {item.ok ? "Complete" : "Pending"}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </AgentAppShell>
  );
}
