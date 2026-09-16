"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import * as Dialog from "@radix-ui/react-dialog";
import { Search, Sun, Moon, Menu, X, PanelLeftClose, PanelLeftOpen, LogOut, BriefcaseBusiness, Users, MessageSquare, Truck, Repeat2, Headphones, ChartNoAxesCombined, CreditCard, Wallet, Receipt, UserCheck, ShieldCheck, Package, Settings, Bell, Factory, Percent, UserRound, LoaderCircle, ExternalLink, CircleAlert, type LucideIcon } from "lucide-react";
import styles from "./InternalWorkspace.module.css";

type User = { username: string; role: "admin" | "agent"; permissions: { can_view_leads: boolean; can_view_handoffs: boolean; can_view_analytics: boolean } };
type Item = { label: string; href: string; icon: LucideIcon; permission: "admin" | keyof User["permissions"] };
const groups: { label: string; items: Item[] }[] = [
  { label: "Operations", items: [
    { label: "Sourcing projects", href: "/internal/agent-handoffs", icon: BriefcaseBusiness, permission: "can_view_handoffs" },
    { label: "Leads", href: "/internal/leads", icon: Users, permission: "can_view_leads" },
    { label: "Paid chat", href: "/internal/paid-chat", icon: MessageSquare, permission: "can_view_handoffs" },
    { label: "Shipments", href: "/internal/shipments", icon: Truck, permission: "admin" },
    { label: "Reorders", href: "/internal/admin/reorders", icon: Repeat2, permission: "admin" },
    { label: "Agent support", href: "/internal/agent-support", icon: Headphones, permission: "admin" },
    { label: "Analytics", href: "/internal/analytics", icon: ChartNoAxesCombined, permission: "can_view_analytics" },
  ] },
  { label: "Finance", items: [
    { label: "Payments", href: "/internal/payments", icon: CreditCard, permission: "admin" },
    { label: "Accounting", href: "/internal/accounting", icon: Receipt, permission: "admin" },
    { label: "Payouts", href: "/internal/admin/payouts", icon: Wallet, permission: "admin" },
    { label: "Customer payouts", href: "/internal/user-payouts", icon: CreditCard, permission: "admin" },
    { label: "Wallets", href: "/internal/wallets", icon: Wallet, permission: "admin" },
    { label: "VAT rates", href: "/internal/admin/vat-rates", icon: Percent, permission: "admin" },
    { label: "Quote add-ons", href: "/internal/admin/quote-addons", icon: Receipt, permission: "admin" },
  ] },
  { label: "People & catalogue", items: [
    { label: "App users", href: "/internal/admin/app-users", icon: Users, permission: "admin" },
    { label: "Agents", href: "/internal/agents", icon: UserRound, permission: "admin" },
    { label: "Agent approvals", href: "/internal/admin/agent-approval", icon: UserCheck, permission: "admin" },
    { label: "Reviewer access", href: "/internal/admin/reviewer-accounts", icon: ShieldCheck, permission: "admin" },
    { label: "Affiliate programme", href: "https://admin.sureimports.com/dashboard/affiliate-program", icon: Users, permission: "admin" },
    { label: "White-label products", href: "/internal/admin/white-label-products", icon: Package, permission: "admin" },
    { label: "Machines", href: "/internal/admin/machines", icon: Factory, permission: "admin" },
  ] },
  { label: "Workspace", items: [
    { label: "Notifications", href: "/internal/notifications", icon: Bell, permission: "admin" },
    { label: "Settings", href: "/internal/settings", icon: Settings, permission: "admin" },
  ] },
];

function Brand() {
  return <Link href="/internal" className={styles.brand} aria-label="Sure Imports LineScout dashboard">
    <Image src="/images/svg-logo.svg" alt="Sure Imports" width={190} height={40} className={styles.lightLogo} />
    <Image src="/images/svg-logo-white.svg" alt="Sure Imports" width={190} height={40} className={styles.darkLogo} />
    <span>LINESCOUT</span>
  </Link>;
}

function Navigation({ permitted, currentHref, compact = false, onNavigate, signOut, signingOut }: {
  permitted: typeof groups; currentHref?: string; compact?: boolean; onNavigate: () => void; signOut: () => void; signingOut: boolean;
}) {
  return <>
    <nav className={styles.navigation} aria-label="Internal dashboard">
      {permitted.map(group => <div className={styles.group} key={group.label}>
        <p className={compact ? styles.srOnly : styles.groupLabel}>{group.label}</p>
        {group.items.map(item => <Link key={item.href} href={item.href} className={styles.navLink} data-active={currentHref === item.href} aria-current={currentHref === item.href ? "page" : undefined} title={compact ? item.label : undefined} onClick={onNavigate} target={item.href.startsWith("https:") ? "_blank" : undefined} rel={item.href.startsWith("https:") ? "noopener noreferrer" : undefined}>
          <item.icon size={19} aria-hidden="true" /><span className={compact ? styles.srOnly : undefined}>{item.label}{item.href.startsWith("https:") && <span className={styles.srOnly}> (opens in a new tab)</span>}</span>
        </Link>)}
      </div>)}
    </nav>
    <div className={styles.sidebarFoot}>
      <Link href="/" target="_blank" rel="noopener noreferrer" className={styles.navLink} title="View website"><ExternalLink size={18} /><span className={compact ? styles.srOnly : undefined}>View website</span></Link>
      <button className={styles.navLink} onClick={signOut} disabled={signingOut} title="Sign out"><LogOut size={18} /><span className={compact ? styles.srOnly : undefined}>{signingOut ? "Signing out…" : "Sign out"}</span></button>
    </div>
  </>;
}

export default function InternalWorkspace({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isAuth = pathname === "/internal/sign-in";
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [sessionError, setSessionError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setMounted(true); try { setCollapsed(localStorage.getItem("linescout-internal-sidebar") === "collapsed"); } catch {} }, []);
  useEffect(() => {
    document.body.dataset.linescoutInternal = "true";
    return () => { delete document.body.dataset.linescoutInternal; };
  }, []);
  useEffect(() => { setMobileOpen(false); setSearchOpen(false); setQuery(""); }, [pathname]);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!searchRef.current?.contains(event.target as Node)) setSearchOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  useEffect(() => {
    if (isAuth) { setUser(null); return; }
    const controller = new AbortController();
    setSessionError("");
    fetch("/internal/auth/me", { cache: "no-store", signal: controller.signal }).then(async response => {
      if (response.status === 401 || response.status === 403) {
        router.replace(`/internal/sign-in?next=${encodeURIComponent(pathname)}`);
        return;
      }
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error("session");
      setUser(data.user);
    }).catch(error => { if (error.name !== "AbortError") setSessionError("We couldn’t load your workspace. Check your connection and try again."); });
    return () => controller.abort();
    // Session is shared across internal page navigations; recheck after sign-in or retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuth, attempt, router]);

  if (isAuth) return <>{children}</>;
  const permitted = groups.map(group => ({ ...group, items: group.items.filter(item => user && (user.role === "admin" || (item.permission !== "admin" && user.permissions[item.permission]))) })).filter(group => group.items.length);
  const items = permitted.flatMap(group => group.items);
  const current = [...items].sort((a,b) => b.href.length-a.href.length).find(item => pathname === item.href || pathname.startsWith(item.href+"/"));
  const results = items.filter(item => item.label.toLowerCase().includes(query.toLowerCase().trim()));
  const dark = mounted && resolvedTheme === "dark";
  async function signOut() {
    setSigningOut(true);
    try {
      const response = await fetch("/api/internal/auth/sign-out", { method: "POST" });
      if (!response.ok) throw new Error("sign-out");
      router.replace("/internal/sign-in");
      router.refresh();
    } catch { setSessionError("We couldn’t sign you out. Please try again."); }
    finally { setSigningOut(false); }
  }
  function toggleCollapse() {
    setCollapsed(!collapsed);
    try { localStorage.setItem("linescout-internal-sidebar", !collapsed ? "collapsed" : "expanded"); } catch {}
  }
  const navigationProps = { permitted, currentHref: current?.href, onNavigate: () => setMobileOpen(false), signOut, signingOut };
  return <div className={styles.workspace} data-collapsed={collapsed}>
    <a href="#internal-content" className={styles.skip}>Skip to content</a>
    <aside className={styles.sidebar} aria-label="Sidebar">
      <div className={styles.sidebarHead}>{!collapsed && <Brand />}<button className={styles.iconButton} onClick={toggleCollapse} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}</button></div>
      <Navigation {...navigationProps} compact={collapsed} />
    </aside>
    <div className={styles.mainColumn}>
      <header className={styles.topbar}>
        <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
          <Dialog.Trigger asChild><button className={`${styles.iconButton} ${styles.mobileMenu}`} aria-label="Open navigation"><Menu size={22} /></button></Dialog.Trigger>
          <Dialog.Portal><Dialog.Overlay className={styles.overlay} /><Dialog.Content className={styles.mobileSidebar} aria-describedby={undefined}>
            <Dialog.Title className={styles.srOnly}>LineScout navigation</Dialog.Title>
            <div className={styles.sidebarHead}><Brand /><Dialog.Close asChild><button className={styles.iconButton} aria-label="Close navigation"><X size={21} /></button></Dialog.Close></div>
            <Navigation {...navigationProps} />
          </Dialog.Content></Dialog.Portal>
        </Dialog.Root>
        <div className={styles.search} ref={searchRef}>
          <Search size={18} aria-hidden="true" />
          <input type="search" placeholder="Find a workspace page…" aria-label="Find a workspace page" value={query} onFocus={() => setSearchOpen(true)} onChange={e => { setQuery(e.target.value); setSearchOpen(true); }} onKeyDown={e => { if(e.key === "Escape") setSearchOpen(false); if(e.key === "Enter" && results.length === 1) { router.push(results[0].href); setSearchOpen(false); } }} />
          {searchOpen && query.trim() && <div className={styles.searchResults}><p className={styles.groupLabel}>Workspace pages</p>{results.length ? results.map(item => <Link key={item.href} href={item.href} onClick={() => setSearchOpen(false)}><item.icon size={17} />{item.label}</Link>) : <p>No pages match “{query}”.</p>}</div>}
        </div>
        <div className={styles.topActions}>
          <button className={styles.iconButton} onClick={() => setTheme(dark ? "light" : "dark")} aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}>{dark ? <Sun size={20} /> : <Moon size={20} />}</button>
          <div className={styles.identity}><span className={styles.avatar} aria-hidden="true">{user?.username.slice(0,2).toUpperCase() || "LS"}</span><div><strong>{user?.username || "LineScout"}</strong><small>{user?.role === "admin" ? "Administrator" : "Workspace"}</small></div></div>
        </div>
      </header>
      <main id="internal-content" className={`${styles.content} ls-internal-content`} tabIndex={-1}>
        <div className={styles.pageHeading}><p>LINESCOUT / INTERNAL WORKSPACE</p><h1>{current?.label || "Workspace"}</h1><span>Manage your sourcing operations with clarity.</span></div>
        {sessionError && <div className={styles.error} role="alert"><CircleAlert size={20} /><p>{sessionError}</p><button onClick={() => { setSessionError(""); setAttempt(a => a+1); }}>Try again</button></div>}
        {user ? children : !sessionError && <div className={styles.loading} role="status"><LoaderCircle size={24} className={styles.spinner} /><span>Loading your workspace…</span></div>}
      </main>
    </div>
  </div>;
}
