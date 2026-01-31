// app/internal/_components/AgentsPanel.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import ConfirmModal from "./ConfirmModal";
import PasswordModal from "./PasswordModal";

type UserPermRow = {
  id: number;
  username: string;
  role: "admin" | "agent";
  is_active: 0 | 1;
  can_view_leads: 0 | 1;
  can_view_handoffs: 0 | 1;
  can_view_analytics: 0 | 1;
  created_at: string;
};

type AgentProfile = {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  china_phone: string | null;
  china_phone_verified_at: string | null;
  china_city: string | null;
  nationality: string | null;
  nin: string | null;
  nin_verified_at: string | null;
  full_address: string | null;
  payout_status: string | null;
};

type AgentPayoutAccount = {
  bank_code: string | null;
  account_number: string | null;
  account_name: string | null;
  status: string | null;
  verified_at: string | null;
} | null;

type AgentChecklist = {
  phone_verified: boolean;
  nin_provided: boolean;
  nin_verified: boolean;
  bank_provided: boolean;
  bank_verified: boolean;
  address_provided: boolean;
  approved_to_claim: boolean;
};

type AgentsRouteItem = {
  internal_user_id: number;
  username: string;
  is_active: boolean;
  created_at: string;
  can_view_handoffs: boolean;
  profile: AgentProfile | null;
  payout_account: AgentPayoutAccount;
  checklist: AgentChecklist;
};

type UiAgent = {
  id: number; // internal_users.id
  username: string;
  is_active: 0 | 1;
  created_at: string;

  can_view_leads: 0 | 1;
  can_view_handoffs: 0 | 1;
  can_view_analytics: 0 | 1;

  profile: AgentProfile | null;
  payout_account: AgentPayoutAccount;
  checklist: AgentChecklist | null;
};

function safeName(p?: AgentProfile | null) {
  const fn = (p?.first_name || "").trim();
  const ln = (p?.last_name || "").trim();
  const full = `${fn} ${ln}`.trim();
  return full || "–";
}

function boolBadge(ok: boolean) {
  return ok ? "Yes" : "No";
}

export default function AgentsPanel() {
  const [items, setItems] = useState<UiAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Deactivate/reactivate modal
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmUser, setConfirmUser] = useState<UiAgent | null>(null);

  // Reset password flow: confirm -> password modal
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetUser, setResetUser] = useState<UiAgent | null>(null);

  const [pwOpen, setPwOpen] = useState(false);
  const [pwUser, setPwUser] = useState<UiAgent | null>(null);

  // Edit access modal
  const [accessOpen, setAccessOpen] = useState(false);
  const [accessUser, setAccessUser] = useState<UiAgent | null>(null);
  const [accessLeads, setAccessLeads] = useState(false);
  const [accessHandoffs, setAccessHandoffs] = useState(false);
  const [accessAnalytics, setAccessAnalytics] = useState(false);

  const accessDescription = useMemo(() => {
    if (!accessUser) return "";
    return `Set access for "${accessUser.username}".`;
  }, [accessUser]);

  async function load() {
    setLoading(true);
    setErr(null);
    setMsg(null);

    try {
      // 1) Rich agent list (profile + checklist)
      const [agentsRes, usersRes] = await Promise.all([
        fetch("/api/internal/agents", { cache: "no-store" }),
        fetch("/api/internal/users", { cache: "no-store" }),
      ]);

      const agentsData = await agentsRes.json().catch(() => ({}));
      const usersData = await usersRes.json().catch(() => ({}));

      if (!agentsRes.ok || !agentsData?.ok) {
        throw new Error(agentsData?.error || "Failed to load agents");
      }
      if (!usersRes.ok || !usersData?.ok) {
        throw new Error(usersData?.error || "Failed to load user permissions");
      }

      const agents: AgentsRouteItem[] = agentsData.items || [];
      const perms: UserPermRow[] = usersData.items || [];

      const permById = new Map<number, UserPermRow>();
      for (const u of perms) permById.set(Number(u.id), u);

      const merged: UiAgent[] = agents.map((a) => {
        const id = Number(a.internal_user_id);
        const p = permById.get(id);

        return {
          id,
          username: String(a.username || p?.username || ""),
          is_active: p ? p.is_active : a.is_active ? 1 : 0,
          created_at: String(p?.created_at || a.created_at || ""),

          can_view_leads: p ? p.can_view_leads : 0,
          can_view_handoffs: p ? p.can_view_handoffs : a.can_view_handoffs ? 1 : 0,
          can_view_analytics: p ? p.can_view_analytics : 0,

          profile: a.profile || null,
          payout_account: a.payout_account ?? null,
          checklist: a.checklist || null,
        };
      });

      // newest first
      merged.sort((x, y) => y.id - x.id);

      setItems(merged);
    } catch (e: any) {
      setErr(e?.message || "Failed to load agents");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleActive(u: UiAgent) {
    setErr(null);
    setMsg(null);

    const nextActive = u.is_active ? 0 : 1;

    try {
      const res = await fetch("/api/internal/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle_active",
          userId: u.id,
          is_active: nextActive,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data?.error || "Failed to update user");

      setMsg(`Updated "${u.username}".`);
      await load();
    } catch (e: any) {
      setErr(e?.message || "Failed to update user");
    }
  }

  async function updatePermissions(userId: number, leads: boolean, handoffs: boolean, analytics: boolean) {
    setErr(null);
    setMsg(null);

    try {
      const res = await fetch("/api/internal/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_permissions",
          userId,
          can_view_leads: leads,
          can_view_handoffs: handoffs,
          can_view_analytics: analytics,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data?.error || "Failed to update permissions");

      setMsg("Access updated.");
      await load();
    } catch (e: any) {
      setErr(e?.message || "Failed to update permissions");
    }
  }

  async function resetPasswordApi(userId: number, password: string, username: string) {
    setErr(null);
    setMsg(null);

    try {
      const res = await fetch("/api/internal/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reset_password",
          userId,
          newPassword: password,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data?.error || "Failed to reset password");

      setMsg(`Password reset for "${username}". Share securely.`);
      await load();
    } catch (e: any) {
      setErr(e?.message || "Failed to reset password");
    }
  }

  function openAccessModal(u: UiAgent) {
    setAccessUser(u);
    setAccessLeads(!!u.can_view_leads);
    setAccessHandoffs(!!u.can_view_handoffs);
    setAccessAnalytics(!!u.can_view_analytics);
    setAccessOpen(true);
  }

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-neutral-100">Agents</h3>
          <p className="text-xs text-neutral-400">
            Review registrations, approve (handoffs access), deactivate accounts, and reset credentials.
          </p>
        </div>

        <button
          onClick={load}
          className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:border-neutral-700"
        >
          Refresh
        </button>
      </div>

      {msg ? (
        <div className="mt-3 rounded-xl border border-emerald-900/50 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
          {msg}
        </div>
      ) : null}

      {err ? (
        <div className="mt-3 rounded-xl border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-200">
          {err}
        </div>
      ) : null}

      <div className="mt-4">
        {loading ? <p className="text-sm text-neutral-400">Loading...</p> : null}

        {!loading ? (
          <div className="overflow-x-auto rounded-2xl border border-neutral-800">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-900/70 text-neutral-300">
                <tr>
                  <th className="px-3 py-2 text-left">Username</th>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Active</th>
                  <th className="px-3 py-2 text-left">Approved</th>
                  <th className="px-3 py-2 text-left">Phone</th>
                  <th className="px-3 py-2 text-left">Bank</th>
                  <th className="px-3 py-2 text-left">NIN</th>
                  <th className="px-3 py-2 text-left">Address</th>
                  <th className="px-3 py-2 text-left">Created</th>
                  <th className="px-3 py-2 text-left">Actions</th>
                </tr>
              </thead>

              <tbody className="bg-neutral-950">
                {items.map((u) => {
                  const c = u.checklist;

                  const approved = !!u.can_view_handoffs; // this is the gate for projects/chats
                  const phoneOk = c ? c.phone_verified : false;
                  const bankOk = c ? c.bank_verified : false;
                  const ninOk = c ? c.nin_provided : false;
                  const addrOk = c ? c.address_provided : false;

                  return (
                    <tr key={u.id} className="border-t border-neutral-800">
                      <td className="px-3 py-2 text-neutral-100">{u.username}</td>
                      <td className="px-3 py-2 text-neutral-200">{safeName(u.profile)}</td>
                      <td className="px-3 py-2 text-neutral-200">{u.is_active ? "Yes" : "No"}</td>
                      <td className="px-3 py-2 text-neutral-200">{approved ? "Yes" : "No"}</td>
                      <td className="px-3 py-2 text-neutral-200">{boolBadge(phoneOk)}</td>
                      <td className="px-3 py-2 text-neutral-200">{boolBadge(bankOk)}</td>
                      <td className="px-3 py-2 text-neutral-200">{boolBadge(ninOk)}</td>
                      <td className="px-3 py-2 text-neutral-200">{boolBadge(addrOk)}</td>
                      <td className="px-3 py-2 text-neutral-400">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : "–"}
                      </td>

                      <td className="px-3 py-2 whitespace-nowrap">
                        <button
                          className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 hover:border-neutral-700"
                          onClick={() => {
                            setConfirmUser(u);
                            setConfirmOpen(true);
                          }}
                        >
                          {u.is_active ? "Deactivate" : "Reactivate"}
                        </button>

                        <button
                          className="ml-2 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 hover:border-neutral-700"
                          onClick={() => {
                            setResetUser(u);
                            setResetConfirmOpen(true);
                          }}
                        >
                          Reset password
                        </button>

                        <button
                          className="ml-2 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 hover:border-neutral-700"
                          onClick={() => openAccessModal(u)}
                        >
                          Edit access
                        </button>

                        {/* Quick approve / revoke shortcut */}
                        <button
                          className="ml-2 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 hover:border-neutral-700"
                          onClick={async () => {
                            const next = !approved;
                            await updatePermissions(
                              u.id,
                              !!u.can_view_leads,
                              next,
                              !!u.can_view_analytics
                            );
                          }}
                          title="This controls whether the agent can claim projects and access paid chats."
                        >
                          {approved ? "Revoke approval" : "Approve"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {/* Modals */}
      <ConfirmModal
        open={confirmOpen}
        title={confirmUser?.is_active ? "Deactivate agent?" : "Reactivate agent?"}
        description={
          confirmUser?.is_active
            ? "This agent will not be able to sign in until reactivated."
            : "This agent will regain access to the system."
        }
        confirmText={confirmUser?.is_active ? "Deactivate" : "Reactivate"}
        danger={!!confirmUser?.is_active}
        onCancel={() => {
          setConfirmOpen(false);
          setConfirmUser(null);
        }}
        onConfirm={() => {
          if (confirmUser) toggleActive(confirmUser);
          setConfirmOpen(false);
          setConfirmUser(null);
        }}
      />

      <ConfirmModal
        open={resetConfirmOpen}
        title="Reset agent password?"
        description={
          resetUser
            ? `You are about to reset the password for "${resetUser.username}". You will set a new password and share it securely.`
            : ""
        }
        confirmText="Continue"
        cancelText="Cancel"
        onCancel={() => {
          setResetConfirmOpen(false);
          setResetUser(null);
        }}
        onConfirm={() => {
          setResetConfirmOpen(false);
          setPwUser(resetUser);
          setPwOpen(true);
          setResetUser(null);
        }}
      />

      <PasswordModal
        open={pwOpen}
        title="Set new password"
        description={pwUser ? `Set a new password for "${pwUser.username}".` : ""}
        confirmText="Reset password"
        cancelText="Cancel"
        onCancel={() => {
          setPwOpen(false);
          setPwUser(null);
        }}
        onConfirm={async (password) => {
          if (!pwUser) return;
          const username = pwUser.username;
          const userId = pwUser.id;

          setPwOpen(false);
          setPwUser(null);

          await resetPasswordApi(userId, password, username);
        }}
      />

      {/* Access modal */}
      <div
        className={`fixed inset-0 z-50 ${accessOpen ? "flex" : "hidden"} items-center justify-center bg-black/60 backdrop-blur-sm`}
      >
        <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-2xl">
          <h3 className="text-lg font-semibold text-neutral-100">Edit access</h3>
          <p className="mt-2 text-sm text-neutral-400">{accessDescription}</p>

          <div className="mt-4 space-y-3">
            <label className="flex items-center gap-2 text-sm text-neutral-200">
              <input type="checkbox" checked={accessLeads} onChange={(e) => setAccessLeads(e.target.checked)} />
              Allow Leads
            </label>

            <label className="flex items-center gap-2 text-sm text-neutral-200">
              <input
                type="checkbox"
                checked={accessHandoffs}
                onChange={(e) => setAccessHandoffs(e.target.checked)}
              />
              Allow Handoffs (Approved to claim projects)
            </label>

            <label className="flex items-center gap-2 text-sm text-neutral-200">
              <input
                type="checkbox"
                checked={accessAnalytics}
                onChange={(e) => setAccessAnalytics(e.target.checked)}
              />
              Allow Analytics
            </label>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <button
              onClick={() => {
                setAccessOpen(false);
                setAccessUser(null);
              }}
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm text-neutral-200 hover:border-neutral-700"
            >
              Cancel
            </button>

            <button
              onClick={async () => {
                if (!accessUser) return;
                const userId = accessUser.id;

                setAccessOpen(false);
                setAccessUser(null);

                await updatePermissions(userId, accessLeads, accessHandoffs, accessAnalytics);
              }}
              className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-neutral-200"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}