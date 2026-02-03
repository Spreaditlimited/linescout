"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type AppUser = {
  id: number;
  email: string;
  display_name: string | null;
  created_at: string;

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

export default function AdminAppUsersPage() {
  const [items, setItems] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [total, setTotal] = useState(0);

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

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canPrev = page > 1 && !loading;
  const canNext = page < totalPages && !loading;

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
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
            <div className="flex w-full items-center gap-2 sm:w-[420px]">
              <div className="relative w-full">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search email, name, ID..."
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
              <button onClick={() => load(page)} className={btn}>
                Refresh
              </button>

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
            </div>
          </div>
        </div>

        {loading ? <p className="mt-4 text-sm text-neutral-400">Loading users...</p> : null}
        {err ? <p className="mt-4 text-sm text-red-300">{err}</p> : null}

        {!loading && !err ? (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-neutral-800">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-900/70 text-neutral-300">
                <tr>
                  <th className="px-3 py-2 text-left border-b border-neutral-800">User</th>
                  <th className="px-3 py-2 text-left border-b border-neutral-800">Name</th>
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
                    <td colSpan={8} className="px-3 py-4 text-sm text-neutral-400">
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
      </div>
    </div>
  );
}
