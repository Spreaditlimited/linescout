"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type AppUser = {
  id: number;
  email: string;
  display_name: string | null;
  created_at: string;
  country_id?: number | null;
  country_name?: string | null;
  country_iso2?: string | null;
  display_currency_code?: string | null;
  profile_phone?: string | null;

  last_seen_at: string | null;
  last_session_created_at: string | null;
  active_sessions: number;

  conversations_count: number;
  last_conversation_at: string | null;

  white_label_projects_count: number;

  // NEW (from handoffs)
  machine_sourcing_projects_count: number;
  total_projects_count: number;
  last_project_at: string | null;
};

type PendingUser = {
  id: number;
  email: string;
  created_at: string;
  otp_requests: number;
  last_otp_at: string | null;
  followup_email_count?: number | null;
  last_followup_email_at?: string | null;
};

type EmailFailure = {
  id: number;
  email: string | null;
  kind: string;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
};

type FollowupRun = {
  id: number;
  created_at: string;
  start_date: string | null;
  end_date: string | null;
  pending_total: number;
  sent_count: number;
  error_count: number;
};

export default function AdminAppUsersPage() {
  const [tab, setTab] = useState<"app" | "pending">("app");

  const [items, setItems] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [pendingItems, setPendingItems] = useState<PendingUser[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingErr, setPendingErr] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [total, setTotal] = useState(0);

  const [pendingPage, setPendingPage] = useState(1);
  const pendingPageSize = 25;
  const [pendingTotal, setPendingTotal] = useState(0);
  const [followupFrom, setFollowupFrom] = useState("");
  const [followupTo, setFollowupTo] = useState("");
  const [followupSending, setFollowupSending] = useState(false);
  const [followupMsg, setFollowupMsg] = useState<string | null>(null);
  const [followupErr, setFollowupErr] = useState<string | null>(null);
  const [followupRuns, setFollowupRuns] = useState<FollowupRun[]>([]);
  const [emailFailures, setEmailFailures] = useState<EmailFailure[]>([]);
  const [emailFailuresErr, setEmailFailuresErr] = useState<string | null>(null);
  const [emailFailuresLoading, setEmailFailuresLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  async function load(p: number) {
    setLoading(true);
    setErr(null);

    try {
      const res = await fetch(
        `/api/internal/admin/app-users?page=${p}&page_size=${pageSize}`,
        { cache: "no-store" }
      );

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to load users");
      }

      setItems(data.items || []);
      setTotal(Number(data.total || 0));
      setPage(Number(data.page || p));
    } catch (e: any) {
      setErr(e?.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  async function loadPending(p: number) {
    setPendingLoading(true);
    setPendingErr(null);

    try {
      const res = await fetch(
        `/api/internal/admin/pending-users?page=${p}&page_size=${pendingPageSize}`,
        { cache: "no-store" }
      );

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to load pending users");
      }

      setPendingItems(data.items || []);
      setPendingTotal(Number(data.total || 0));
      setPendingPage(Number(data.page || p));
    } catch (e: any) {
      setPendingErr(e?.message || "Failed to load pending users");
    } finally {
      setPendingLoading(false);
    }
  }

  async function loadFollowupRuns() {
    try {
      const res = await fetch("/api/internal/admin/pending-users/followup?limit=5", {
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to load follow-up log");
      setFollowupRuns(data.items || []);
    } catch (e: any) {
      // keep quiet; this is supplemental
    }
  }

  async function loadEmailFailures() {
    setEmailFailuresLoading(true);
    setEmailFailuresErr(null);
    try {
      const res = await fetch("/api/internal/admin/email-send-failures?page=1&page_size=20", {
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to load email failures");
      setEmailFailures(data.items || []);
    } catch (e: any) {
      setEmailFailuresErr(e?.message || "Failed to load email failures");
    } finally {
      setEmailFailuresLoading(false);
    }
  }

  async function sendPendingFollowups() {
    setFollowupMsg(null);
    setFollowupErr(null);
    if (!followupFrom || !followupTo) {
      setFollowupErr("Select a start and end date.");
      return;
    }
    setFollowupSending(true);
    try {
      const res = await fetch("/api/internal/admin/pending-users/followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_date: followupFrom, end_date: followupTo }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to send follow-up emails");
      setFollowupMsg(`Sent ${data.sent || 0} email(s). Errors: ${data.errors || 0}.`);
      await loadPending(pendingPage);
      await loadFollowupRuns();
      await loadEmailFailures();
    } catch (e: any) {
      setFollowupErr(e?.message || "Failed to send follow-up emails");
    } finally {
      setFollowupSending(false);
    }
  }

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab !== "pending") return;
    if (pendingItems.length) return;
    loadPending(1);
    loadFollowupRuns();
    loadEmailFailures();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canPrev = page > 1 && !loading;
  const canNext = page < totalPages && !loading;

  const pendingTotalPages = Math.max(1, Math.ceil(pendingTotal / pendingPageSize));
  const canPrevPending = pendingPage > 1 && !pendingLoading;
  const canNextPending = pendingPage < pendingTotalPages && !pendingLoading;

  function norm(v: any) {
    return String(v ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  const filtered = useMemo(() => {
    const q = norm(debouncedSearch);
    if (!q) return items;

    return items.filter((u) => {
      const hay = [
        u.id,
        u.email,
        u.display_name,
        u.profile_phone,
        u.country_name,
        u.country_iso2,
        u.display_currency_code,
        u.profile_phone,
        u.active_sessions,
        u.conversations_count,
        u.white_label_projects_count,
        u.machine_sourcing_projects_count,
        u.total_projects_count,
      ]
        .map(norm)
        .join(" | ");

      return hay.includes(q);
    });
  }, [items, debouncedSearch]);

  function fmt(d?: string | null) {
    if (!d) return "N/A";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "N/A";
    return dt.toLocaleString();
  }

  const btn =
    "inline-flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:border-neutral-700";
  const btnDisabled = "opacity-50 cursor-not-allowed";
  const tabBtnBase =
    "rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors";
  const tabBtnActive = "border-neutral-600 bg-neutral-900 text-neutral-100";
  const tabBtnIdle = "border-neutral-800 bg-neutral-950 text-neutral-400 hover:text-neutral-200";

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-100">App Users</h2>
            <p className="text-sm text-neutral-400">
              LineScout user app accounts and activity overview.
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              Projects are derived from handoffs (machine_sourcing + white_label).
            </p>

            <div className="mt-3 inline-flex gap-2">
              <button
                type="button"
                onClick={() => setTab("app")}
                className={`${tabBtnBase} ${tab === "app" ? tabBtnActive : tabBtnIdle}`}
              >
                App Users
              </button>
              <button
                type="button"
                onClick={() => setTab("pending")}
                className={`${tabBtnBase} ${tab === "pending" ? tabBtnActive : tabBtnIdle}`}
              >
                Pending Users
              </button>
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
            <div className="flex w-full items-center gap-2 sm:w-[420px]">
              <div className="relative w-full">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search email, name, phone, ID..."
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
                {filtered.length}/{items.length}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => (tab === "app" ? load(page) : loadPending(pendingPage))}
                className={btn}
              >
                Refresh
              </button>

              {tab === "app" ? (
                <>
                  <button
                    onClick={() => load(page - 1)}
                    disabled={!canPrev}
                    className={`${btn} ${!canPrev ? btnDisabled : ""}`}
                  >
                    Prev
                  </button>

                  <div className="text-sm text-neutral-400 whitespace-nowrap">
                    Page {page} of {totalPages}
                  </div>

                  <button
                    onClick={() => load(page + 1)}
                    disabled={!canNext}
                    className={`${btn} ${!canNext ? btnDisabled : ""}`}
                  >
                    Next
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => loadPending(pendingPage - 1)}
                    disabled={!canPrevPending}
                    className={`${btn} ${!canPrevPending ? btnDisabled : ""}`}
                  >
                    Prev
                  </button>

                  <div className="text-sm text-neutral-400 whitespace-nowrap">
                    Page {pendingPage} of {pendingTotalPages}
                  </div>

                  <button
                    onClick={() => loadPending(pendingPage + 1)}
                    disabled={!canNextPending}
                    className={`${btn} ${!canNextPending ? btnDisabled : ""}`}
                  >
                    Next
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {tab === "app" && loading ? (
          <p className="mt-4 text-sm text-neutral-400">Loading users...</p>
        ) : null}
        {tab === "app" && err ? <p className="mt-4 text-sm text-red-300">{err}</p> : null}

        {tab === "pending" && pendingLoading ? (
          <p className="mt-4 text-sm text-neutral-400">Loading pending users...</p>
        ) : null}
        {tab === "pending" && pendingErr ? <p className="mt-4 text-sm text-red-300">{pendingErr}</p> : null}

        {tab === "app" && !loading && !err ? (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-neutral-800">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-900/70 text-neutral-300">
                <tr>
                  <th className="px-3 py-2 text-left border-b border-neutral-800">User</th>
                  <th className="px-3 py-2 text-left border-b border-neutral-800">Name</th>
                  <th className="px-3 py-2 text-left border-b border-neutral-800">WhatsApp / Phone</th>
                  <th className="px-3 py-2 text-left border-b border-neutral-800">Country</th>
                  <th className="px-3 py-2 text-left border-b border-neutral-800">Currency</th>
                  <th className="px-3 py-2 text-left border-b border-neutral-800">Created</th>
                  <th className="px-3 py-2 text-left border-b border-neutral-800">Sessions</th>
                  <th className="px-3 py-2 text-left border-b border-neutral-800">Last seen</th>
                  <th className="px-3 py-2 text-left border-b border-neutral-800">Conversations</th>

                  <th className="px-3 py-2 text-left border-b border-neutral-800">Machine sourcing</th>
                  <th className="px-3 py-2 text-left border-b border-neutral-800">White label</th>
                  <th className="px-3 py-2 text-left border-b border-neutral-800">Projects</th>
                  <th className="px-3 py-2 text-left border-b border-neutral-800">Action</th>
                </tr>
              </thead>

              <tbody className="bg-neutral-950">
                {filtered.map((u) => (
                  <tr key={u.id} className="border-t border-neutral-800 hover:bg-neutral-900/40">
                    <td className="px-3 py-3">
                      <div className="font-semibold text-neutral-100">{u.email}</div>
                      <div className="text-xs text-neutral-500">
                        ID: {u.id}
                      </div>
                    </td>

                    <td className="px-3 py-3 text-sm text-neutral-200">
                      {u.display_name ? u.display_name : "—"}
                    </td>

                    <td className="px-3 py-3 text-sm text-neutral-200 whitespace-nowrap">
                      {u.profile_phone || "—"}
                    </td>

                    <td className="px-3 py-3 text-xs text-neutral-300 whitespace-nowrap">
                      {u.country_name ? `${u.country_name} (${u.country_iso2 || ""})` : "—"}
                    </td>

                    <td className="px-3 py-3 text-xs text-neutral-300 whitespace-nowrap">
                      {u.display_currency_code || "—"}
                    </td>

                    <td className="px-3 py-3 text-xs text-neutral-300 whitespace-nowrap">
                      {fmt(u.created_at)}
                    </td>

                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="font-semibold text-neutral-100">{u.active_sessions}</div>
                      <div className="text-[11px] text-neutral-500">
                        Last: {fmt(u.last_session_created_at)}
                      </div>
                    </td>

                    <td className="px-3 py-3 text-xs text-neutral-300 whitespace-nowrap">
                      {fmt(u.last_seen_at)}
                    </td>

                    <td className="px-3 py-3 text-neutral-200 whitespace-nowrap">
                      {u.conversations_count}
                      <div className="text-[11px] text-neutral-500">
                        {fmt(u.last_conversation_at)}
                      </div>
                    </td>

                    <td className="px-3 py-3 text-neutral-200 whitespace-nowrap">
                      {u.machine_sourcing_projects_count ?? 0}
                    </td>

                    <td className="px-3 py-3 text-neutral-200 whitespace-nowrap">
                      {u.white_label_projects_count ?? 0}
                    </td>

                    <td className="px-3 py-3 text-neutral-200 whitespace-nowrap">
                      <div className="font-semibold text-neutral-100">
                        {u.total_projects_count ?? (Number(u.machine_sourcing_projects_count || 0) + Number(u.white_label_projects_count || 0))}
                      </div>
                      <div className="text-[11px] text-neutral-500">
                        Last: {fmt(u.last_project_at)}
                      </div>
                    </td>

                    <td className="px-3 py-3 whitespace-nowrap">
                      <Link
                        href={`/internal/admin/app-users/${u.id}`}
                        className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 hover:border-neutral-700"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}

                {filtered.length === 0 ? (
                  <tr className="border-t border-neutral-800">
                    <td colSpan={13} className="px-3 py-4 text-sm text-neutral-400">
                      No matching users.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>

            <div className="px-3 py-3 text-xs text-neutral-500">
              Showing {filtered.length} of {items.length} on this page. Total users: {total}.
            </div>
          </div>
        ) : null}

        {tab === "pending" && !pendingLoading && !pendingErr ? (
          <>
            <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-100">Pending user follow-up</h3>
                  <p className="text-xs text-neutral-400">
                    Send a reminder email to pending users within a date range.
                  </p>
                  {followupRuns[0] ? (
                    <p className="mt-2 text-[11px] text-neutral-500">
                      Last run: {fmt(followupRuns[0].created_at)} · Sent {followupRuns[0].sent_count} · Errors{" "}
                      {followupRuns[0].error_count}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    value={followupFrom}
                    onChange={(e) => setFollowupFrom(e.target.value)}
                    className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-200"
                  />
                  <input
                    type="date"
                    value={followupTo}
                    onChange={(e) => setFollowupTo(e.target.value)}
                    className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-200"
                  />
                  <button
                    type="button"
                    onClick={sendPendingFollowups}
                    disabled={followupSending}
                    className={`${btn} ${followupSending ? btnDisabled : ""}`}
                  >
                    {followupSending ? "Sending..." : "Send follow-up email"}
                  </button>
                </div>
              </div>

              {followupErr ? (
                <div className="mt-3 rounded-xl border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-200">
                  {followupErr}
                </div>
              ) : null}
              {followupMsg ? (
                <div className="mt-3 rounded-xl border border-emerald-900/50 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-200">
                  {followupMsg}
                </div>
              ) : null}

              {followupRuns.length ? (
                <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-800">
                  <table className="min-w-full text-xs">
                    <thead className="bg-neutral-900/70 text-neutral-300">
                      <tr>
                        <th className="px-3 py-2 text-left border-b border-neutral-800">When</th>
                        <th className="px-3 py-2 text-left border-b border-neutral-800">Range</th>
                        <th className="px-3 py-2 text-left border-b border-neutral-800">Pending</th>
                        <th className="px-3 py-2 text-left border-b border-neutral-800">Sent</th>
                        <th className="px-3 py-2 text-left border-b border-neutral-800">Errors</th>
                      </tr>
                    </thead>
                    <tbody className="bg-neutral-950">
                      {followupRuns.map((run) => (
                        <tr key={run.id} className="border-t border-neutral-800 hover:bg-neutral-900/40">
                          <td className="px-3 py-2 text-neutral-300 whitespace-nowrap">{fmt(run.created_at)}</td>
                          <td className="px-3 py-2 text-neutral-300 whitespace-nowrap">
                            {run.start_date || "—"} → {run.end_date || "—"}
                          </td>
                          <td className="px-3 py-2 text-neutral-200">{run.pending_total}</td>
                          <td className="px-3 py-2 text-neutral-200">{run.sent_count}</td>
                          <td className="px-3 py-2 text-neutral-200">{run.error_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>

            <div className="mt-4 overflow-x-auto rounded-2xl border border-neutral-800">
              <table className="min-w-full text-sm">
                <thead className="bg-neutral-900/70 text-neutral-300">
                  <tr>
                    <th className="px-3 py-2 text-left border-b border-neutral-800">Email</th>
                    <th className="px-3 py-2 text-left border-b border-neutral-800">Created</th>
                    <th className="px-3 py-2 text-left border-b border-neutral-800">OTP requests</th>
                    <th className="px-3 py-2 text-left border-b border-neutral-800">Last OTP</th>
                    <th className="px-3 py-2 text-left border-b border-neutral-800">Follow-ups</th>
                    <th className="px-3 py-2 text-left border-b border-neutral-800">Last follow-up</th>
                  </tr>
                </thead>

                <tbody className="bg-neutral-950">
                  {pendingItems.map((u) => (
                    <tr key={u.id} className="border-t border-neutral-800 hover:bg-neutral-900/40">
                      <td className="px-3 py-3">
                        <div className="font-semibold text-neutral-100">{u.email}</div>
                        <div className="text-xs text-neutral-500">ID: {u.id}</div>
                      </td>
                      <td className="px-3 py-3 text-xs text-neutral-300 whitespace-nowrap">
                        {fmt(u.created_at)}
                      </td>
                      <td className="px-3 py-3 text-neutral-200 whitespace-nowrap">
                        {u.otp_requests ?? 0}
                      </td>
                      <td className="px-3 py-3 text-xs text-neutral-300 whitespace-nowrap">
                        {fmt(u.last_otp_at)}
                      </td>
                      <td className="px-3 py-3 text-neutral-200 whitespace-nowrap">
                        {u.followup_email_count ?? 0}
                      </td>
                      <td className="px-3 py-3 text-xs text-neutral-300 whitespace-nowrap">
                        {fmt(u.last_followup_email_at)}
                      </td>
                    </tr>
                  ))}

                  {pendingItems.length === 0 ? (
                    <tr className="border-t border-neutral-800">
                      <td colSpan={6} className="px-3 py-4 text-sm text-neutral-400">
                        No pending users.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>

              <div className="px-3 py-3 text-xs text-neutral-500">
                Showing {pendingItems.length} on this page. Total pending users: {pendingTotal}.
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-100">Email send failures</h3>
                  <p className="text-xs text-neutral-400">Recent SMTP/OTP email failures.</p>
                </div>
                <button onClick={loadEmailFailures} className={btn}>
                  Refresh
                </button>
              </div>

              {emailFailuresLoading ? (
                <p className="mt-3 text-xs text-neutral-400">Loading failures...</p>
              ) : null}
              {emailFailuresErr ? (
                <p className="mt-3 text-xs text-red-300">{emailFailuresErr}</p>
              ) : null}

              {!emailFailuresLoading && !emailFailuresErr ? (
                <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-800">
                  <table className="min-w-full text-xs">
                    <thead className="bg-neutral-900/70 text-neutral-300">
                      <tr>
                        <th className="px-3 py-2 text-left border-b border-neutral-800">Email</th>
                        <th className="px-3 py-2 text-left border-b border-neutral-800">Kind</th>
                        <th className="px-3 py-2 text-left border-b border-neutral-800">Error</th>
                        <th className="px-3 py-2 text-left border-b border-neutral-800">When</th>
                      </tr>
                    </thead>
                    <tbody className="bg-neutral-950">
                      {emailFailures.map((f) => (
                        <tr key={f.id} className="border-t border-neutral-800 hover:bg-neutral-900/40">
                          <td className="px-3 py-2 text-neutral-200">{f.email || "—"}</td>
                          <td className="px-3 py-2 text-neutral-200">{f.kind}</td>
                          <td className="px-3 py-2 text-neutral-300">
                            <div className="font-semibold text-neutral-200">{f.error_code || "Error"}</div>
                            <div className="text-[11px] text-neutral-500">
                              {String(f.error_message || "").slice(0, 140)}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-neutral-300 whitespace-nowrap">{fmt(f.created_at)}</td>
                        </tr>
                      ))}
                      {emailFailures.length === 0 ? (
                        <tr className="border-t border-neutral-800">
                          <td colSpan={4} className="px-3 py-3 text-xs text-neutral-400">
                            No email failures logged.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
