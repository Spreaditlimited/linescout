"use client";

import { useEffect, useMemo, useState } from "react";
import ConfirmModal from "../../_components/ConfirmModal";

type ApprovalStatus = "pending" | "approved" | "blocked";

type AgentRow = {
  agent_profile_id: number;
  internal_user_id: number;

  username: string;
  role: "admin" | "agent";
  is_active: 0 | 1;

  first_name: string;
  last_name: string;
  email: string;
  china_phone: string;
  china_phone_verified_at: string | null;
  china_city: string;
  nationality: string;

  nin: string | null;
  nin_verified_at: string | null;
  full_address: string | null;

  has_bank_account?: 0 | 1 | null;

  approval_status: ApprovalStatus;
  approved_at?: string | null;
  approved_by_internal_user_id?: number | null;

  created_at: string;
  updated_at: string;
};

function fmt(d?: string | null) {
  if (!d) return "N/A";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "N/A";
  return dt.toLocaleString();
}

function norm(v: any) {
  return String(v ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function pill(ok: boolean, yes: string, no: string) {
  const base = "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold";
  return ok
    ? `${base} border-emerald-700/60 bg-emerald-500/10 text-emerald-200`
    : `${base} border-amber-700/60 bg-amber-500/10 text-amber-200`;
}

function statusPill(s: ApprovalStatus) {
  const base = "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize";
  if (s === "pending") return `${base} border-amber-700/60 bg-amber-500/10 text-amber-200`;
  if (s === "approved") return `${base} border-emerald-700/60 bg-emerald-500/10 text-emerald-200`;
  return `${base} border-red-700/60 bg-red-500/10 text-red-200`;
}

function accountPill(isActive: boolean) {
  const base = "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold";
  return isActive
    ? `${base} border-emerald-700/60 bg-emerald-500/10 text-emerald-200`
    : `${base} border-red-700/60 bg-red-500/10 text-red-200`;
}

function readiness(a: AgentRow) {
  const phoneOk = !!a.china_phone_verified_at;
  const ninProvided = !!(a.nin && String(a.nin).trim());
  const ninOk = !!a.nin_verified_at;
  const addressOk = !!(a.full_address && String(a.full_address).trim());
  const bankOk = !!a.has_bank_account;

  const missing: string[] = [];
  if (!phoneOk) missing.push("China phone not verified");
  if (!ninProvided) missing.push("NIN not provided");
  if (ninProvided && !ninOk) missing.push("NIN not verified");
  if (!addressOk) missing.push("Address not provided");
  if (!bankOk) missing.push("Bank account not set");

  return {
    phoneOk,
    ninProvided,
    ninOk,
    addressOk,
    bankOk,
    ready: phoneOk && ninProvided && ninOk && addressOk && bankOk,
    missing,
  };
}

export default function AdminAgentApprovalPage() {
  const [items, setItems] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [total, setTotal] = useState(0);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [tab, setTab] = useState<"pending" | "approved" | "blocked" | "all">("pending");

  // confirm modal
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"approve" | "block" | "pending" | null>(null);
  const [confirmUserId, setConfirmUserId] = useState<number | null>(null);
  const [confirmLabel, setConfirmLabel] = useState<string>("");
  const [confirmDisabledReason, setConfirmDisabledReason] = useState<string>("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  async function load(p: number) {
    setLoading(true);
    setErr(null);
    setBanner(null);

    try {
      const res = await fetch(
        `/api/internal/admin/agent-approval?page=${p}&page_size=${pageSize}`,
        { cache: "no-store" }
      );
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to load agents");

      setItems((data.items || []) as AgentRow[]);
      setTotal(Number(data.total || 0));
      setPage(Number(data.page || p));
    } catch (e: any) {
      setErr(e?.message || "Failed to load agents");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canPrev = page > 1 && !loading;
  const canNext = page < totalPages && !loading;

  const filtered = useMemo(() => {
    const q = norm(debouncedSearch);

    let base = items;

    if (tab !== "all") {
      base = base.filter((a) => a.approval_status === tab);
    }

    if (!q) return base;

    return base.filter((a) => {
      const r = readiness(a);
      const hay = [
        a.internal_user_id,
        a.username,
        a.first_name,
        a.last_name,
        a.email,
        a.china_phone,
        a.china_city,
        a.nationality,
        a.approval_status,
        a.is_active,
        a.nin,
        r.ready ? "ready" : "not_ready",
        ...r.missing,
      ]
        .map(norm)
        .join(" | ");

      return hay.includes(q);
    });
  }, [items, debouncedSearch, tab]);

  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, blocked: 0, all: items.length };
    for (const a of items) {
      if (a.approval_status === "pending") c.pending++;
      if (a.approval_status === "approved") c.approved++;
      if (a.approval_status === "blocked") c.blocked++;
    }
    return c;
  }, [items]);

  function openConfirm(a: AgentRow, action: "approve" | "block" | "pending") {
    setBanner(null);
    setConfirmUserId(a.internal_user_id);
    setConfirmAction(action);
    setConfirmDisabledReason("");

    const name = `${a.first_name} ${a.last_name}`.trim();
    if (action === "approve") {
      const r = readiness(a);
      if (!r.ready) {
        setConfirmDisabledReason(`Cannot approve. Missing: ${r.missing.join(", ")}.`);
      }
      setConfirmLabel(`Approve ${name}?`);
    } else if (action === "block") {
      setConfirmLabel(`Block ${name}?`);
    } else {
      setConfirmLabel(`Set ${name} back to pending?`);
    }

    setConfirmOpen(true);
  }

  async function runAction() {
    if (!confirmUserId || !confirmAction) return;
    if (confirmDisabledReason) {
      setBanner({ type: "err", msg: confirmDisabledReason });
      setConfirmOpen(false);
      return;
    }

    setBusy(true);
    setBanner(null);

    try {
      const res = await fetch("/api/internal/admin/agent-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ internal_user_id: confirmUserId, action: confirmAction }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to update agent");

      const updated: AgentRow | null = data.item || null;
      if (updated) {
        setItems((prev) =>
          prev.map((x) => (x.internal_user_id === updated.internal_user_id ? updated : x))
        );
      } else {
        await load(page);
      }

      setBanner({ type: "ok", msg: "Agent updated." });
      setConfirmOpen(false);
    } catch (e: any) {
      setBanner({ type: "err", msg: e?.message || "Failed to update agent" });
      setConfirmOpen(false);
    } finally {
      setBusy(false);
    }
  }

  const btn =
    "inline-flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:border-neutral-700";
  const btnDisabled = "opacity-50 cursor-not-allowed";

  const tabBtn =
    "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors";
  const tabIdle = "border-neutral-800 bg-neutral-950 text-neutral-200 hover:border-neutral-700";
  const tabActive = "border-neutral-600 bg-neutral-100 text-neutral-950";

  const smallBtn =
    "inline-flex items-center justify-center rounded-xl border px-3 py-2 text-xs font-semibold transition-colors";
  const smallPrimary = `${smallBtn} bg-white text-neutral-950 border-white hover:bg-neutral-200`;
  const smallDanger = `${smallBtn} border-red-700/60 bg-red-500/10 text-red-200 hover:bg-red-500/15`;
  const smallSecondary = `${smallBtn} border-neutral-800 bg-neutral-950 text-neutral-200 hover:border-neutral-700`;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-100">Agent Approval</h2>
            <p className="text-sm text-neutral-400">
              Approval controls whether an agent can claim sourcing projects. Approval is blocked unless they are ready.
            </p>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
            <div className="flex w-full items-center gap-2 sm:w-[560px]">
              <div className="relative w-full">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, email, phone, city, missing items..."
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 pr-16 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                />
                {search.trim() ? (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1 text-[11px] text-neutral-200 hover:bg-neutral-800"
                  >
                    Clear
                  </button>
                ) : null}
              </div>

              <div className="shrink-0 text-[11px] text-neutral-400">
                {filtered.length}/{tab === "all" ? items.length : counts[tab]}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setTab("pending")}
                className={`${tabBtn} ${tab === "pending" ? tabActive : tabIdle}`}
              >
                Pending <span className="text-xs opacity-80">({counts.pending})</span>
              </button>
              <button
                type="button"
                onClick={() => setTab("approved")}
                className={`${tabBtn} ${tab === "approved" ? tabActive : tabIdle}`}
              >
                Approved <span className="text-xs opacity-80">({counts.approved})</span>
              </button>
              <button
                type="button"
                onClick={() => setTab("blocked")}
                className={`${tabBtn} ${tab === "blocked" ? tabActive : tabIdle}`}
              >
                Blocked <span className="text-xs opacity-80">({counts.blocked})</span>
              </button>
              <button
                type="button"
                onClick={() => setTab("all")}
                className={`${tabBtn} ${tab === "all" ? tabActive : tabIdle}`}
              >
                All <span className="text-xs opacity-80">({counts.all})</span>
              </button>

              <div className="flex-1" />

              <button onClick={() => load(page)} className={btn} disabled={busy}>
                Refresh
              </button>

              <button
                onClick={() => load(page - 1)}
                disabled={!canPrev || busy}
                className={`${btn} ${!canPrev || busy ? btnDisabled : ""}`}
              >
                Prev
              </button>

              <div className="text-sm text-neutral-400 whitespace-nowrap">
                Page {page} of {totalPages}
              </div>

              <button
                onClick={() => load(page + 1)}
                disabled={!canNext || busy}
                className={`${btn} ${!canNext || busy ? btnDisabled : ""}`}
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {banner ? (
          <div
            className={`mt-4 rounded-xl border px-3 py-2 text-sm ${
              banner.type === "ok"
                ? "border-emerald-900/50 bg-emerald-950/30 text-emerald-200"
                : "border-red-900/50 bg-red-950/30 text-red-200"
            }`}
          >
            {banner.msg}
          </div>
        ) : null}

        {loading ? <p className="mt-4 text-sm text-neutral-400">Loading agents...</p> : null}
        {err ? <p className="mt-4 text-sm text-red-300">{err}</p> : null}

        {!loading && !err ? (
  <div className="mt-4 space-y-4">
    {filtered.map((a) => {
      const r = readiness(a);

      const approveDisabled = busy || !r.ready || a.approval_status === "approved";
      const blockDisabled = busy || a.approval_status === "blocked";
      const pendingDisabled = busy || a.approval_status === "pending";

      return (
        <div
          key={a.internal_user_id}
          className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4"
        >
          {/* Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="text-base font-semibold text-neutral-100">
                {a.first_name} {a.last_name}
              </div>

              <div className="mt-1 text-sm text-neutral-400 break-words">
                {a.email} • @{a.username}
              </div>

              <div className="mt-2 text-xs text-neutral-500">
                Nationality: {a.nationality || "N/A"} • internal_user_id: {a.internal_user_id}
              </div>
            </div>

            {/* Status */}
            <div className="shrink-0">
              <span className={statusPill(a.approval_status)}>{a.approval_status}</span>

              {a.approval_status === "approved" ? (
                <div className="mt-2 text-[11px] text-neutral-500">
                  Approved: {a.approved_at ? fmt(a.approved_at) : "N/A"}
                </div>
              ) : null}
            </div>
          </div>

          {/* China */}
          <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-3">
            <div className="text-sm font-semibold text-neutral-200">China</div>

            <div className="mt-2 text-sm text-neutral-300">
              <div className="text-neutral-200 break-words">{a.china_phone || "N/A"}</div>
              <div className="text-neutral-500">{a.china_city || "N/A"}</div>
              <div className="mt-1 text-xs text-neutral-500">
                Phone verified: {fmt(a.china_phone_verified_at)}
              </div>
            </div>
          </div>

          {/* Readiness */}
          <div className="mt-4">
            <div className="text-sm font-semibold text-neutral-200">Readiness</div>

            <div className="mt-2 flex flex-wrap gap-2">
              <span className={pill(r.phoneOk, "Phone OK", "Phone")}>Phone</span>
              <span className={pill(r.ninProvided, "NIN OK", "NIN")}>NIN</span>
              <span className={pill(r.ninOk, "NIN verified", "NIN verify")}>NIN verify</span>
              <span className={pill(r.addressOk, "Address OK", "Address")}>Address</span>
              <span className={pill(r.bankOk, "Bank OK", "Bank")}>Bank</span>
              <span className={pill(r.ready, "Ready", "Not ready")}>Ready</span>
            </div>

            {!r.ready ? (
              <div className="mt-2 text-sm text-amber-200">
                Cannot approve. Missing: {r.missing.join(", ")}.
              </div>
            ) : (
              <div className="mt-2 text-sm text-emerald-200">Ready for approval.</div>
            )}
          </div>

          {/* Account */}
          <div className="mt-4">
            <span className={accountPill(!!a.is_active)}>
              {a.is_active ? "Login enabled" : "Login disabled"}
            </span>
          </div>

          {/* Actions */}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              className={`${smallPrimary} ${approveDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
              disabled={approveDisabled}
              onClick={() => openConfirm(a, "approve")}
              title={!r.ready ? "Cannot approve until readiness is complete." : ""}
            >
              Approve
            </button>

            <button
              className={`${smallDanger} ${blockDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
              disabled={blockDisabled}
              onClick={() => openConfirm(a, "block")}
            >
              Block
            </button>

            <button
              className={`${smallSecondary} ${pendingDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
              disabled={pendingDisabled}
              onClick={() => openConfirm(a, "pending")}
            >
              Pending
            </button>
          </div>

          {!r.ready ? (
            <div className="mt-2 text-xs text-neutral-500">
              Approve is disabled until readiness is complete.
            </div>
          ) : null}
        </div>
      );
    })}

    {filtered.length === 0 ? (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-400">
        No matching agents.
      </div>
    ) : null}

    <div className="text-xs text-neutral-500">
      Showing {filtered.length} of {tab === "all" ? items.length : counts[tab]} in this tab. Total agents: {total}.
    </div>
  </div>
) : null}
      </div>

      <ConfirmModal
        open={confirmOpen}
        title="Confirm action"
        description={confirmDisabledReason ? confirmDisabledReason : confirmLabel || "Continue?"}
        confirmText={
          confirmAction === "block"
            ? "Yes, block"
            : confirmAction === "approve"
            ? "Yes, approve"
            : "Yes, set pending"
        }
        cancelText="Go back"
        danger={confirmAction === "block"}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={runAction}
      />
    </div>
  );
}