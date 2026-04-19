"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authFetch } from "@/lib/auth-client";
import SearchableSelect from "../../internal/_components/SearchableSelect";

type ProfileResponse = {
  ok?: boolean;
  email?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  country_id?: number | null;
  display_currency_code?: string | null;
  white_label_trial_ends_at?: string | null;
  white_label_plan?: string | null;
  white_label_subscription_status?: string | null;
  white_label_subscription_provider?: string | null;
  white_label_subscription_id?: string | null;
  white_label_next_billing_at?: string | null;
  white_label_trial_days?: number | null;
  white_label_daily_reveals?: number | null;
  white_label_insights_daily_limit?: number | null;
  white_label_exempt?: {
    starts_at: string;
    ends_at: string;
    source?: string | null;
    notes?: string | null;
  } | null;
  countries?: { id: number; name: string; iso2: string; default_currency_id?: number | null }[];
  currencies?: { id: number; code: string; symbol?: string | null }[];
  country_currencies?: { country_id: number; currency_id: number }[];
  error?: string;
};

type TeamMember = {
  id: number;
  user_id: number;
  role: "owner" | "member" | string;
  status: string;
  email: string;
  display_name: string | null;
  joined_at: string | null;
};

type TeamInvite = {
  id: number;
  email: string;
  role: "owner" | "member" | string;
  status: "pending" | "accepted" | "revoked" | "expired" | string;
  expires_at: string | null;
  accepted_at: string | null;
  revoked_at: string | null;
  invited_by_email: string | null;
  created_at: string | null;
};

type AccountOption = {
  account_id: number;
  role: "owner" | "member" | string;
  name: string | null;
  is_active: boolean;
};

type PendingInvite = {
  id: number;
  account_id: number;
  role: "owner" | "member" | string;
  account_name: string | null;
  owner_email: string | null;
  invited_by_email: string | null;
  expires_at: string | null;
  created_at: string | null;
};

export default function ProfilePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [countries, setCountries] = useState<ProfileResponse["countries"]>([]);
  const [currencies, setCurrencies] = useState<ProfileResponse["currencies"]>([]);
  const [countryId, setCountryId] = useState<number | "">("");
  const [displayCurrencyCode, setDisplayCurrencyCode] = useState("");
  const [subscriptionPlan, setSubscriptionPlan] = useState("");
  const [subscriptionStatus, setSubscriptionStatus] = useState("");
  const [subscriptionProvider, setSubscriptionProvider] = useState("");
  const [subscriptionId, setSubscriptionId] = useState("");
  const [nextBillingAt, setNextBillingAt] = useState<string | null>(null);
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  const [trialDays, setTrialDays] = useState(0);
  const [dailyReveals, setDailyReveals] = useState(0);
  const [dailyInsights, setDailyInsights] = useState(0);
  const [exemption, setExemption] = useState<ProfileResponse["white_label_exempt"]>(null);
  const isNigeria = (() => {
    const country = (countries || []).find((c) => Number(c.id) === Number(countryId));
    return String(country?.iso2 || "").toUpperCase() === "NG";
  })();
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [accountRole, setAccountRole] = useState<"owner" | "member">("member");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamActionLoading, setTeamActionLoading] = useState(false);
  const [teamMessage, setTeamMessage] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [switchAccountId, setSwitchAccountId] = useState<number | "">("");
  const [activeAccountId, setActiveAccountId] = useState<number | "">("");
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);

  async function loadTeam() {
    setTeamLoading(true);
    try {
      const [membersRes, invitesRes, accountsRes, pendingRes] = await Promise.all([
        authFetch("/api/mobile/account/members"),
        authFetch("/api/mobile/account/invites"),
        authFetch("/api/mobile/account/list"),
        authFetch("/api/mobile/account/invites/pending"),
      ]);

      const membersJson = await membersRes.json().catch(() => ({}));
      const invitesJson = await invitesRes.json().catch(() => ({}));
      const accountsJson = await accountsRes.json().catch(() => ({}));
      const pendingJson = await pendingRes.json().catch(() => ({}));

      if (membersRes.ok) {
        const role = String(membersJson?.account?.role || "member").toLowerCase() === "owner" ? "owner" : "member";
        setAccountRole(role);
        setMembers(Array.isArray(membersJson?.members) ? membersJson.members : []);
      }

      if (invitesRes.ok) {
        setInvites(Array.isArray(invitesJson?.invites) ? invitesJson.invites : []);
      }
      if (accountsRes.ok) {
        const rows = Array.isArray(accountsJson?.accounts) ? accountsJson.accounts : [];
        setAccounts(rows);
        const activeRow = rows.find((r: any) => !!r?.is_active);
        const activeId = activeRow ? Number(activeRow.account_id) : "";
        setActiveAccountId(activeId);
        setSwitchAccountId("");
      }
      if (pendingRes.ok) {
        setPendingInvites(Array.isArray(pendingJson?.items) ? pendingJson.items : []);
      } else {
        setPendingInvites([]);
      }
    } finally {
      setTeamLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function load() {
      setStatus("loading");
      setMessage(null);
      const res = await authFetch("/api/mobile/profile");
      const json: ProfileResponse = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) {
          router.replace("/sign-in");
          return;
        }
        if (active) {
          setStatus("error");
          setMessage(json?.error || "Unable to load profile.");
        }
        return;
      }
      if (active) {
        setEmail(String(json?.email || ""));
        setFirstName(String(json?.first_name || ""));
        setLastName(String(json?.last_name || ""));
        setPhone(String(json?.phone || ""));
        setCountries(Array.isArray(json?.countries) ? json.countries : []);
        setCurrencies(Array.isArray(json?.currencies) ? json.currencies : []);
        setCountryId(typeof json?.country_id === "number" ? json.country_id : "");
        setDisplayCurrencyCode(String(json?.display_currency_code || ""));
        setSubscriptionPlan(String(json?.white_label_plan || ""));
        setSubscriptionStatus(String(json?.white_label_subscription_status || ""));
        setSubscriptionProvider(String(json?.white_label_subscription_provider || ""));
        setSubscriptionId(String(json?.white_label_subscription_id || ""));
        setNextBillingAt(json?.white_label_next_billing_at || null);
        setTrialEndsAt(json?.white_label_trial_ends_at || null);
        setTrialDays(Number(json?.white_label_trial_days || 0));
        setDailyReveals(Number(json?.white_label_daily_reveals || 0));
        setDailyInsights(Number(json?.white_label_insights_daily_limit || 0));
        setExemption(json?.white_label_exempt || null);
        setStatus("idle");
        await loadTeam();
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    const inviteToken = String(searchParams.get("invite_token") || "").trim();
    if (!inviteToken) return;
    let active = true;
    (async () => {
      setTeamActionLoading(true);
      setTeamMessage(null);
      const res = await authFetch("/api/mobile/account/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: inviteToken }),
      });
      const json = await res.json().catch(() => ({}));
      if (!active) return;
      if (res.ok && json?.ok) {
        setTeamMessage("Invite accepted. You now have access to this account.");
      } else {
        setTeamMessage(json?.error || "Unable to accept invite.");
      }
      await loadTeam();
      setTeamActionLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [searchParams]);

  useEffect(() => {
    if (!countryId) return;
    if (displayCurrencyCode) return;
    const next = getCountryDefaultCurrency(countryId);
    if (next) setDisplayCurrencyCode(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryId, countries, currencies]);

  async function handleSignOut() {
    await authFetch("/api/auth/sign-out", { method: "POST" });
    router.replace("/sign-in");
  }

  async function handleSendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) {
      setTeamMessage("Enter an email to invite.");
      return;
    }
    setTeamActionLoading(true);
    setTeamMessage(null);
    const res = await authFetch("/api/mobile/account/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail.trim() }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      setTeamMessage(json?.error || "Unable to send invite.");
      setTeamActionLoading(false);
      return;
    }
    setInviteEmail("");
    setTeamMessage("Invite sent.");
    await loadTeam();
    setTeamActionLoading(false);
  }

  async function handleRevokeInvite(inviteId: number) {
    setTeamActionLoading(true);
    setTeamMessage(null);
    const res = await authFetch("/api/mobile/account/invites/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invite_id: inviteId }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      setTeamMessage(json?.error || "Unable to revoke invite.");
      setTeamActionLoading(false);
      return;
    }
    setTeamMessage("Invite revoked.");
    await loadTeam();
    setTeamActionLoading(false);
  }

  async function handleRemoveMember(memberUserId: number) {
    setTeamActionLoading(true);
    setTeamMessage(null);
    const res = await authFetch("/api/mobile/account/members/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ member_user_id: memberUserId }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      setTeamMessage(json?.error || "Unable to remove member.");
      setTeamActionLoading(false);
      return;
    }
    setTeamMessage("Member removed.");
    await loadTeam();
    setTeamActionLoading(false);
  }

  async function handleSwitchAccount() {
    if (!switchAccountId) {
      setTeamMessage("Select an account.");
      return;
    }
    if (switchAccountId === activeAccountId) {
      setTeamMessage("Select a different account.");
      return;
    }
    setTeamActionLoading(true);
    setTeamMessage(null);
    const res = await authFetch("/api/mobile/account/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_id: switchAccountId }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      setTeamMessage(json?.error || "Unable to switch account.");
      setTeamActionLoading(false);
      return;
    }
    setTeamMessage("Account switched.");
    setActiveAccountId(Number(switchAccountId));
    setSwitchAccountId("");
    await loadTeam();
    setTeamActionLoading(false);
  }

  async function handleAcceptPendingInvite(inviteId: number) {
    setTeamActionLoading(true);
    setTeamMessage(null);
    const res = await authFetch("/api/mobile/account/invites/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invite_id: inviteId }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      setTeamMessage(json?.error || "Unable to accept invite.");
      setTeamActionLoading(false);
      return;
    }
    setTeamMessage("Invite accepted. Switched to the invited account.");
    await loadTeam();
    setTeamActionLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setMessage(null);

    const res = await authFetch("/api/mobile/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: firstName,
        last_name: lastName,
        phone,
        country_id: countryId || null,
        display_currency_code: null,
      }),
    });

    const json: ProfileResponse = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      setStatus("error");
      setMessage(json?.error || "Unable to save profile.");
      return;
    }

    setEmail(String(json?.email || email));
    setFirstName(String(json?.first_name || firstName));
    setLastName(String(json?.last_name || lastName));
    setPhone(String(json?.phone || phone));
    setCountryId(typeof json?.country_id === "number" ? json.country_id : countryId);
    setDisplayCurrencyCode(String(json?.display_currency_code || displayCurrencyCode));
    setSubscriptionPlan(String(json?.white_label_plan || subscriptionPlan));
    setSubscriptionStatus(String(json?.white_label_subscription_status || subscriptionStatus));
    setSubscriptionProvider(String(json?.white_label_subscription_provider || subscriptionProvider));
    setSubscriptionId(String(json?.white_label_subscription_id || subscriptionId));
    setNextBillingAt(json?.white_label_next_billing_at || nextBillingAt);
    setTrialEndsAt(json?.white_label_trial_ends_at || trialEndsAt);
    setTrialDays(Number(json?.white_label_trial_days || trialDays));
    setDailyReveals(Number(json?.white_label_daily_reveals || dailyReveals));
    setDailyInsights(Number(json?.white_label_insights_daily_limit || dailyInsights));
    setExemption(json?.white_label_exempt || exemption);
    setStatus("idle");
    setMessage("Profile updated.");
  }

  const countryOptions = [{ value: "", label: "Select country" }].concat(
    (countries || []).map((c) => ({
      value: String(c.id),
      label: `${c.name} (${c.iso2})`,
    }))
  );

  function getCountryDefaultCurrency(nextCountryId: number | "") {
    if (!nextCountryId) return "";
    const country = (countries || []).find((c) => Number(c.id) === Number(nextCountryId));
    const defaultCurrencyId = country?.default_currency_id ? Number(country.default_currency_id) : null;
    if (!defaultCurrencyId) return "";
    const currency = (currencies || []).find((c) => Number(c.id) === defaultCurrencyId);
    return currency?.code ? String(currency.code) : "";
  }

  const trialActive = (() => {
    if (!trialEndsAt) return false;
    const end = new Date(trialEndsAt);
    if (Number.isNaN(end.valueOf())) return false;
    return new Date() <= end;
  })();

  const exemptionActive = (() => {
    if (!exemption?.ends_at) return false;
    const end = new Date(exemption.ends_at);
    if (Number.isNaN(end.valueOf())) return false;
    return new Date() <= end;
  })();

  const subscriptionActive =
    subscriptionPlan.toLowerCase() === "paid" && subscriptionStatus.toLowerCase() === "active";
  const cancelledActive =
    subscriptionPlan.toLowerCase() === "paid" &&
    subscriptionStatus.toLowerCase() === "cancelled" &&
    nextBillingAt &&
    new Date() <= new Date(nextBillingAt);
  const subscriptionLabel = subscriptionActive
    ? "Active"
    : cancelledActive
    ? "Canceling"
    : trialActive
    ? "Trial"
    : subscriptionStatus
    ? subscriptionStatus.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase())
    : "Not active";
  const trialLabel = trialActive
    ? `Trial ends ${new Date(trialEndsAt || "").toLocaleDateString()}`
    : null;
  const showManageLink = subscriptionProvider.toLowerCase() === "paypal" && Boolean(subscriptionId);
  const showSubscribeLink = !subscriptionActive && !cancelledActive;
  const accessLabel = subscriptionActive
    ? "Paid subscription"
    : cancelledActive
    ? "Paid (cancels soon)"
    : exemptionActive
    ? "Exempted access"
    : trialActive
    ? "Trial access"
    : "No access";
  const accessExpiresAt = subscriptionActive
    ? null
    : cancelledActive
    ? nextBillingAt
    : exemptionActive
    ? exemption?.ends_at || null
    : trialActive
    ? trialEndsAt
    : null;
  const amazonRevealLabel =
    subscriptionActive || exemptionActive || cancelledActive ? "Unlimited" : `${dailyReveals} per day`;
  const insightsLabel =
    subscriptionActive || exemptionActive || cancelledActive ? "Unlimited" : `${dailyInsights} per day`;
  const returnStatus = String(searchParams.get("status") || "").toLowerCase();
  const switchableAccounts = useMemo(
    () => accounts.filter((a) => Number(a.account_id) !== Number(activeAccountId)),
    [accounts, activeAccountId]
  );
  const showSelfOnlyMembersHint =
    members.length === 1 &&
    String(members[0]?.email || "").toLowerCase() === String(email || "").toLowerCase() &&
    pendingInvites.length > 0;


  return (
    <div className="px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Profile</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Update your personal details. Phone number is required for virtual accounts.
        </p>
        {returnStatus === "success" ? (
          <p className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            Subscription approved. Access updates automatically once PayPal confirmation is received.
          </p>
        ) : null}
        {returnStatus === "cancel" ? (
          <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Subscription checkout was canceled.
          </p>
        ) : null}
      </div>

      <div className="mt-6 w-full max-w-6xl">
        <div className="grid gap-6 xl:grid-cols-12">
          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm xl:col-span-7">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Personal details</p>
          {firstName && lastName && phone ? (
            <span className="rounded-full border border-[rgba(45,52,97,0.2)] bg-[rgba(45,52,97,0.08)] px-3 py-1 text-xs font-semibold text-[var(--agent-blue)]">
              Completed
            </span>
          ) : (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
              Incomplete
            </span>
          )}
        </div>

        {status === "loading" ? (
          <p className="mt-3 text-sm text-neutral-600">Loading profile…</p>
        ) : null}

        {status === "error" ? (
          <p className="mt-3 text-sm text-red-600">{message}</p>
        ) : null}

        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-600">Email</label>
            <input
              type="email"
              value={email}
              disabled
              className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700 shadow-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-600">First name</label>
            <input
              type="text"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 shadow-sm focus:border-[rgba(45,52,97,0.45)] focus:outline-none focus:ring-2 focus:ring-[rgba(45,52,97,0.18)]"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-600">Last name</label>
            <input
              type="text"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 shadow-sm focus:border-[rgba(45,52,97,0.45)] focus:outline-none focus:ring-2 focus:ring-[rgba(45,52,97,0.18)]"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-600">Phone number</label>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+234 801 234 5678"
              className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 shadow-sm focus:border-[rgba(45,52,97,0.45)] focus:outline-none focus:ring-2 focus:ring-[rgba(45,52,97,0.18)]"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-600">Country</label>
            <SearchableSelect
              value={countryId === "" ? "" : String(countryId)}
              onChange={(value) => {
                const next = value ? Number(value) : "";
                setCountryId(next);
                setDisplayCurrencyCode(getCountryDefaultCurrency(next));
              }}
              options={countryOptions}
              placeholder="Select country"
              variant="light"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-600">Display currency</label>
            <input
              type="text"
              value={displayCurrencyCode}
              disabled
              className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700 shadow-sm"
            />
          </div>

          {message && status === "idle" ? (
            <div className="rounded-2xl border border-[rgba(45,52,97,0.2)] bg-[rgba(45,52,97,0.08)] px-4 py-3 text-xs text-[var(--agent-blue)]">
              {message}
            </div>
          ) : null}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={status === "saving"}
          >
            {status === "saving" ? "Saving..." : "Save changes"}
          </button>
        </form>
          </div>

          <div className="self-start rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm xl:col-span-5">
            {!isNigeria ? (
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                    White label subscription
                  </p>
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap ${
                      subscriptionActive
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : trialActive
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-neutral-200 bg-white text-neutral-600"
                    }`}
                  >
                    {subscriptionLabel}
                  </span>
                </div>
                <div className="mt-2 text-sm text-neutral-600">
                  {trialLabel ? <p>{trialLabel}</p> : <p>Manage your white label access and billing.</p>}
                </div>
                {(subscriptionActive || cancelledActive) && nextBillingAt ? (
                  <div className="mt-2 text-xs text-neutral-500">
                    {cancelledActive ? "Access ends" : "Next billing date"}:{" "}
                    {new Date(nextBillingAt).toLocaleDateString()}.
                  </div>
                ) : null}
                {showManageLink || showSubscribeLink ? (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {showSubscribeLink ? (
                      <Link
                        href="/white-label/subscribe"
                        className="btn btn-primary inline-flex items-center justify-center px-4 py-2 text-xs font-semibold"
                      >
                        Subscribe now
                      </Link>
                    ) : null}
                    {showManageLink ? (
                      <Link
                        href="/white-label/subscribe"
                        className="inline-flex text-xs font-semibold text-[var(--agent-blue)]"
                      >
                        Manage billing
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className={`${!isNigeria ? "mt-4" : ""} rounded-2xl border border-neutral-200 bg-white p-4`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                  White label access
                </p>
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap ${
                    subscriptionActive
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : exemptionActive
                      ? "border-blue-200 bg-blue-50 text-blue-700"
                      : trialActive
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-neutral-200 bg-white text-neutral-600"
                  }`}
                >
                  {accessLabel}
                </span>
              </div>
              <div className="mt-2 text-sm text-neutral-600">
                {accessExpiresAt ? (
                  <p>Access ends {new Date(accessExpiresAt).toLocaleDateString()}.</p>
                ) : (
                  <p>Access details and limits for your account.</p>
                )}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3 text-xs text-neutral-600">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-neutral-400">
                    Amazon reveals
                  </p>
                  <p className="mt-1 text-sm font-semibold text-neutral-900">{amazonRevealLabel}</p>
                </div>
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3 text-xs text-neutral-600">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-neutral-400">
                    Premium insights
                  </p>
                  <p className="mt-1 text-sm font-semibold text-neutral-900">{insightsLabel}</p>
                </div>
              </div>
              {exemptionActive ? (
                <div className="mt-3 text-xs text-neutral-500">
                  Exemption source: {exemption?.source || "manual"}
                  {exemption?.notes ? ` • ${exemption.notes}` : ""}
                </div>
              ) : null}
              {!subscriptionActive && !exemptionActive && trialActive && trialDays ? (
                <div className="mt-3 text-xs text-neutral-500">
                  Trial length: {trialDays} day{trialDays === 1 ? "" : "s"}.
                </div>
              ) : null}
            </div>
          </div>

        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm xl:col-span-12">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Team access</p>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap ${
                accountRole === "owner"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-neutral-200 bg-neutral-50 text-neutral-600"
              }`}
            >
              {accountRole === "owner" ? "Owner" : "Member"}
            </span>
          </div>

          <p className="mt-2 text-sm text-neutral-600">
            Invite teammates to collaborate in the same LineScout account.
          </p>

          {pendingInvites.length ? (
            <div className="mt-3 space-y-2">
              {pendingInvites.map((inv) => (
                <div
                  key={inv.id}
                  className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-amber-700">
                    Pending invite
                  </p>
                  <p className="mt-1 text-sm text-amber-900">
                    {inv.account_name || `Account ${inv.account_id}`}
                  </p>
                  <p className="mt-1 text-xs text-amber-800">
                    Owner: {inv.owner_email || "Unknown"}
                    {inv.expires_at ? ` · Expires ${new Date(inv.expires_at).toLocaleDateString()}` : ""}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleAcceptPendingInvite(inv.id)}
                    disabled={teamActionLoading}
                    className="btn btn-primary mt-2 w-full px-4 py-2 text-xs sm:w-auto"
                  >
                    {teamActionLoading ? "Working..." : "Accept invite"}
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <SearchableSelect
              value={switchAccountId === "" ? "" : String(switchAccountId)}
              onChange={(value) => setSwitchAccountId(value ? Number(value) : "")}
              options={[
                {
                  value: "",
                  label: switchableAccounts.length ? "Select account" : "No other account available",
                },
                ...switchableAccounts.map((a) => ({
                  value: String(a.account_id),
                  label: `${a.name || `Account ${a.account_id}`} (${a.role})`,
                })),
              ]}
              placeholder="Select account"
              variant="light"
              className="w-full"
              disabled={!switchableAccounts.length}
            />
            <button
              type="button"
              onClick={handleSwitchAccount}
              disabled={
                teamActionLoading || !switchableAccounts.length || !switchAccountId || switchAccountId === activeAccountId
              }
              className="btn btn-outline w-full px-4 py-3 text-xs sm:w-auto sm:min-w-[150px]"
            >
              {teamActionLoading ? "Working..." : "Switch account"}
            </button>
          </div>

          {teamMessage ? (
            <div className="mt-3 rounded-xl border border-[rgba(45,52,97,0.2)] bg-[rgba(45,52,97,0.08)] px-3 py-2 text-xs text-[var(--agent-blue)]">
              {teamMessage}
            </div>
          ) : null}

          {accountRole === "owner" ? (
            <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={handleSendInvite}>
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="teammate@email.com"
                className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 shadow-sm focus:border-[rgba(45,52,97,0.45)] focus:outline-none focus:ring-2 focus:ring-[rgba(45,52,97,0.18)]"
              />
              <button
                type="submit"
                disabled={teamActionLoading}
                className="btn btn-primary w-full px-4 py-3 text-xs sm:w-auto sm:min-w-[150px]"
              >
                {teamActionLoading ? "Working..." : "Send invite"}
              </button>
            </form>
          ) : null}

          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Members</p>
            {teamLoading ? (
              <p className="mt-2 text-sm text-neutral-500">Loading members…</p>
            ) : showSelfOnlyMembersHint ? (
              <p className="mt-2 text-sm text-neutral-500">
                You are currently viewing your personal account. Accept your pending invite above to join the shared account.
              </p>
            ) : members.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-500">No members found.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {members.map((m) => (
                  <div
                    key={m.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-neutral-900">{m.display_name || m.email}</p>
                      <p className="text-xs text-neutral-500">{m.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-neutral-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-600">
                        {m.role}
                      </span>
                      {accountRole === "owner" && m.role !== "owner" ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveMember(Number(m.user_id))}
                          disabled={teamActionLoading}
                          className="rounded-lg border border-red-200 bg-white px-2 py-1 text-xs font-semibold text-red-700"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Invites</p>
            {teamLoading ? (
              <p className="mt-2 text-sm text-neutral-500">Loading invites…</p>
            ) : invites.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-500">No invites yet.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {invites.slice(0, 8).map((inv) => (
                  <div
                    key={inv.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-neutral-900">{inv.email}</p>
                      <p className="text-xs text-neutral-500">
                        {inv.status}
                        {inv.expires_at ? ` · expires ${new Date(inv.expires_at).toLocaleDateString()}` : ""}
                      </p>
                    </div>
                    {accountRole === "owner" && inv.status === "pending" ? (
                      <button
                        type="button"
                        onClick={() => handleRevokeInvite(inv.id)}
                        disabled={teamActionLoading}
                        className="rounded-lg border border-amber-200 bg-white px-2 py-1 text-xs font-semibold text-amber-700"
                      >
                        Revoke
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        </div>

        <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Session</p>
          <p className="mt-2 text-sm text-neutral-600">Sign out of your LineScout account on this device.</p>
          <button
            type="button"
            onClick={handleSignOut}
            className="btn btn-outline mt-3 px-4 py-2 text-xs"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
