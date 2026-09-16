"use client";

import { useState } from "react";
import { useRecaptchaV3 } from "@/lib/security/useRecaptchaV3";
import Image from "next/image";
import Link from "next/link";
import { Eye, EyeOff, CircleAlert } from "lucide-react";
import styles from "./InternalAuth.module.css";
import { useRouter, useSearchParams } from "next/navigation";

export default function InternalSignInPage() {
  const router = useRouter();
  const captcha = useRecaptchaV3();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  const safeNext = nextParam?.startsWith("/internal/") && !nextParam.startsWith("/internal/sign-in") ? nextParam : null;
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !password.trim()) {
      setError("Enter your username and password.");
      return;
    }

    setBusy(true);
    try {
      const captchaToken = await captcha("linescout_internal_sign_in");
      const res = await fetch("/api/internal/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: username.trim(), // API still expects `email`
          password,
          app: "admin",
          captchaToken,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error || data?.message || "Sign-in failed. Please try again.");
        return;
      }

      // decide landing page based on permissions
      const meRes = await fetch("/internal/auth/me", { cache: "no-store" });
      const me = await meRes.json().catch(() => null);

      const canLeads = me?.user?.role === "admin" || !!me?.user?.permissions?.can_view_leads;
      const canHandoffs = me?.user?.role === "admin" || !!me?.user?.permissions?.can_view_handoffs;

      const target = canHandoffs
        ? "/internal/agent-handoffs"
        : canLeads
        ? "/internal/leads"
        : "/internal/sign-in?next=/internal/agent-handoffs";

      router.replace(safeNext || target);
      router.refresh();

    } catch {
      setError("Sign-in could not be verified. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.layout}>
      <section className={styles.story} aria-label="LineScout operations">
        <Image src="/images/hero-background-1.png" alt="" fill sizes="50vw" priority className={styles.photo} />
        <Link href="/" className={styles.storyLogo}><Image src="/images/svg-logo-white.svg" width={180} height={38} alt="Sure Imports" /><span>LINESCOUT</span></Link>
        <div className={styles.storyCopy}><span>YOUR OPERATIONS WORKSPACE</span><h2>Every project.<br />One clear view.</h2><p>Coordinate sourcing, support your customers, and keep every order moving from enquiry to delivery.</p></div>
      </section>
      <section className={styles.workspace}>
        <div className={styles.inner}>
          <Link href="/" className={styles.mobileLogo}><Image className={styles.lightLogo} src="/images/svg-logo.svg" width={180} height={38} alt="Sure Imports" /><Image className={styles.darkLogo} src="/images/svg-logo-white.svg" width={180} height={38} alt="Sure Imports" /><span>LINESCOUT</span></Link>
          <header><span className={styles.eyebrow}>STAFF ACCESS</span><h1>Welcome back.</h1><p>Sign in to your LineScout workspace.</p></header>
          <form onSubmit={onSubmit} aria-busy={busy}>
            <div><label htmlFor="internal-username">Username</label><input id="internal-username" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="Enter your username" required disabled={busy} /></div>
            <div><label htmlFor="internal-password">Password</label><div className={styles.password}><input id="internal-password" value={password} onChange={e => setPassword(e.target.value)} type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" required disabled={busy} /><button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>{showPassword ? <EyeOff size={19} /> : <Eye size={19} />}</button></div></div>
            {error && <div className={styles.error} role="alert"><CircleAlert size={18} /><span>{error}</span></div>}
            <button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          </form>
          <p className={styles.captchaNotice}>Protected by reCAPTCHA. Google’s <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Privacy Policy</a> and <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer">Terms of Service</a> apply.</p>
          <p className={styles.help}>For authorised team members only. Need access? Contact your administrator.</p>
        </div>
      </section>
    </main>
  );
}
