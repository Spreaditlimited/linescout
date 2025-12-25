"use client";

import { useEffect, useMemo, useState } from "react";
import ConfirmModal from "./ConfirmModal";
import PasswordModal from "./PasswordModal";

type InternalUser = {
  id: number;
  username: string;
  role: "admin" | "agent";
  is_active: 0 | 1;
  can_view_leads: 0 | 1;
  can_view_handoffs: 0 | 1;
  can_view_analytics: 0 | 1;
  created_at: string;
};

export default function AgentsPanel() {
  const [items, setItems] = useState<InternalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [createdMsg, setCreatedMsg] = useState<string | null>(null);

  // Create agent form
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [canLeads, setCanLeads] = useState(false);
  const [canHandoffs, setCanHandoffs] = useState(true);
  const [canAnalytics, setCanAnalytics] = useState(false);

  // Deactivate/reactivate modal
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmUser, setConfirmUser] = useState<InternalUser | null>(null);

  // Reset password flow: confirm -> password modal
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetUser, setResetUser] = useState<InternalUser | null>(null);

  const [pwOpen, setPwOpen] = useState(false);
  const [pwUser, setPwUser] = useState<InternalUser | null>(null);

  // Edit access modal
  const [accessOpen, setAccessOpen] = useState(false);
  const [accessUser, setAccessUser] = useState<InternalUser | null>(null);
  const [accessLeads, setAccessLeads] = useState(false);
  const [accessHandoffs, setAccessHandoffs] = useState(true);
  const [accessAnalytics, setAccessAnalytics] = useState(false);

  const accessDescription = useMemo(() => {
    if (!accessUser) return "";
    return `Set page access for "${accessUser.username}".`;
  }, [accessUser]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/internal/users", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data?.error || "Failed to load users");
      setItems(data.items || []);
    } catch (e: any) {
      setErr(e.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function generatePassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$";
    let pw = "";
    for (let i = 0; i < 12; i++) pw += chars[Math.floor(Math.random() * chars.length)];
    setNewPassword(pw);
    setCreatedMsg("Generated a new password. Copy it before you create the agent.");
  }

  async function createAgent() {
    setCreatedMsg(null);
    setErr(null);

    const u = newUsername.trim();
    if (u.length < 3) {
      setErr("Username must be at least 3 characters.");
      return;
    }
    if (newPassword.trim().length < 8) {
      setErr("Password must be at least 8 characters.");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/internal/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: u,
          password: newPassword,
          can_view_leads: canLeads,
          can_view_handoffs: canHandoffs,
          can_view_analytics: canAnalytics,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data?.error || "Failed to create agent");

      setNewUsername("");
      setNewPassword("");
      setCanLeads(false);
      setCanHandoffs(true);
      setCanAnalytics(false);

      setCreatedMsg(`Created agent "${u}". Share credentials securely.`);
      await load();
    } catch (e: any) {
      setErr(e.message || "Failed to create agent");
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(u: InternalUser) {
    setErr(null);
    setCreatedMsg(null);

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

      await load();
    } catch (e: any) {
      setErr(e.message || "Failed to update user");
    }
  }

  async function updatePermissions(userId: number, leads: boolean, handoffs: boolean, analytics: boolean) {
    setErr(null);
    setCreatedMsg(null);

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

      setCreatedMsg("Access updated.");
      await load();
    } catch (e: any) {
      setErr(e.message || "Failed to update permissions");
    }
  }

  async function resetPasswordApi(userId: number, password: string, username: string) {
    setErr(null);
    setCreatedMsg(null);

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

      setCreatedMsg(`Password reset for "${username}". Share securely.`);
      await load();
    } catch (e: any) {
      setErr(e.message || "Failed to reset password");
    }
  }

  function openAccessModal(u: InternalUser) {
    setAccessUser(u);
    setAccessLeads(!!u.can_view_leads);
    setAccessHandoffs(!!u.can_view_handoffs);
    setAccessAnalytics(!!u.can_view_analytics);
    setAccessOpen(true);
  }

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-neutral-100">Agents</h3>
          <p className="text-xs text-neutral-400">Create agents, manage access, and reset credentials.</p>
        </div>

        <div className="w-full lg:max-w-xl rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-neutral-100">Create agent</div>
            <button
              type="button"
              onClick={generatePassword}
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 hover:border-neutral-700"
            >
              Generate Password
            </button>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-1">
              <label className="text-xs text-neutral-400">Username</label>
              <input
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                placeholder="agent2"
              />
            </div>

            <div className="sm:col-span-1">
              <label className="text-xs text-neutral-400">Temporary password</label>
              <input
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                type="text"
                className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                placeholder="Min 8 characters"
              />
            </div>

            <div className="sm:col-span-2 flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-neutral-200">
                <input type="checkbox" checked={canLeads} onChange={(e) => setCanLeads(e.target.checked)} />
                Can view Leads
              </label>

              <label className="flex items-center gap-2 text-sm text-neutral-200">
                <input
                  type="checkbox"
                  checked={canHandoffs}
                  onChange={(e) => setCanHandoffs(e.target.checked)}
                />
                Can view Handoffs
              </label>

              <label className="flex items-center gap-2 text-sm text-neutral-200">
                <input
                  type="checkbox"
                  checked={canAnalytics}
                  onChange={(e) => setCanAnalytics(e.target.checked)}
                />
                Can view Analytics
              </label>
            </div>

            <div className="sm:col-span-2 flex items-center gap-2">
              <button
                onClick={createAgent}
                disabled={creating}
                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-neutral-200 disabled:opacity-60"
              >
                {creating ? "Creating..." : "Create agent"}
              </button>

              <button
                onClick={load}
                className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:border-neutral-700"
              >
                Refresh
              </button>
            </div>

            {createdMsg ? (
              <div className="sm:col-span-2 rounded-xl border border-emerald-900/50 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
                {createdMsg}
              </div>
            ) : null}

            {err ? (
              <div className="sm:col-span-2 rounded-xl border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-200">
                {err}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-4">
        {loading ? <p className="text-sm text-neutral-400">Loading...</p> : null}

        {!loading ? (
          <div className="overflow-x-auto rounded-2xl border border-neutral-800">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-900/70 text-neutral-300">
                <tr>
                  <th className="px-3 py-2 text-left">Username</th>
                  <th className="px-3 py-2 text-left">Active</th>
                  <th className="px-3 py-2 text-left">Leads</th>
                  <th className="px-3 py-2 text-left">Handoffs</th>
                  <th className="px-3 py-2 text-left">Analytics</th>
                  <th className="px-3 py-2 text-left">Created</th>
                  <th className="px-3 py-2 text-left">Actions</th>
                </tr>
              </thead>

              <tbody className="bg-neutral-950">
                {items.map((u) => (
                  <tr key={u.id} className="border-t border-neutral-800">
                    <td className="px-3 py-2 text-neutral-100">{u.username}</td>
                    <td className="px-3 py-2 text-neutral-200">{u.is_active ? "Yes" : "No"}</td>
                    <td className="px-3 py-2 text-neutral-200">{u.can_view_leads ? "Yes" : "No"}</td>
                    <td className="px-3 py-2 text-neutral-200">{u.can_view_handoffs ? "Yes" : "No"}</td>
                    <td className="px-3 py-2 text-neutral-200">{u.can_view_analytics ? "Yes" : "No"}</td>
                    <td className="px-3 py-2 text-neutral-400">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>

                    <td className="px-3 py-2">
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {/* Modals (top-level, not inside table) */}
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
        className={`fixed inset-0 z-50 ${
          accessOpen ? "flex" : "hidden"
        } items-center justify-center bg-black/60 backdrop-blur-sm`}
      >
        <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-2xl">
          <h3 className="text-lg font-semibold text-neutral-100">Edit access</h3>
          <p className="mt-2 text-sm text-neutral-400">{accessDescription}</p>

          <div className="mt-4 space-y-3">
            <label className="flex items-center gap-2 text-sm text-neutral-200">
              <input
                type="checkbox"
                checked={accessLeads}
                onChange={(e) => setAccessLeads(e.target.checked)}
              />
              Allow Leads
            </label>

            <label className="flex items-center gap-2 text-sm text-neutral-200">
              <input
                type="checkbox"
                checked={accessHandoffs}
                onChange={(e) => setAccessHandoffs(e.target.checked)}
              />
              Allow Handoffs
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