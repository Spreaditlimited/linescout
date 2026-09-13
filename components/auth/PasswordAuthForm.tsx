"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { getSafeNextPath } from "@/lib/safe-next-path";
import styles from "./password-auth.module.css";

type Mode = "signin" | "signup" | "setup" | "reset" | "choose" | "change";
const copy: Record<Mode, { title: string; subtitle: string; button: string }> = {
  signin: {title:"Welcome back",subtitle:"Sign in to your LineScout sourcing workspace.",button:"Sign in"},
  signup: {title:"Create your account",subtitle:"Verify your email, choose a password, and start sourcing.",button:"Send verification link"},
  setup: {title:"Set your password",subtitle:"Already used LineScout with an email code? Set a password for your existing account. Your projects and balance stay unchanged.",button:"Send setup link"},
  reset: {title:"Forgot your password?",subtitle:"We’ll email you a secure link to choose a new password.",button:"Send reset link"},
  choose: {title:"Choose your password",subtitle:"Use a long, unique password to protect your account.",button:"Save password"},
  change: {title:"Account password",subtitle:"Change your password. Other signed-in devices will be signed out.",button:"Change password"},
};

export default function PasswordAuthForm({ mode = "signin" }: { mode?: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [currentPassword,setCurrentPassword] = useState("");
  const [confirm,setConfirm] = useState("");
  const [visible,setVisible] = useState(false);
  const tokenRead = useRef(false);
  const [token,setToken] = useState("");
  const [ready,setReady] = useState(mode !== "choose");
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState<{error:boolean;text:string}|null>(null);
  const [complete,setComplete] = useState(false);
  const [nextPath,setNextPath] = useState("");
  const next = getSafeNextPath(params.get("next"));
  const suffix = next ? `?next=${encodeURIComponent(next)}` : "";
  const content = copy[mode];
  const Heading = mode === "change" ? "h2" : "h1";
  const hasPassword = ["signin","choose","change"].includes(mode);

  useEffect(()=>{
    if(mode !== "choose" || tokenRead.current) return;
    tokenRead.current = true;
    const value = new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
    setToken(value);
    setReady(true);
    if(!/^[a-f0-9]{64}$/.test(value)) setNotice({error:true,text:"This password link is missing or invalid. Request a new link below."});
    // No query string token, no referrer leakage, no token retained in browser history.
    if(value) window.history.replaceState(null,"",window.location.pathname);
  },[mode]);

  useEffect(()=>{
    if(mode !== "signin") return;
    let active=true;
    fetch("/api/auth/me",{credentials:"include"}).then(res=>{if(res.ok && active) router.replace(next || "/dashboard");}).catch(()=>{});
    return ()=>{active=false;};
  },[mode,next,router]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(busy) return;
    setNotice(null);
    if((mode === "choose" || mode === "change") && password !== confirm) {setNotice({error:true,text:"The passwords do not match."});return;}
    setBusy(true);
    try {
      const action = mode === "signin" ? "sign-in" : mode === "choose" ? "set-password" : mode === "change" ? "change-password" : "email-link";
      const res = await fetch(`/api/auth/password/${action}`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password,currentPassword,token,next,purpose:mode})});
      const data = await res.json().catch(()=>({}));
      if(!res.ok || !data.ok) throw new Error(data.error || "We could not complete this request. Please try again.");
      if(mode === "signin") { router.replace(getSafeNextPath(data.next) || "/dashboard"); router.refresh(); return; }
      setNotice({error:false,text:data.message || "Your password has been updated."});
      setPassword("");setConfirm("");setCurrentPassword("");
      setNextPath(getSafeNextPath(data.next));
      if(mode !== "change") setComplete(true);
    } catch(error) {setNotice({error:true,text:error instanceof Error ? error.message : "Check your connection and try again."});}
    finally {setBusy(false);}
  }

  return <section className={styles.formPanel} aria-labelledby={`auth-title-${mode}`}>
    <header><p className={styles.eyebrow}>LINESCOUT</p><Heading id={`auth-title-${mode}`}>{content.title}</Heading><p>{content.subtitle}</p></header>
    {notice ? <div className={notice.error ? styles.error : styles.success} role={notice.error ? "alert" : "status"}>{notice.text}</div> : null}
    {!complete ? <form onSubmit={submit} className={styles.form}>
      {!hasPassword || mode === "signin" ? <label>Email address<input type="email" name="email" autoComplete="email" required maxLength={200} value={email} onChange={e=>setEmail(e.target.value)} /></label> : null}
      {mode === "change" ? <label>Current password<input type={visible ? "text":"password"} name="currentPassword" autoComplete="current-password" required value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} /></label> : null}
      {hasPassword ? <label>{mode === "signin" ? "Password":"New password"}<div className={styles.passwordField}><input type={visible ? "text":"password"} name="password" autoComplete={mode === "signin" ? "current-password":"new-password"} required minLength={mode === "signin" ? undefined : 15} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} /><button type="button" aria-label={visible ? "Hide password":"Show password"} aria-pressed={visible} onClick={()=>setVisible(!visible)}>{visible ? <EyeOff size={19}/>:<Eye size={19}/>}</button></div>{mode !== "signin" ? <small>At least 15 characters. A few unrelated words make a good passphrase.</small>:null}</label> : null}
      {mode === "choose" || mode === "change" ? <label>Confirm new password<input type={visible ? "text":"password"} name="confirmPassword" autoComplete="new-password" required minLength={15} maxLength={128} value={confirm} onChange={e=>setConfirm(e.target.value)} /></label> : null}
      {mode === "signin" ? <Link className={styles.recovery} href={`/forgot-password${suffix}`}>Forgot password?</Link>:null}
      <button className={styles.primary} disabled={busy || !ready || (mode === "choose" && !token)} type="submit">{busy ? "Please wait…":content.button}</button>
    </form> : mode === "choose" ? <Link className={styles.primary} href={`/sign-in${nextPath ? `?next=${encodeURIComponent(nextPath)}`:""}`}>Sign in</Link> : <button type="button" className={styles.secondary} onClick={()=>{setComplete(false);setNotice(null);}}>Use another email or resend</button>}
    <div className={styles.links}>
      {mode === "signin" ? <><p>New to LineScout? <Link href={`/sign-up${suffix}`}>Create an account</Link></p><p>Previously signed in with a code? <Link href={`/set-up-password${suffix}`}>Set your password</Link></p></>:mode === "change" ? <Link href="/set-up-password">Set your first password by email</Link>:<Link href={`/sign-in${suffix}`}>Back to sign in</Link>}
      {mode === "choose" && !complete ? <Link href="/forgot-password">Request a new password link</Link>:null}
    </div>
  </section>;
}
